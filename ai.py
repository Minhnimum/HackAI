"""
ai.py — AI inference layer: whiteboard vision (Gemini) + audio transcription (ElevenLabs).

This file is intentionally kept pure: it only makes API calls and returns text.
It does NOT read from the camera, record audio, write files, or talk to the server.
That separation makes each piece easier to test and understand on its own.
"""

import io
import json
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

JPEG_QUALITY = 100
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
    current_notes: str = "",
) -> str:
    """
    Send a whiteboard camera frame + the current grid state to Gemini and get
    back an updated JSON grid that preserves the 2D spatial layout of the board.

    OUTPUT FORMAT — a JSON string with this shape:
        {
          "cells": [
            { "row": 1, "col": 1, "colSpan": 3, "content": "## Title" },
            { "row": 2, "col": 1,                "content": "$F = ma$" },
            { "row": 2, "col": 2,                "content": "$E = mc^2$" }
          ]
        }

    The whiteboard is divided into a 3-column grid (left / center / right thirds)
    and as many rows as needed (top to bottom). Each piece of content is placed
    in the cell that matches where it physically appears on the board.

    Why JSON grid instead of Markdown?
        Markdown is linear — it can only express top-to-bottom order. Whiteboards
        are 2D. A professor might write two equations side by side, or put a
        definition on the left and an example on the right. A JSON grid lets us
        preserve that spatial relationship and render it faithfully in the browser
        using CSS grid layout.

    Merge strategy (same four rules as before):
        1. ADD   — new content visible on the board, not yet in the grid.
        2. UPDATE — cells whose content changed (e.g., "5+3" → "5+3=8").
        3. PRESERVE — cells not currently visible (professor may be blocking them).
        4. REMOVE — cells only if the content was clearly erased (clean whiteboard
                    where it used to be, not just a person standing in front).

    Args:
        gemini_client:  An authenticated genai.Client instance, created at startup.
        frame:          Current camera frame as a numpy array (BGR, from OpenCV).
        current_notes:  The JSON grid string from the previous capture, or "" on
                        the first call.

    Returns:
        A JSON string (the updated grid). Returns current_notes unchanged if
        Gemini's response is missing or cannot be parsed as valid JSON.
    """
    # Step 1: Compress the raw pixel frame into JPEG bytes for the API call.
    jpeg_bytes = encode_frame_as_jpeg(frame)

    # Step 2: Build the prompt.
    # We pass the existing grid JSON directly in the prompt so Gemini knows
    # what's already been captured and can perform an intelligent merge.
    if current_notes:
        grid_section = f"CURRENT GRID (JSON from previous capture):\n{current_notes}\n\n"
    else:
        grid_section = "CURRENT GRID: (none yet — this is the first capture)\n\n"

    prompt = (
        "You are capturing a live whiteboard lecture. Your job is to maintain a "
        "2D spatial grid of the whiteboard content so students see the same layout "
        "the professor wrote.\n\n"
        + grid_section
        + "Look at the whiteboard image and return an UPDATED JSON grid.\n\n"
        "GRID SYSTEM:\n"
        "- The board has up to 3 columns: col 1 = left third, col 2 = center third, "
        "col 3 = right third.\n"
        "- Rows go top to bottom starting at row 1. Use as many rows as needed.\n"
        "- Use colSpan (1, 2, or 3) when content spans multiple column zones. "
        "A full-width title gets colSpan 3. Content spanning left+center gets colSpan 2.\n\n"
        "MERGE RULES:\n"
        "1. ADD new content visible on the board that is not yet in the grid.\n"
        "2. UPDATE cells whose content changed "
        "(e.g., '5 + 3' is now '5 + 3 = 8' — edit that cell in-place).\n"
        "3. PRESERVE cells not currently visible — the professor may be blocking them.\n"
        "4. REMOVE cells only if you can clearly see the content was erased "
        "(clean whiteboard where it was, not just someone standing in front).\n\n"
        "TRANSCRIPTION RULE — stenographer, not narrator:\n"
        "- Output content exactly as written. Never describe or narrate.\n"
        "- WRONG: 'There appears to be an equation: 5 + 3'\n"
        "- RIGHT:  '$5 + 3$'\n"
        "- Never use 'there appears to be', 'the whiteboard shows', 'I can see', etc.\n\n"
        "FORMAT RULES for cell content:\n"
        "- Use ## for section headers\n"
        "- Use bullet points, numbered lists, and code blocks where appropriate\n"
        "- Convert ALL math to LaTeX: inline $...$, display $$...$$\n"
        "- Use only $ and $$ delimiters — not \\( \\) or \\[ \\]\n\n"
        "OUTPUT: Return ONLY valid JSON — no explanation, no markdown fences.\n"
        "Schema: {\"cells\": [{\"row\": int, \"col\": int, \"colSpan\": int, \"content\": str}]}\n"
        "colSpan is optional and defaults to 1.\n"
        "If the board is blank and there are no prior cells: {\"cells\": []}"
    )

    # Step 3: Wrap the JPEG bytes in a types.Part so Gemini receives the image.
    image_part = types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg")

    # Step 4: Call Gemini with both the prompt and the image.
    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt, image_part],
    )

    if not response.text:
        # Gemini returned nothing — keep the current grid so we don't lose data.
        return current_notes

    raw = response.text.strip()

    # Gemini sometimes wraps JSON in a ```json ... ``` code fence even when told
    # not to. Strip those fences before validating.
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    # Step 5: Validate the JSON before sending it to the browser.
    # If Gemini produced invalid JSON, fall back to the current grid rather than
    # crashing the session or sending garbage to every connected student.
    try:
        parsed = json.loads(raw)
        if "cells" not in parsed or not isinstance(parsed["cells"], list):
            return current_notes
    except json.JSONDecodeError:
        return current_notes

    return raw


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
