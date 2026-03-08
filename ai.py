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
    Send a whiteboard camera frame + the current layout to Gemini and get back
    an updated JSON layout using a coordinate system instead of a grid.

    OUTPUT FORMAT — a JSON string with this shape:
        {
          "cells": [
            { "x": 5,  "y": 5,  "width": 50, "content": "## Title" },
            { "x": 5,  "y": 25, "width": 30, "content": "$F = ma$" },
            { "x": 40, "y": 25, "width": 30, "content": "$E = mc^2$" }
          ]
        }

    x, y, width are all percentages (0–100) of the board's dimensions:
      x=0 is the left edge, x=100 is the right edge.
      y=0 is the top edge,  y=100 is the bottom edge.
      width is how much horizontal space the content occupies.

    This is more precise than a row/col grid because content can be placed
    at any position, not just snapped to column boundaries.

    Args:
        gemini_client:  An authenticated genai.Client instance, created at startup.
        frame:          Current camera frame as a numpy array (BGR, from OpenCV).
        current_notes:  The JSON coordinate string from the previous capture, or ""
                        on the first call.

    Returns:
        A JSON string (the updated layout). Returns current_notes unchanged if
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
        "Scan this whiteboard image and return a JSON grid representing the CURRENT state of the board.\n\n"
        + grid_section
        + "⚠ RULE 1 — NEVER MISS NEW CONTENT:\n"
        "If you see ANY text or writing not already in the current grid, you MUST add it. "
        "Missing new content is the worst possible failure. When in doubt, add it.\n\n"
        "⚠ RULE 2 — DELETE ERASED CONTENT (when you have a clear view):\n"
        "Your output is the authoritative state of the board. If a cell from the current "
        "grid is no longer visible AND you have a clear, unobstructed view of that area "
        "of the board, do NOT include that cell — the professor erased it.\n"
        "EXCEPTION: If a person or object is physically blocking part of the board, you "
        "cannot confirm what is behind them. For any cells that might be hidden behind "
        "an obstruction, include them in your output unchanged — do not delete them.\n\n"
        "CSS GRID LAYOUT — your output is rendered directly in a browser CSS grid.\n"
        "Understanding this is essential for correct spatial placement.\n\n"
        "HOW THE GRID WORKS:\n"
        "  COLUMNS — vertical strips running top to bottom across the board.\n"
        "    col 1 = leftmost strip. col 2 = next strip to the right. And so on.\n"
        "    Every cell in the same column shares the same LEFT EDGE (vertically aligned).\n"
        "    You control column widths via the 'columns' weight array.\n\n"
        "  ROWS — horizontal bands running left to right across the board.\n"
        "    row 1 = topmost band. row 2 = next band down. And so on.\n"
        "    Every cell in the same row shares the same TOP EDGE (horizontally aligned).\n\n"
        "  colSpan — stretches a cell across multiple adjacent columns.\n\n"
        "STEP-BY-STEP PLACEMENT:\n"
        "  1. Count the natural vertical zones on the board and set 'columns' to an\n"
        "     array of that length, e.g. three zones → [1,1,1], two zones → [1,1].\n"
        "     Column widths are auto-sized to content in the browser — the values in\n"
        "     the array only determine the number of columns, not their widths.\n"
        "  2. Assign col: which vertical zone does each item fall in?\n"
        "  3. Assign row: which horizontal band? Higher on board = lower row number.\n"
        "     Items at the SAME HEIGHT must share the same row number.\n"
        "     Items STACKED VERTICALLY must share the same col number.\n\n"
        "CELL STYLING — each cell can carry a 'style' object with these properties:\n"
        "  justifySelf: 'start' | 'center' | 'end'\n"
        "               Controls where the cell box sits inside its column track.\n"
        "               Use 'center' when content is centered within a zone.\n"
        "               Use 'end' when content is pushed to the right edge of its zone.\n"
        "  fontWeight:  'normal' | 'bold'   — use bold for titles or key terms.\n"
        "  fontSize:    'small' | 'normal' | 'large' | 'xlarge'\n"
        "               Match the relative physical size of the writing.\n\n"
        "All style properties are optional. Only include them when they improve accuracy.\n\n"
        "You may rearrange the entire grid between frames if a better layout becomes apparent.\n\n"
        "WHAT TO RETURN:\n"
        "1. All text currently visible on the board.\n"
        "2. Cells behind a person/obstruction: copy them from the current grid unchanged.\n"
        "3. Cells clearly erased from an unobstructed area: omit them entirely.\n"
        "4. Updated content (e.g., '5+3' became '5+3=8'): include the updated version.\n\n"
        "TRANSCRIPTION RULE — stenographer, not narrator:\n"
        "- Output content exactly as written. Never describe or narrate.\n"
        "- WRONG: 'There appears to be an equation: 5 + 3'\n"
        "- RIGHT:  '$5 + 3$'\n"
        "- Never use 'there appears to be', 'the whiteboard shows', 'I can see', etc.\n\n"
        "FORMAT RULES for cell content:\n"
        "- Use ## for section headers\n"
        "- Use bullet points, numbered lists, and code blocks where appropriate\n"
        "- Convert ALL math to LaTeX: inline $...$, display $$...$$\n"
        "- Use only $ and $$ delimiters — not \\( \\) or \\[ \\]\n"
        "- TABLES: if the whiteboard contains a table (rows and columns of data), render it\n"
        "  as a Markdown table inside a single cell. Use standard GFM syntax:\n"
        "    | Header 1 | Header 2 |\n"
        "    |----------|----------|\n"
        "    | value    | value    |\n"
        "  Give the table cell a colSpan wide enough to fill its physical area on the board.\n"
        "  Math inside table cells is allowed — wrap it in $ as usual.\n\n"
        "OUTPUT: Return ONLY valid JSON — no explanation, no markdown fences.\n"
        "Schema: {\n"
        "  \"columns\": [int, ...],\n"
        "  \"cells\": [{\n"
        "    \"row\": int,\n"
        "    \"col\": int,\n"
        "    \"colSpan\": int,\n"
        "    \"content\": str,\n"
        "    \"style\": { \"justifySelf\": str, \"fontWeight\": str, \"fontSize\": str }\n"
        "  }]\n"
        "}\n"
        "columns: required array of proportional weights, e.g. [1,1,1] or [1,2,1].\n"
        "colSpan: optional, defaults to 1.\n"
        "style: optional object — only include keys that improve spatial accuracy.\n"
        "If the board is completely blank: {\"columns\": [1], \"cells\": []}"
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
        # Validate and normalise the columns field.
        # Gemini should return an array like [1, 2, 1], but may return an int
        # (old format) or omit it entirely. We coerce both to a valid array.
        cols = parsed.get("columns")
        if isinstance(cols, int):
            # Old format — treat as N equal-weight columns.
            parsed["columns"] = [1] * max(cols, 1)
            raw = json.dumps(parsed)
        elif not isinstance(cols, list) or len(cols) == 0:
            parsed["columns"] = [1, 1, 1]
            raw = json.dumps(parsed)
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
