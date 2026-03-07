"""
server.py — The central hub of the Lecture Capture System.

This file does four things:
  1. Runs the FastAPI web server that student browsers connect to
  2. Manages WebSocket connections so updates are pushed in real time
  3. Starts the background camera and audio capture threads
  4. Saves the session notes and transcript to files when the server shuts down

FastAPI is an "async" web framework, meaning it can handle many browser
connections at once without blocking. The camera and audio loops run in
separate threads (not async) because recording and API calls are blocking
operations — they take time and would freeze the server if run directly.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from pathlib import Path

import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai

from ai import analyze_whiteboard, transcribe_audio
from capture import start_audio_loop, start_camera_loop

# ---------------------------------------------------------------------------
# Startup configuration
# ---------------------------------------------------------------------------

# load_dotenv() reads the .env file and loads GEMINI_API_KEY and
# ELEVENLABS_API_KEY into the process environment so os.getenv() can find them.
# This must happen before any code tries to read those variables.
load_dotenv()

# Set up logging so we can see what the server is doing in the terminal.
# FORMAT: "2026-03-07 12:00:00 [server] INFO: message"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Create the FastAPI application object. This is the "app" that uvicorn runs.
app = FastAPI(title="Lecture Capture System")

# Tell FastAPI to serve files from the "static" folder.
# Path(__file__).parent finds the directory this script lives in,
# then we append "static" to get the full path to our HTML file.
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
# These variables are shared across the main thread (WebSocket connections)
# and the background threads (camera and audio loops). Python's GIL makes
# simple string/set assignments thread-safe enough for our use case.

# The full whiteboard notes accumulated so far, as a Markdown+LaTeX string.
# Each Gemini response delta gets appended here.
whiteboard_notes: str = ""

# The full transcript accumulated so far, as a plain text string.
# Each ElevenLabs response gets appended here.
transcript: str = ""

# The set of all currently connected WebSocket clients (browser tabs).
# We use a set (not a list) so adding/removing clients is O(1) and
# duplicates are automatically prevented.
connected_clients: set[WebSocket] = set()

# The Gemini API client, created once at startup and shared across all calls.
# Creating a client is expensive (network handshake), so we do it once.
gemini_client: genai.Client | None = None

# A reference to the main asyncio event loop. Background threads need this
# to safely schedule async functions (like broadcast) from non-async code.
_main_loop: asyncio.AbstractEventLoop | None = None

# ---------------------------------------------------------------------------
# WebSocket broadcast
# ---------------------------------------------------------------------------

async def broadcast(message: dict) -> None:
    """
    Send a JSON message to every currently connected browser client.

    This is an async function — it uses 'await' to send to each client
    without blocking other operations. If a client has disconnected without
    telling us (e.g. closed the tab mid-session), the send will throw an
    exception. We catch those and remove the dead client from our set.

    Args:
        message: A Python dict that will be serialized to a JSON string.
                 Expected keys: "type", "delta", "full".
    """
    if not connected_clients:
        return  # No one is connected — nothing to do.

    # json.dumps() converts the Python dict to a JSON string like:
    # '{"type": "whiteboard", "delta": "...", "full": "..."}'
    data = json.dumps(message)

    # We can't modify connected_clients while iterating over it, so we
    # collect any dead connections in a separate set and remove them after.
    dead: set[WebSocket] = set()

    for ws in connected_clients:
        try:
            await ws.send_text(data)
        except Exception:
            # This client disconnected unexpectedly — mark it for removal.
            dead.add(ws)

    # Remove all disconnected clients from the active set.
    connected_clients.difference_update(dead)


def broadcast_sync(message: dict) -> None:
    """
    Thread-safe wrapper that lets background threads trigger broadcast().

    The problem: broadcast() is an async function that must run on the main
    event loop. Background threads (camera, audio) are NOT async — they can't
    use 'await' directly. asyncio.run_coroutine_threadsafe() is the bridge:
    it schedules the async function to run on the main loop from a regular thread.

    Args:
        message: The dict to broadcast (same format as broadcast()).
    """
    if _main_loop is None:
        return  # Server hasn't fully started yet — skip.

    # This is the key threading bridge. It schedules broadcast(message) to run
    # on _main_loop (the main thread's event loop) and returns a Future object.
    # We don't need to wait for the result, so we don't store the Future.
    asyncio.run_coroutine_threadsafe(broadcast(message), _main_loop)


# ---------------------------------------------------------------------------
# Capture callbacks
# ---------------------------------------------------------------------------
# These functions are passed as callbacks to the camera and audio loops in
# capture.py. Each loop calls its callback every 5 seconds with new data.

def on_frame(frame: np.ndarray) -> None:
    """
    Called by the camera loop every 5 seconds with a new camera frame.

    Sends the frame to Gemini, gets back any new whiteboard content,
    appends it to the running notes, and broadcasts the update.

    Args:
        frame: A numpy array (height × width × 3 BGR pixels) from OpenCV.
    """
    global whiteboard_notes  # We need to modify this module-level variable.

    logger.info("Processing whiteboard frame...")

    try:
        # analyze_whiteboard() handles encoding the frame and calling Gemini.
        # It returns only the NEW content since the last capture (the "delta").
        delta = analyze_whiteboard(gemini_client, frame, whiteboard_notes)
    except Exception:
        # Log the full error with stack trace but keep the server running.
        # One failed Gemini call should not crash the whole session.
        logger.exception("Gemini Vision call failed")
        return

    if delta:
        # Append the new content to the running notes with a blank line between
        # sections. .strip() removes any leading/trailing whitespace.
        whiteboard_notes = (whiteboard_notes + "\n\n" + delta).strip()

        # Broadcast the update to all connected browsers.
        # We send both the delta (just what's new) and the full document so
        # late-joining students can catch up by reading "full".
        broadcast_sync({
            "type": "whiteboard",
            "delta": delta,
            "full": whiteboard_notes,
        })
        logger.info("Whiteboard updated (%d chars total)", len(whiteboard_notes))
    else:
        logger.info("No new whiteboard content detected")


def on_audio(chunk: np.ndarray) -> None:
    """
    Called by the audio loop every 5 seconds with a new audio chunk.

    Sends the chunk to ElevenLabs, gets back the transcribed text,
    appends it to the running transcript, and broadcasts the update.

    Args:
        chunk: A 1-D float32 numpy array of 5 seconds of audio at 16kHz.
    """
    global transcript  # We need to modify this module-level variable.

    logger.info("Transcribing audio chunk...")

    try:
        text = transcribe_audio(chunk)
    except Exception:
        logger.exception("ElevenLabs transcription failed")
        return

    if text:
        # Append the new text with a space separator.
        transcript = (transcript + " " + text).strip()

        broadcast_sync({
            "type": "transcript",
            "delta": text,
            "full": transcript,
        })
        # Only log the first 80 chars to keep the terminal readable.
        logger.info("Transcript updated: %s", text[:80])
    else:
        logger.info("Empty transcription (silence or no speech detected)")


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------

@app.get("/")
async def index():
    """
    Serve the student-facing HTML page at the root URL (http://localhost:8000).

    FileResponse sends the file contents as the HTTP response. The browser
    receives index.html and renders it, then the JavaScript in that file
    immediately opens a WebSocket connection back to /ws.
    """
    return FileResponse(STATIC_DIR / "index.html")


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Handle a single student's WebSocket connection for the duration of their session.

    WebSockets are different from regular HTTP requests. A regular request is
    like sending a letter and getting one reply. A WebSocket is like a phone
    call — the connection stays open and both sides can send messages at any
    time. This is what allows us to push live updates to the browser.

    Args:
        websocket: The WebSocket connection object provided by FastAPI.
    """
    # Accept the connection — this completes the WebSocket handshake.
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info("Client connected (%d total)", len(connected_clients))

    # Send the current full state immediately so late-joining students see
    # everything captured so far, not just future updates.
    await websocket.send_text(json.dumps({
        "type": "whiteboard",
        "delta": "",        # No new delta — this is catch-up data.
        "full": whiteboard_notes,
    }))
    await websocket.send_text(json.dumps({
        "type": "transcript",
        "delta": "",
        "full": transcript,
    }))

    try:
        # Keep the connection open by waiting for messages.
        # The browser sends a "ping" keepalive every 20 seconds.
        # We don't need to do anything with it — just receiving keeps the
        # connection alive. If the client disconnects, receive_text() raises
        # WebSocketDisconnect which we catch below.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass  # Normal — student closed their tab or lost connection.
    finally:
        # Always remove the client from our set when they disconnect,
        # whether the disconnection was clean or not.
        connected_clients.discard(websocket)
        logger.info("Client disconnected (%d remaining)", len(connected_clients))


# ---------------------------------------------------------------------------
# Startup and shutdown hooks
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    """
    Run once when the server starts. Initializes API clients and starts threads.

    on_event("startup") is FastAPI's way of running code before the server
    begins accepting requests. We use it to:
      - Create the Gemini client (which authenticates with Google)
      - Save a reference to the running event loop (for broadcast_sync)
      - Start the camera and audio background threads
    """
    global gemini_client, _main_loop

    # Validate that the Gemini key is present before trying to use it.
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise RuntimeError(
            "GEMINI_API_KEY not set. Add it to your .env file and restart."
        )

    elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")
    if not elevenlabs_key:
        raise RuntimeError(
            "ELEVENLABS_API_KEY not set. Add it to your .env file and restart."
        )

    # Create the Gemini client. This does NOT make an API call yet — it just
    # sets up the authenticated client object ready for use.
    gemini_client = genai.Client(api_key=gemini_key)

    # Get a reference to the currently running asyncio event loop.
    # asyncio.get_running_loop() only works inside an async function,
    # which is why we capture it here at startup and store it globally.
    # Background threads will use this reference in broadcast_sync().
    _main_loop = asyncio.get_running_loop()

    # Start the camera and audio loops as background daemon threads.
    # "daemon=True" (set inside capture.py) means these threads will
    # automatically stop when the main program exits — we don't have to
    # manually shut them down.
    start_camera_loop(on_frame)
    start_audio_loop(on_audio)

    logger.info("Lecture Capture System started. Open http://localhost:8000")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Run once when the server shuts down (Ctrl+C). Saves session files.

    We save both the whiteboard notes and the full transcript to timestamped
    Markdown files. This means the lecturer has a permanent record of each
    session even after the server stops.

    File naming: notes_2026-03-07_143022.md (YYYY-MM-DD_HHMMSS format)
    """
    # Create a timestamp string for the filename.
    # datetime.now() gets the current local time.
    # strftime() formats it as a string: "2026-03-07_143022"
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")

    # Save whiteboard notes.
    if whiteboard_notes.strip():
        notes_path = Path(f"notes_{timestamp}.md")
        notes_path.write_text(whiteboard_notes, encoding="utf-8")
        logger.info("Whiteboard notes saved to %s", notes_path)

    # Save transcript.
    if transcript.strip():
        transcript_path = Path(f"transcript_{timestamp}.md")
        transcript_path.write_text(transcript, encoding="utf-8")
        logger.info("Transcript saved to %s", transcript_path)

    if not whiteboard_notes.strip() and not transcript.strip():
        logger.info("Nothing to save — session was empty.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # This block only runs when you execute "python server.py" directly.
    # uvicorn is the ASGI server that actually runs the FastAPI app.
    # host="127.0.0.1" means only this machine can connect (localhost only).
    # To go live later: change to host="0.0.0.0" so other devices can connect.
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
