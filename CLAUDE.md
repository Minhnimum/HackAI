# Lecture Capture System — Project Context

## What This Project Is

A single-laptop system that captures a live classroom lecture via the built-in
camera and microphone, processes it with AI, and serves formatted notes + a
live transcript to browser tabs over localhost.

**Current status:** All code files updated for the confirmed stack. Ready to run.

---

## Confirmed Tech Stack

| Concern | Choice |
|---|---|
| Vision AI | Google Gemini 2.5 Flash (`gemini-2.5-flash`) via `google-genai` |
| Transcription | ElevenLabs Scribe v2 (`scribe_v2`) via `elevenlabs` |
| Camera | OpenCV (`cv2.VideoCapture(0)`) |
| Audio | sounddevice → numpy float32 → scipy WAV bytes → ElevenLabs |
| Server | FastAPI + uvicorn on `127.0.0.1:8000` |
| Frontend | Single HTML file, vanilla JS, marked.js + KaTeX for Markdown+LaTeX math |
| Config | python-dotenv, `.env` file |

---

## Key Constraints

- **Localhost only** — no network, no hotspot. Everything runs on one machine.
  Students are simulated by opening multiple browser tabs at `localhost:8000`.
- **No camera footage shown to students** — only AI-formatted text.
- **Session notes saved on shutdown** — `notes_YYYY-MM-DD_HHMMSS.md` and
  `transcript_YYYY-MM-DD_HHMMSS.md` written by the FastAPI shutdown hook.
- **No ffmpeg** — Whisper has been removed; scipy handles WAV encoding.

---

## File Responsibilities

| File | Responsibility |
|---|---|
| `server.py` | FastAPI app, WebSocket `/ws` endpoint, startup/shutdown hooks, broadcast logic, thread orchestration |
| `capture.py` | `start_camera_loop()` and `start_audio_loop()` — daemon threads, no AI calls |
| `ai.py` | `analyze_whiteboard()` (Gemini) and `transcribe_audio()` (ElevenLabs) — pure AI calls, no I/O side effects |
| `static/index.html` | Student browser page — two panels, WebSocket client, marked.js |
| `test_camera.py` | Standalone: opens camera, shows preview, press q to quit |
| `test_api.py` | Standalone: tests Gemini vision call + ElevenLabs transcription call |

---

## Environment Variables (`.env`)

```
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

## API Usage Patterns

### Gemini Vision
```python
from google import genai
from google.genai import types

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
image_part = types.Part.from_bytes(data=jpeg_bytes, mime_type="image/jpeg")
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[prompt_text, image_part],
)
delta = response.text.strip()
```

### ElevenLabs Scribe
```python
from elevenlabs.client import ElevenLabs
import scipy.io.wavfile as wav
import io

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
buf = io.BytesIO()
wav.write(buf, 16000, (audio_chunk * 32767).astype(np.int16))
buf.seek(0)
result = client.speech_to_text.convert(file=buf, model_id="scribe_v2")
text = result.text.strip()
```

---

## WebSocket Message Format

All messages are JSON with a `type` field:

```json
{ "type": "whiteboard", "delta": "...", "full": "..." }
{ "type": "transcript",  "delta": "...", "full": "..." }
```

On connect, the server immediately sends the current full state of both so
late-joining clients see everything captured so far.

---

## Threading Model

```
Main thread:  asyncio event loop (FastAPI/uvicorn)
Thread A:     camera loop — grabs frame every 5s, calls Gemini, calls broadcast_sync()
Thread B:     audio loop  — records 5s chunks, calls ElevenLabs, calls broadcast_sync()

broadcast_sync() = asyncio.run_coroutine_threadsafe(broadcast(msg), _main_loop)
```

---

## Code Style — Required for Every File

The developers building this app are learning as they go. Every file must be
written so that a beginner-to-intermediate programmer can read it and understand
not just *what* the code does but *why* it was written that way.

### Rules that apply to all code in this project

**1. Comment the "why", not just the "what"**
A bad comment restates the code: `# increment i`. A good comment explains the
reason: `# OpenCV uses BGR order, not RGB — reverse channels before encoding`.
Every non-obvious line or block needs a comment that explains the decision.

**2. Explain concepts inline when they first appear**
If a library, pattern, or data type is used for the first time, add a short
comment explaining what it is. Examples:
- First use of `asyncio.run_coroutine_threadsafe`: explain why it's needed
  (background threads can't call async functions directly)
- First use of `BytesIO`: explain that it's a file-like object that lives in
  RAM instead of on disk
- First use of `daemon=True` on a thread: explain what a daemon thread is

**3. Use clear, descriptive variable names**
Avoid single-letter names except for simple loop indices. Prefer:
- `jpeg_bytes` over `buf`
- `audio_chunk` over `data`
- `connected_clients` over `clients`

**4. Group code into labeled sections with divider comments**
Use a consistent style to separate logical sections within a file:
```python
# ---------------------------------------------------------------------------
# Section Name
# ---------------------------------------------------------------------------
```

**5. Every function needs a docstring**
Even short functions. The docstring should explain:
- What the function does in plain English
- What each parameter is (type + meaning)
- What it returns

**6. Keep functions small and single-purpose**
If a function is doing two things, split it. Each function should do exactly
one thing and be nameable with a simple verb phrase: `grab_frame`, `encode_audio`,
`broadcast_update`.

**7. No magic numbers**
If a number appears in code, it should have a named constant with a comment:
```python
SAMPLE_RATE = 16000    # Hz — ElevenLabs and most speech models expect 16kHz
FRAME_INTERVAL = 5.0   # seconds between whiteboard captures
JPEG_QUALITY = 85      # 0–100; 85 is a good balance of size vs. image quality
```

---

## Future: Going Live (Not Yet)

When ready to serve real students over WiFi:
1. Change `host="127.0.0.1"` → `host="0.0.0.0"` in `server.py`
2. Enable Windows Mobile Hotspot (laptop becomes the router)
3. Students connect to hotspot and navigate to `http://192.168.137.1:8000`
No other code changes needed.
