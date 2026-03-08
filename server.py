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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from pydantic import BaseModel

from ai import analyze_whiteboard, answer_question
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
    start_streaming_audio_loop(on_transcript_text, on_partial_text)

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

# ---------------------------------------------------------------------------
# CORS middleware (for Vite dev server)
# ---------------------------------------------------------------------------
# CORS (Cross-Origin Resource Sharing) is a browser security policy that
# blocks JavaScript on one origin (e.g. localhost:5173) from fetching
# resources from a different origin (e.g. localhost:8000).
#
# During development, the React app runs on Vite's port 5173, but the
# WebSocket server is on port 8000. Without CORS headers, the browser would
# block the WebSocket connection. This middleware adds the necessary headers.
#
# In production (npm run build → python server.py), React is served directly
# by FastAPI on port 8000, so both origins are the same and CORS isn't needed.
# The middleware is harmless in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default dev server port
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static file directories
# ---------------------------------------------------------------------------
# DIST_DIR is where `npm run build` (inside the frontend/ folder) outputs the
# compiled React app. It doesn't exist until you run the build command.
# STATIC_DIR is the original plain HTML fallback, used if the build hasn't run.
DIST_DIR   = Path(__file__).parent / "frontend" / "dist"
STATIC_DIR = Path(__file__).parent / "static"

