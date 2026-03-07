"""
ai.py — AI inference layer: whiteboard vision (Gemini) + audio transcription (ElevenLabs).

This file is intentionally kept pure: it only makes API calls and returns text.
It does NOT read from the camera, record audio, write files, or talk to the server.
That separation makes each piece easier to test and understand on its own.
"""

import io
import os

import cv2
import numpy as np
import scipy.io.wavfile as wav
from google import genai
from google.genai import types
from elevenlabs.client import ElevenLabs

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Named constants make the code self-documenting. If we need to change these
# values later, there is one place to do it instead of hunting through the code.

JPEG_QUALITY = 85
# JPEG quality on a 0–100 scale. 85 gives a good balance between file size
# (smaller = faster API upload) and image clarity (higher = Gemini reads text better).
# Below ~70 the compression artifacts can make handwritten text hard to read.

GEMINI_MODEL = "gemini-2.5-flash"
# The specific Gemini model to use for vision. "gemini-2.5-flash" is Google's
# best price-to-performance model as of 2026. It handles images + text prompts
# in a single call and returns a text response.

ELEVENLABS_MODEL = "scribe_v2"
# ElevenLabs' most capable transcription model. Supports 90+ languages and
# can handle accented speech better than older models.

SAMPLE_RATE = 16000
# Audio sample rate in Hz (samples per second). 16,000 is the standard for
# speech recognition — high enough to capture voice frequencies, low enough
# to keep file sizes small. ElevenLabs expects this rate.


# ---------------------------------------------------------------------------
# Whiteboard Vision
# ---------------------------------------------------------------------------

def encode_frame_as_jpeg(frame: np.ndarray) -> bytes:
    """
    Convert an OpenCV camera frame into JPEG bytes ready to send to Gemini.

    Args:
        frame: A numpy array of shape (height, width, 3) in BGR color order,
               as returned by cv2.VideoCapture.read(). This is just a grid
               of pixel values — one row per pixel row, one column per pixel
               column, three values per pixel (Blue, Green, Red).

    Returns:
        Raw JPEG bytes — a compressed representation of the image.

    Why JPEG and not raw pixels?
        Sending 1280×720 raw pixels = ~2.7 MB per frame. The same image as
        JPEG at quality 85 = ~40–100 KB. Smaller = faster API calls = lower
        latency for students.

    Why bytes and not base64?
        The old Claude API required base64-encoded strings. Gemini accepts raw
        bytes directly via types.Part.from_bytes(), so we skip the encoding step.
    """
    success, buffer = cv2.imencode(
        ".jpg",
        frame,
        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
    )
    if not success:
        raise RuntimeError("cv2.imencode failed — could not compress frame to JPEG.")

    # buffer is a numpy array of byte values. .tobytes() converts it to a
    # plain Python bytes object, which is what Gemini's SDK expects.
    return buffer.tobytes()


