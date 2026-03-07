"""
capture.py — Camera frame capture and microphone audio recording loops.

Each loop runs in its own daemon thread and calls a provided callback
with the raw data so server.py can process and broadcast it.
"""
import threading
import time
import logging
from typing import Callable, Optional

import cv2
import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CAMERA_INDEX = 0          # Built-in webcam; try 1 if this fails
FRAME_INTERVAL = 5.0      # Seconds between whiteboard captures

SAMPLE_RATE = 16000       # Hz — ElevenLabs expects 16 kHz for speech transcription
AUDIO_CHUNK_SECONDS = 5   # Seconds of audio per transcription call
AUDIO_CHANNELS = 1

# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------

def grab_frame(camera_index: int = CAMERA_INDEX) -> Optional[np.ndarray]:
    """Open the camera, grab one frame, release, and return it."""
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        logger.error("Could not open camera at index %d", camera_index)
        return None
    ret, frame = cap.read()
    cap.release()
    if not ret:
        logger.error("Failed to read frame from camera")
        return None
    return frame


def start_camera_loop(
    on_frame: Callable[[np.ndarray], None],
    interval: float = FRAME_INTERVAL,
    camera_index: int = CAMERA_INDEX,
) -> threading.Thread:
    """
    Start a background daemon thread that captures a frame every `interval`
    seconds and calls `on_frame(frame)`.

    Returns the thread (already started).
    """
    def _loop():
        logger.info("Camera loop started (index=%d, interval=%.1fs)", camera_index, interval)
        while True:
            frame = grab_frame(camera_index)
            if frame is not None:
                try:
                    on_frame(frame)
                except Exception:
                    logger.exception("Error in on_frame callback")
            time.sleep(interval)

    t = threading.Thread(target=_loop, daemon=True, name="camera-loop")
    t.start()
    return t


# ---------------------------------------------------------------------------
# Microphone
# ---------------------------------------------------------------------------

def record_audio_chunk(
    duration: float = AUDIO_CHUNK_SECONDS,
    sample_rate: int = SAMPLE_RATE,
    channels: int = AUDIO_CHANNELS,
) -> np.ndarray:
    """
    Record `duration` seconds of audio from the default microphone.

    Returns a 1-D float32 numpy array.
    """
    samples = sd.rec(
        int(duration * sample_rate),
        samplerate=sample_rate,
        channels=channels,
        dtype="float32",
    )
    sd.wait()  # Block until recording is complete
    return samples.flatten()


def start_audio_loop(
    on_audio: Callable[[np.ndarray], None],
    chunk_seconds: float = AUDIO_CHUNK_SECONDS,
    sample_rate: int = SAMPLE_RATE,
) -> threading.Thread:
    """
    Start a background daemon thread that continuously records `chunk_seconds`
    of audio and calls `on_audio(chunk)` for each chunk.

    Returns the thread (already started).
    """
    def _loop():
        logger.info("Audio loop started (chunk=%.1fs, rate=%dHz)", chunk_seconds, sample_rate)
        while True:
            try:
                chunk = record_audio_chunk(chunk_seconds, sample_rate)
                on_audio(chunk)
            except Exception:
                logger.exception("Error in audio loop")

    t = threading.Thread(target=_loop, daemon=True, name="audio-loop")
    t.start()
    return t
