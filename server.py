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
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import base64
from io import BytesIO
from PIL import Image
from google import genai

from ai import analyze_whiteboard
from capture import start_camera_loop, start_streaming_audio_loop

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

# ---------------------------------------------------------------------------
# Lifespan — startup and shutdown logic
# ---------------------------------------------------------------------------
# The modern FastAPI way to run code at startup and shutdown is a "lifespan"
# async context manager. Think of it like a with-block that wraps the entire
# server lifetime:
#
#   with lifespan(app):
#       run the server...       ← the yield is where the server runs
#
# Everything BEFORE yield runs once at startup (before any requests are handled).
# Everything AFTER yield runs once at shutdown (after the last request is done).
# This replaces the old @app.on_event("startup") / @app.on_event("shutdown")
# decorators which are deprecated in modern FastAPI.

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage the full lifetime of the server: startup setup and shutdown cleanup.

    On startup:
      - Validate API keys exist in the environment
      - Create the Gemini client (authenticated, ready to call)
      - Capture a reference to the running event loop (needed by background threads)
      - Start the camera capture thread
      - Start the audio capture thread

    On shutdown (triggered by Ctrl+C):
      - Save the accumulated whiteboard notes to a timestamped .md file
      - Save the accumulated transcript to a timestamped .md file
    """
    # --- STARTUP ---
    global gemini_client, _main_loop

    # Validate that both API keys are present before starting anything.
    # It's better to fail loudly here than to silently fail on the first
    # API call 5 seconds into the session.
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

    # Capture a reference to the currently running asyncio event loop.
    # asyncio.get_running_loop() only works inside an async function, which
    # is why we capture it here at startup and store it as a global.
    # Background threads (camera, audio) will use this in broadcast_sync()
    # to safely hand work back to the async main thread.
    _main_loop = asyncio.get_running_loop()

    # Start the camera and audio loops as daemon threads.
    # daemon=True means these threads automatically die when the main program
    # exits — we don't need to manually stop them.
    start_camera_loop(on_frame)
    start_streaming_audio_loop(on_transcript_text)

    logger.info("Lecture Capture System started. Open http://localhost:8000")

    # --- SERVER RUNS HERE ---
    # yield hands control back to FastAPI. The server is now live and
    # accepting connections. This line "pauses" until shutdown is triggered.
    yield

    # --- SHUTDOWN (everything below runs after Ctrl+C) ---
    # Create a timestamp string for the filenames.
    # strftime() formats a datetime as a string: "2026-03-07_143022"
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")

    if whiteboard_notes.strip():
        notes_path = Path(f"notes_{timestamp}.md")
        notes_path.write_text(whiteboard_notes, encoding="utf-8")
        logger.info("Whiteboard notes saved to %s", notes_path)

    if transcript.strip():
        transcript_path = Path(f"transcript_{timestamp}.md")
        transcript_path.write_text(transcript, encoding="utf-8")
        logger.info("Transcript saved to %s", transcript_path)

    if not whiteboard_notes.strip() and not transcript.strip():
        logger.info("Nothing to save — session was empty.")


# Create the FastAPI application object, wiring in our lifespan manager.
# lifespan=lifespan tells FastAPI: "use this function to handle startup
# and shutdown" instead of the old @app.on_event decorators.
app = FastAPI(title="Lecture Capture System", lifespan=lifespan)

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

    Sends the frame + current notes to Gemini, which returns an intelligently
    merged update: new content added, changed content updated, blocked content
    preserved. Broadcasts the result if anything changed.

    Args:
        frame: A numpy array (height × width × 3 BGR pixels) from OpenCV.
    """
    global whiteboard_notes  # We need to modify this module-level variable.

    logger.info("Processing whiteboard frame...")

    try:
        # analyze_whiteboard() performs an AI-assisted merge: it compares the
        # current camera frame against the existing notes and returns an updated
        # version that preserves blocked content, updates changed content, and
        # adds new content. Gemini does the diffing — we just pass it both.
        updated_notes = analyze_whiteboard(gemini_client, frame, whiteboard_notes)
    except Exception:
        # Log the full error with stack trace but keep the server running.
        # One failed Gemini call should not crash the whole session.
        logger.exception("Gemini Vision call failed")
        return

    if updated_notes != whiteboard_notes:
        # Gemini detected a change — replace the notes with the merged result.
        whiteboard_notes = updated_notes

        broadcast_sync({
            "type": "whiteboard",
            "delta": "",
            "full": whiteboard_notes,
        })
        logger.info("Whiteboard updated (%d chars total)", len(whiteboard_notes))
    else:
        logger.info("Whiteboard unchanged — no broadcast needed")


def on_transcript_text(text: str) -> None:
    """
    Called by the streaming audio loop whenever ElevenLabs commits a transcript segment.

    Unlike the old on_audio() which received a raw numpy array and had to upload
    it to ElevenLabs itself, this callback receives already-transcribed text.
    The streaming loop in capture.py handles the WebSocket connection and VAD;
    this function just appends the result and broadcasts it.

    Args:
        text: The committed transcript text for one speech segment (a sentence
              or clause that ElevenLabs detected ended with a pause).
    """
    global transcript

    transcript = (transcript + " " + text).strip()

    broadcast_sync({
        "type": "transcript",
        "delta": text,
        "full": transcript,
    })
    logger.info("Transcript: %s", text[:80])


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

@app.get("/canvas")
async def canvas():
    """
    Serve the AI Canvas Mode student-facing HTML page.
    """
    return FileResponse(STATIC_DIR / "canvas.html")

class CanvasChatRequest(BaseModel):
    image_base64: str | None = None
    message: str
    attachment_base64: str | None = None

@app.post("/api/canvas-chat")
async def canvas_chat(request: CanvasChatRequest):
    """
    Receive the drawing from the canvas and a user message, and query Gemini 1.5 Pro.
    """
    try:
        # Prepare the conversation history/content
        contents = [request.message]

        # Decode the base64 canvas image coming from the browser (if any drawings exist)
        if request.image_base64:
            img_data = request.image_base64
            if "," in img_data:
                img_data = img_data.split(",")[1]
                
            img_bytes = base64.b64decode(img_data)
            img = Image.open(BytesIO(img_bytes))
            contents.insert(0, img)
            contents.insert(0, "This is the current state of the user's drawing canvas:")

        # If there's an attached image, decode it and add it
        if request.attachment_base64:
            att_data = request.attachment_base64
            if "," in att_data:
                att_data = att_data.split(",")[1]
            att_bytes = base64.b64decode(att_data)
            att_img = Image.open(BytesIO(att_bytes))
            contents.insert(0, att_img)
            contents.insert(0, "This is the image file the user attached to their message:")

        # Ask Gemini to respond based on the image using a faster, more available model
        response = gemini_client.models.generate_content(
            model="gemini-2.5-flash", # Switched to flash to avoid 503 high demand errors
            contents=contents
        )
        return {"response": response.text}
    except Exception as e:
        logger.exception("Canvas Chat Error")
        return {"error": str(e)}


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
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # This block only runs when you execute "python server.py" directly.
    # uvicorn is the ASGI server that actually runs the FastAPI app.
    # host="127.0.0.1" means only this machine can connect (localhost only).
    # To go live later: change to host="0.0.0.0" so other devices can connect.
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