def analyze_whiteboard(
    gemini_client: genai.Client,
    frame: np.ndarray,
    previous_notes: str = "",
) -> str:
    """
    Send a whiteboard camera frame to Gemini and get back only the NEW content.

    This function is the core of the whiteboard pipeline. It is called every
    5 seconds by the camera loop in server.py.

    How the "incremental" trick works:
        We pass Gemini the FULL history of notes already captured. We then ask
        it to return ONLY what is new or changed. This way we never duplicate
        content — each call returns just the delta, which the server appends.

    Args:
        gemini_client: An authenticated genai.Client instance. Created once at
                       server startup and reused for every call (more efficient
                       than creating a new client each time).
        frame:         The current camera frame as a numpy array (BGR, from OpenCV).
        previous_notes: Everything Gemini has returned so far, joined together.
                        Empty string on the very first call.

    Returns:
        A Markdown+LaTeX string containing only new or changed whiteboard content.
        Returns an empty string if nothing new is visible.
    """
    # Step 1: Compress the raw pixel frame into JPEG bytes for the API call.
    jpeg_bytes = encode_frame_as_jpeg(frame)

    # Step 2: Build the context block — this is the "memory" we give Gemini.
    # On the first call, there are no previous notes, so we ask for everything.
    # On subsequent calls, we tell Gemini what it already found so it only
    # returns what is genuinely new.
    if previous_notes.strip():
        context_block = (
            f"Previously captured whiteboard content (already shown to students):\n"
            f"---\n{previous_notes}\n---\n\n"
            "Look at the new whiteboard image. "
            "Return ONLY content that is NEW or has CHANGED since the previous capture. "
            "Do NOT repeat content that is already in the previous notes. "
            "If nothing new is visible, return an empty string."
        )
    else:
        context_block = (
            "This is the first whiteboard capture. "
            "Extract ALL visible content from the whiteboard."
        )

    # Step 3: Build the full prompt — instructions for how to format the output.
    # We want Markdown for structure (headers, bullets) and LaTeX for math
    # (so the browser can render equations with KaTeX).
    prompt = (
        f"{context_block}\n\n"
        "Format your response as Markdown with LaTeX math:\n"
        "- Use ## for section headers\n"
        "- Use bullet points, numbered lists, and code blocks where appropriate\n"
        "- For ALL mathematical expressions, equations, and formulas use LaTeX delimiters:\n"
        "  - Inline math: $...$ (e.g., $F = ma$)\n"
        "  - Display math (standalone equations): $$...$$ on its own line\n"
        "- Do NOT write math as plain text without delimiters\n"
        "- Use only $ and $$ delimiters — not \\( \\) or \\[ \\]\n"
        "- Return ONLY the Markdown+LaTeX content, no preamble or explanation."
    )

    # Step 4: Wrap the JPEG bytes in a types.Part object.
    # This is Gemini's way of receiving non-text content (images, audio, etc.)
    # in a multi-modal (text + image) request.
    image_part = types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg")

    # Step 5: Send both the text prompt and the image to Gemini in one call.
    # Gemini reads the image AND the prompt together and returns a single
    # text response — this is what "multi-modal" means.
    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt, image_part],
    )

    # response.text can be None if Gemini had nothing to say (e.g. the frame
    # showed nothing transcribable, or the response was safety-filtered).
    # We treat None the same as an empty string — the server will skip the
    # broadcast and just wait for the next frame.
    return response.text.strip() if response.text else ""


# ---------------------------------------------------------------------------
# Audio Transcription
# ---------------------------------------------------------------------------

def transcribe_audio(audio_chunk: np.ndarray, sample_rate: int = SAMPLE_RATE) -> str:
    """
    Transcribe a 5-second audio chunk using ElevenLabs Scribe.

    This function is called every 5 seconds by the audio loop in server.py.
    Each call only covers the NEW audio recorded since the last call — the
    server concatenates all returned strings to build the full transcript.

    Args:
        audio_chunk: A 1-D numpy array of float32 values between -1.0 and 1.0.
                     This is the raw waveform — each value is the amplitude
                     of the sound at that moment in time.
        sample_rate: How many samples per second were recorded. Must match
                     the rate used by sounddevice (default 16000 Hz).

    Returns:
        The transcribed text as a string. Returns an empty string if the
        audio was silence or the model could not detect speech.

    Why convert to WAV bytes?
        ElevenLabs expects an audio *file* (WAV, MP3, etc.), not a raw numpy
        array. We use scipy to write a valid WAV file into a BytesIO buffer —
        this is an in-memory "file" that never touches the disk.
    """
    # Step 1: Scale the float32 waveform to 16-bit integers.
    # sounddevice records audio as float32 values between -1.0 and 1.0.
    # WAV files store audio as integers. The 16-bit range is -32768 to 32767.
    # Multiplying by 32767 maps our floats to that integer range.
    audio_int16 = (audio_chunk.flatten() * 32767).astype(np.int16)

    # Step 2: Write a proper WAV file into a BytesIO buffer (in-memory file).
    # BytesIO is a Python object that behaves exactly like an open file,
    # but stores its contents in RAM instead of on disk. This avoids creating
    # temporary files and is much faster.
    wav_buffer = io.BytesIO()
    wav.write(wav_buffer, sample_rate, audio_int16)

    # Rewind the buffer to the beginning — after writing, the "cursor" is at
    # the end. ElevenLabs reads from the current position, so we must reset
    # it to position 0 before sending.
    wav_buffer.seek(0)

    # Step 3: Create the ElevenLabs client and send the audio for transcription.
    # The client reads the API key from the environment (loaded from .env by
    # server.py at startup via python-dotenv).
    el_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
    result = el_client.speech_to_text.convert(
        file=wav_buffer,
        model_id=ELEVENLABS_MODEL,
    )

    return result.text.strip()
