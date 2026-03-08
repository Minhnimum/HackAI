"""
capture.py — Camera frame capture and microphone audio recording loops.

Each loop runs in its own daemon thread and calls a provided callback
with the raw data so server.py can process and broadcast it.
"""
import asyncio
import base64
import json
import logging
import os
import queue
import threading
import time
from typing import Callable, Optional

import cv2
import numpy as np
import sounddevice as sd
import websockets

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CAMERA_INDEX = 2          # External webcam (index confirmed via enumeration)
FRAME_INTERVAL = 3.0      # Seconds between whiteboard captures

SAMPLE_RATE = 16000       # Hz — ElevenLabs expects 16 kHz for speech transcription
AUDIO_CHANNELS = 1
AUDIO_BLOCK_MS = 250      # Milliseconds of audio per sounddevice callback (250ms chunks)

# ElevenLabs real-time STT WebSocket endpoint.
# Query parameters:
#   model_id=scribe_v2_realtime  — the streaming-capable model (not the batch scribe_v2)
#   audio_format=pcm_16000       — raw 16-bit PCM at 16kHz, matching sounddevice output
#   commit_strategy=vad          — Voice Activity Detection: ElevenLabs automatically
#                                  detects when a speech segment ends and commits it,
#                                  so we never need to manually send a "commit" message
#   vad_silence_threshold_secs=0.8 — commit a segment after 0.8s of silence
ELEVENLABS_WS_URL = (
    "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
    "?model_id=scribe_v2_realtime"
    "&audio_format=pcm_16000"
    "&commit_strategy=vad"
    "&vad_silence_threshold_secs=0.8"
)

# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------

def start_camera_loop(
    on_frame: Callable[[np.ndarray], None],
    camera_index: int = CAMERA_INDEX,
) -> threading.Thread:
    """
    Start a background daemon thread that captures frames as fast as possible
    and calls on_frame(frame) for each one.

    Why no sleep / interval?
        The old design opened and closed the camera on every frame, then slept
        for 3 seconds. Opening a USB camera on Windows takes 0.5–2 seconds each
        time, making the real cycle 5–8 seconds even though we intended 3.

        Now the camera is opened ONCE and kept open. cap.read() is fast (~16ms).
        on_frame() calls Gemini, which takes 1–3 seconds — that IS the rate
        limiter. As soon as Gemini responds we immediately read the next frame
        and call Gemini again. This gives the fastest possible refresh rate
        with no wasted waiting.

    Returns the thread (already started).
    """
    def _loop():
        # Helper that opens the camera and waits for it to warm up.
        # On Windows, USB cameras often report isOpened()=True before the
        # hardware is actually ready to deliver frames. The 2-second sleep
        # gives the driver time to initialize so cap.read() succeeds.
        def open_camera():
            cap = cv2.VideoCapture(camera_index)
            if not cap.isOpened():
                return None
            time.sleep(2.0)  # warmup — wait for USB camera to be ready
            return cap

        cap = open_camera()
        if cap is None:
            logger.error("Could not open camera at index %d", camera_index)
            return

        logger.info("Camera loop started (index=%d, continuous)", camera_index)
        consecutive_failures = 0
        MAX_FAILURES = 20  # ~2s of failures before we try re-opening

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    consecutive_failures += 1
                    logger.warning(
                        "Failed to read frame — retrying (%d/%d)",
                        consecutive_failures, MAX_FAILURES,
                    )
                    time.sleep(0.1)

                    # After too many consecutive failures, the camera may have
                    # disconnected or stalled. Re-open it from scratch.
                    if consecutive_failures >= MAX_FAILURES:
                        logger.warning("Too many failures — re-opening camera")
                        cap.release()
                        cap = open_camera()
                        if cap is None:
                            logger.error("Could not re-open camera — giving up")
                            return
                        consecutive_failures = 0
                    continue

                # Successful read — reset the failure counter.
                consecutive_failures = 0
                try:
                    on_frame(frame)
                except Exception:
                    logger.exception("Error in on_frame callback")
        finally:
            cap.release()

    t = threading.Thread(target=_loop, daemon=True, name="camera-loop")
    t.start()
    return t


# ---------------------------------------------------------------------------
# Microphone — real-time streaming via ElevenLabs WebSocket
# ---------------------------------------------------------------------------