# Mount Vite's compiled asset files (/assets/*.js, /assets/*.css).
# Vite always outputs JS and CSS to a subfolder called "assets/" inside dist/.
# We mount that subfolder at the /assets URL path so the browser can fetch them.
#
# This mount must be registered BEFORE the catch-all @app.get("/{full_path}")
# route below, or FastAPI would intercept /assets/... requests and return
# index.html instead of the actual JS/CSS files.
if DIST_DIR.exists() and (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

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
# Lecture event log
# ---------------------------------------------------------------------------
# A chronological record of every speech segment and whiteboard change that
# occurred during this session. This is used by the /api/chat endpoint to
# give Gemini full lecture context when answering student questions.
#
# Each entry is one of:
#   {"time": "14:32:07", "type": "speech",     "text":    "...sentence..."}
#   {"time": "14:32:15", "type": "whiteboard", "content": "{...json...}"}
lecture_events: list[dict] = []


# ---------------------------------------------------------------------------
# Chat request model
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    """
    The JSON body expected by POST /api/chat.

    Pydantic models are used by FastAPI to automatically parse and validate
    the request body. If a required field is missing or the wrong type,
    FastAPI returns a 422 error automatically — no manual validation needed.

    Attributes:
        question: The student's question about the lecture content.
    """
    question: str


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
    Called by the camera loop with each new camera frame.

    Sends the frame + current notes to Gemini, which returns the complete
    current state of the board. Gemini handles all add/update/delete logic:
    - New content is added as new cells
    - Changed content is updated in-place
    - Erased content (clearly visible empty area) is omitted
    - Content behind a person/obstruction is preserved

    Args:
        frame: A numpy array (height × width × 3 BGR pixels) from OpenCV.
    """
    global whiteboard_notes

    logger.info("Processing whiteboard frame...")

    try:
        updated_notes = analyze_whiteboard(gemini_client, frame, whiteboard_notes)
    except Exception:
        logger.exception("Gemini Vision call failed")
        return

    # Parse Gemini's response and the existing grid.
    try:
        current        = json.loads(whiteboard_notes) if whiteboard_notes else {}
        proposed       = json.loads(updated_notes)    if updated_notes   else {}
        current_cells  = current.get("cells",   [])
        proposed_cells = proposed.get("cells",   [])
        # columns is now an array of proportional weights, e.g. [1, 2, 1].
        # Fall back to three equal columns if Gemini omitted it.
        columns        = proposed.get("columns", current.get("columns", [1, 1, 1]))
    except (json.JSONDecodeError, AttributeError):
        return

    # Trust Gemini's output as the authoritative current state of the board.
    # The prompt instructs Gemini to:
    #   - Include all visible content (additions + updates)
    #   - Omit content that was clearly erased from an unobstructed area (deletions)
    #   - Preserve cells that might be hidden behind a person or obstruction
    # So we use proposed_cells directly — no union merge needed.
    final_notes = json.dumps({"columns": columns, "cells": proposed_cells})

    if final_notes != whiteboard_notes:
        whiteboard_notes = final_notes
        broadcast_sync({
            "type": "whiteboard",
            "delta": "",
            "full": whiteboard_notes,
        })
        logger.info("Whiteboard updated (%d cells)", len(proposed_cells))

        # Record this whiteboard change in the lecture event log so students
        # can ask questions about specific board states via /api/chat.
        lecture_events.append({
            "time": datetime.now().strftime("%H:%M:%S"),
            "type": "whiteboard",
            "content": whiteboard_notes,
        })
    else:
        logger.info("Whiteboard unchanged — no broadcast needed")


def on_partial_text(text: str) -> None:
    """
    Called continuously while the professor is speaking — ElevenLabs' best
    guess at the current words before the sentence is finished. Broadcast as
    a separate message type so the browser can show it as in-progress text.
    """
    broadcast_sync({
        "type": "transcript_partial",
        "text": text,
    })


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

    # Record this committed speech segment in the lecture event log.
    # Only committed segments (full sentences) are logged — not partials —
    # because partials change rapidly and the final committed text is what matters.
    lecture_events.append({
        "time": datetime.now().strftime("%H:%M:%S"),
        "type": "speech",
        "text": text,
    })

    broadcast_sync({
        "type": "transcript",
        "delta": text,
        "full": transcript,
    })
    logger.info("Transcript: %s", text[:80])


# ---------------------------------------------------------------------------
# HTTP routes
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Chat helpers
# ---------------------------------------------------------------------------

def _build_context() -> str:
    """
    Format the lecture event log into a single chronological context string
    to pass to Gemini when answering a student's question.

    Each line is prefixed with a timestamp and the event type (SPEECH or
    WHITEBOARD) so Gemini can reason about the sequence of events during class.

    Returns:
        A multi-line string like:
          [14:30:00] WHITEBOARD: {"columns": [...], "cells": [...]}
          [14:30:22] SPEECH: "So as we can see from this equation..."
        Returns a message saying the session just started if there are no events yet.
    """
    if not lecture_events:
        return "(No lecture content captured yet — the session may have just started.)"

    lines = []
    for event in lecture_events:
        timestamp = event["time"]
        if event["type"] == "speech":
            lines.append(f"[{timestamp}] SPEECH: {event['text']}")
        elif event["type"] == "whiteboard":
            lines.append(f"[{timestamp}] WHITEBOARD: {event['content']}")
    return "\n".join(lines)


@app.post("/api/chat")
async def chat_endpoint(body: ChatRequest) -> dict:
    """
    Answer a student's question using the full lecture context captured so far.

    Accepts a JSON body like {"question": "What is Newton's second law?"}.
    Builds a chronological lecture log from lecture_events, sends it to Gemini
    with the student's question, and returns Gemini's answer.

    Args:
        body: A ChatRequest Pydantic model automatically parsed from the JSON body.

    Returns:
        A dict like {"answer": "..."} — FastAPI serialises this to JSON automatically.
    """
    context = _build_context()
    try:
        answer = answer_question(gemini_client, context, body.question)
    except Exception:
        logger.exception("Chat Gemini call failed")
        answer = "Sorry, I couldn't process your question right now. Please try again."
    return {"answer": answer}


@app.get("/")
async def index():
    """
    Serve the student-facing page at the root URL (http://localhost:8000).

    Prefers the Vite-built React app (frontend/dist/index.html) when it exists.
    Falls back to the original static/index.html if the build hasn't been run yet.

    FileResponse sends the file contents as the HTTP response. The browser
    receives index.html and renders it. For the React app, the HTML is just a
    shell that loads the compiled JavaScript bundle, which mounts the app.
    """
    dist_index = DIST_DIR / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)
    # Fallback: original vanilla JS frontend (still works if dist/ doesn't exist)
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """
    Catch-all route: serve index.html for any URL the server doesn't recognize.

    This is required for Single Page Applications (SPAs) like our React app.
    In a SPA, React handles routing in the browser (client-side routing). If a
    student bookmarks or refreshes a URL like /notes/session-1, the browser
    sends a GET request for that path to the server. Without this catch-all,
    FastAPI would return a 404 because it doesn't know about /notes/session-1.
    With this catch-all, the server returns index.html and React takes over,
    reading the URL and rendering the right content.

    The {full_path:path} parameter captures everything after the leading /,
    including slashes. We ignore it — our job is just to return the SPA shell.

    Note: FastAPI evaluates routes in registration order. The /assets mount and
    /ws WebSocket endpoint are registered first, so they are matched before this
    catch-all. This catch-all only fires for paths that nothing else matched.
    """
    dist_index = DIST_DIR / "index.html"
    if dist_index.exists():
        return FileResponse(dist_index)
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
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # This block only runs when you execute "python server.py" directly.
    # uvicorn is the ASGI server that actually runs the FastAPI app.
    # host="127.0.0.1" means only this machine can connect (localhost only).
    # To go live later: change to host="0.0.0.0" so other devices can connect.
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
