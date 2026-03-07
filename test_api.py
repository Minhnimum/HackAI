"""
test_api.py — Verify that Gemini Vision and ElevenLabs Scribe are both working.

Run with:  python test_api.py

What this script does:
  1. Reads your API keys from the .env file
  2. Grabs one frame from the camera and sends it to Gemini — confirms vision works
  3. Records 4 seconds of audio from the mic and sends it to ElevenLabs — confirms transcription works

If both tests pass, the full app (server.py) is ready to run.
"""

import io
import os
import sys

import cv2
import numpy as np
import scipy.io.wavfile as wav
import sounddevice as sd
from google import genai
from google.genai import types
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

# ---------------------------------------------------------------------------
# Load keys from .env
# ---------------------------------------------------------------------------
# python-dotenv reads the .env file in this folder and makes the values
# available via os.getenv(). This way keys never appear in source code.
load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")
elevenlabs_key = os.getenv("ELEVENLABS_API_KEY")

if not gemini_key or "your_" in gemini_key:
    print("ERROR: GEMINI_API_KEY not set in .env")
    sys.exit(1)

if not elevenlabs_key or "your_" in elevenlabs_key:
    print("ERROR: ELEVENLABS_API_KEY not set in .env")
    sys.exit(1)

print("Keys loaded from .env\n")

# ---------------------------------------------------------------------------
# TEST 1 — Gemini Vision
# ---------------------------------------------------------------------------
# How this works:
#   - OpenCV opens the laptop camera and reads one frame (a numpy array of pixels)
#   - We encode that frame as JPEG bytes (a compressed image format)
#   - We wrap the bytes in a types.Part object, which is how the Gemini SDK
#     expects image data
#   - We call generate_content() with a list containing both the image and a
#     text prompt. Gemini reads both and returns a text response.
# ---------------------------------------------------------------------------

print("=" * 50)
print("TEST 1: Gemini Vision")
print("=" * 50)

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("ERROR: Could not open camera. Run test_camera.py to diagnose.")
    sys.exit(1)

ret, frame = cap.read()
cap.release()

if not ret:
    print("ERROR: Camera opened but could not read a frame.")
    sys.exit(1)

# Encode the numpy pixel array → compressed JPEG bytes
success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
if not success:
    print("ERROR: Could not encode frame as JPEG.")
    sys.exit(1)
jpeg_bytes = buffer.tobytes()

print(f"Camera frame captured ({len(jpeg_bytes) // 1024} KB JPEG)")
print("Sending to Gemini Vision...")

# Create a Gemini client using the new google-genai SDK.
# The old google-generativeai package is deprecated — this is the replacement.
client = genai.Client(api_key=gemini_key)

# types.Part.from_bytes() wraps raw bytes into the format Gemini expects.
# mime_type tells Gemini what kind of data it is (JPEG image).
image_part = types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg")

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
        "Describe what you see in this image in one sentence.",
        image_part,
    ],
)

print(f"Gemini says: {response.text.strip()}")
print("TEST 1 PASSED\n")

# ---------------------------------------------------------------------------
# TEST 2 — ElevenLabs Scribe Transcription
# ---------------------------------------------------------------------------
# How this works:
#   - sounddevice.rec() records audio from the default microphone for 4 seconds
#   - The result is a numpy array of float32 numbers between -1.0 and 1.0,
#     representing the audio waveform as a sequence of amplitude values
#   - ElevenLabs expects an audio file (WAV/MP3), not a raw numpy array,
#     so we convert it: multiply by 32767 to scale to 16-bit integer range,
#     then use scipy to write a valid WAV file into a BytesIO buffer (in memory,
#     no file on disk needed)
#   - We send that buffer to ElevenLabs' speech_to_text.convert() endpoint
#   - scribe_v2 is ElevenLabs' best transcription model (90+ languages)
# ---------------------------------------------------------------------------

print("=" * 50)
print("TEST 2: ElevenLabs Scribe Transcription")
print("=" * 50)

SAMPLE_RATE = 16000   # 16,000 samples per second — standard for speech
DURATION = 4          # seconds to record

print(f"Recording {DURATION} seconds of audio — say something now...")

# sd.rec() starts recording immediately. The first argument is the total number
# of samples to collect: 4 seconds × 16,000 samples/sec = 64,000 samples.
audio_chunk = sd.rec(
    int(DURATION * SAMPLE_RATE),
    samplerate=SAMPLE_RATE,
    channels=1,
    dtype="float32",
)
sd.wait()  # blocks until all 64,000 samples have been collected

print("Recording done. Sending to ElevenLabs...")

# Convert float32 numpy array → WAV bytes in memory.
# Step 1: scale float32 (-1.0 to 1.0) to int16 (-32767 to 32767).
#         WAV files store audio as integers, not floats.
# Step 2: scipy.io.wavfile.write() writes a proper WAV file header + data
#         into a BytesIO buffer (like a file, but lives in RAM).
buf = io.BytesIO()
wav.write(buf, SAMPLE_RATE, (audio_chunk * 32767).astype(np.int16))
buf.seek(0)  # rewind to the start so ElevenLabs reads from the beginning

el_client = ElevenLabs(api_key=elevenlabs_key)
result = el_client.speech_to_text.convert(
    file=buf,
    model_id="scribe_v2",
)

text = result.text.strip()
if text:
    print(f"ElevenLabs heard: \"{text}\"".encode("ascii", errors="replace").decode("ascii"))
else:
    print("ElevenLabs returned empty text (silence or background noise only)")

print("TEST 2 PASSED\n")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print("=" * 50)
print("All tests passed. Ready to run: python server.py")
print("=" * 50)