def start_streaming_audio_loop(
    on_transcript: Callable[[str], None],
    on_partial: Callable[[str], None] = lambda _: None,
    sample_rate: int = SAMPLE_RATE,
) -> threading.Thread:
    """
    Start a background daemon thread that streams microphone audio to ElevenLabs
    in real time and calls on_transcript(text) whenever speech is committed.

    How this works (vs. the old batch approach):

        OLD (batch):
            Record 5s → upload WAV → wait for response → get text
            Latency: 5s recording + 1-2s API round trip = 6-7s per update

        NEW (streaming):
            sounddevice captures 250ms chunks continuously via a callback.
            Each chunk is base64-encoded and sent over a persistent WebSocket.
            ElevenLabs' VAD (Voice Activity Detection) detects when a sentence
            ends (0.8s of silence) and fires a committed_transcript event.
            on_transcript() is called within ~1s of the professor finishing a sentence.

    Architecture — two async tasks run concurrently inside one WebSocket session:
        sender()   — pulls PCM bytes off the audio queue and sends them to ElevenLabs
        receiver() — listens for messages from ElevenLabs and fires on_transcript()

    If the WebSocket drops (network hiccup, timeout), the outer loop reconnects
    automatically after 2 seconds. The sounddevice stream stays open the whole time.

    Args:
        on_transcript: Called with the committed transcript text each time
                       ElevenLabs finishes recognizing a speech segment.
        sample_rate:   Audio sample rate in Hz. Must be 16000 for ElevenLabs PCM format.

    Returns:
        The daemon thread (already started).
    """
    # A thread-safe queue bridges sounddevice's sync callback and the async WebSocket sender.
    # sounddevice runs in its own OS-level audio thread; asyncio runs in our daemon thread.
    # queue.Queue is the standard Python tool for passing data between threads safely.
    audio_queue: queue.Queue = queue.Queue()

    def sd_callback(indata: np.ndarray, frames: int, time_info, status) -> None:
        """
        Called by sounddevice every AUDIO_BLOCK_MS milliseconds with fresh audio.

        indata shape: (frames, channels) — float32 values between -1.0 and 1.0.
        We convert to int16 PCM (what ElevenLabs expects) and drop it in the queue.
        This callback must be fast — any slow work goes in the async sender instead.
        """
        pcm_bytes = (indata[:, 0] * 32767).astype(np.int16).tobytes()
        audio_queue.put(pcm_bytes)

    async def ws_session() -> None:
        """
        Open one WebSocket session to ElevenLabs and run until disconnected.
        Raises on disconnect so the outer retry loop can reconnect.
        """
        api_key = os.getenv("ELEVENLABS_API_KEY")
        headers = {"xi-api-key": api_key}

        async with websockets.connect(ELEVENLABS_WS_URL, additional_headers=headers) as ws:
            logger.info("ElevenLabs streaming STT connected")

            async def sender() -> None:
                """
                Pull PCM chunks off the audio_queue and send them to ElevenLabs.
                run_in_executor() lets us do a blocking queue.get() without freezing
                the async event loop — it runs the blocking call in a thread pool.
                """
                loop = asyncio.get_running_loop()
                while True:
                    try:
                        # Block until audio is available (timeout lets us check for cancellation)
                        pcm = await loop.run_in_executor(
                            None, lambda: audio_queue.get(timeout=1.0)
                        )
                    except queue.Empty:
                        continue

                    # ElevenLabs expects base64-encoded PCM audio in a JSON message.
                    # commit: false — let VAD decide when a segment ends, not us.
                    await ws.send(json.dumps({
                        "message_type": "input_audio_chunk",
                        "audio_base_64": base64.b64encode(pcm).decode(),
                        "commit": False,
                        "sample_rate": sample_rate,
                    }))

            async def receiver() -> None:
                """
                Listen for messages from ElevenLabs.
                - partial_transcript: ElevenLabs' best guess as you speak — sent
                  continuously while speech is detected. We forward these immediately
                  so the UI can show in-progress text in real time.
                - committed_transcript: The final, stable result after VAD detects
                  a pause. This replaces the partial text in the UI.
                """
                async for raw in ws:
                    data = json.loads(raw)
                    msg_type = data.get("message_type")
                    text = data.get("text", "").strip()
                    if msg_type == "partial_transcript" and text:
                        on_partial(text)
                    elif msg_type == "committed_transcript" and text:
                        on_transcript(text)

            # Run sender and receiver concurrently. gather() runs both coroutines
            # in the same event loop and returns when either one finishes (or raises).
            await asyncio.gather(sender(), receiver())

    def _thread() -> None:
        """
        The daemon thread entry point. Opens sounddevice, then keeps the
        WebSocket session alive with automatic reconnection on failure.
        """
        blocksize = int(sample_rate * AUDIO_BLOCK_MS / 1000)  # samples per callback
        logger.info("Audio stream started (rate=%dHz, block=%dms)", sample_rate, AUDIO_BLOCK_MS)

        with sd.InputStream(
            samplerate=sample_rate,
            channels=AUDIO_CHANNELS,
            dtype="float32",
            blocksize=blocksize,
            callback=sd_callback,
        ):
            # Reconnect loop — if the WebSocket drops, wait 2s and try again.
            # The sounddevice InputStream stays open the whole time so we never
            # miss audio even during a brief reconnection.
            while True:
                try:
                    asyncio.run(ws_session())
                except Exception:
                    logger.exception("Streaming STT session ended — reconnecting in 2s")
                    time.sleep(2)

    t = threading.Thread(target=_thread, daemon=True, name="audio-stream")
    t.start()
    return t
