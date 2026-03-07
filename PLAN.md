# Lecture Capture System — Project Plan

## What We Are Building

A system that:
1. Captures a live classroom lecture via the laptop's built-in camera and microphone
2. Uses AI to read the whiteboard (Gemini Vision) and transcribe the lecturer's speech (ElevenLabs Scribe)
3. Delivers formatted notes and a live transcript to browser tabs in real time via WebSocket

Students open `http://localhost:8000` in a browser and see:
- A live, AI-formatted version of whatever is on the whiteboard (left panel)
- A running transcript of what the lecturer is saying (right panel)
- No raw camera footage is shown to students

---

## Confirmed Decisions

| Decision | Choice | Reason |
|---|---|---|
| Vision AI | Gemini 2.5 Flash (`gemini-2.5-flash`) | Replaces Claude; cheaper, generous free tier |
| Transcription | ElevenLabs Scribe (`scribe_v2`) | Replaces Whisper; cloud API, paid account |
| Network | Localhost only (`127.0.0.1:8000`) | No WiFi, no hotspot — dev/demo on one machine |
| Student UI | Two-panel browser page | Notes (left) + Transcript (right), no camera feed |
| Session save | Yes | Notes + transcript saved to `.md` files on shutdown |
| Lecturer UI | Terminal + browser tab | `python server.py` in terminal, open localhost:8000 |

---

## Architecture

```
[Single Laptop — localhost only]

  Built-in Webcam  ──► OpenCV grabs frame every 5s ──► Gemini Vision API
  Built-in Mic     ──► sounddevice records 5s chunk ──► ElevenLabs Scribe API
                                    │
                      FastAPI server on 127.0.0.1:8000
                                    │
                  Browser tab 1          Browser tab 2
               (lecturer / dev view)   (student simulation)
                  localhost:8000          localhost:8000
```

### Thread Model
```
Main thread:  FastAPI/uvicorn (handles WebSocket connections, serves index.html)
Thread A:     Camera loop — cv2 → encode JPEG bytes → Gemini → broadcast delta
Thread B:     Audio loop  — sounddevice → WAV bytes → ElevenLabs → broadcast text
```

### How Whiteboard AI Stays Incremental
Each Gemini call receives the current frame AND the accumulated notes so far:
```
Prompt: "Previously captured: [running markdown]. Look at this new frame.
         Return ONLY content that is NEW or CHANGED. Format as Markdown."
```
Only the delta is returned. The server appends it and broadcasts the full document.

### How Transcription Works
ElevenLabs receives exactly 5 seconds of audio per call. It has no memory of
prior audio. The server concatenates returned strings to build the full transcript.
The API never re-processes old audio.

---

## Technology Stack

| Layer | Technology | Package |
|---|---|---|
| Language | Python 3.10+ | — |
| Camera capture | OpenCV | `opencv-python` |
| Audio capture | sounddevice + numpy | `sounddevice`, `numpy` |
| Audio encoding | WAV bytes in memory | `scipy` |
| Vision AI | Google Gemini 2.5 Flash | `google-generativeai` |
| Transcription | ElevenLabs Scribe v2 | `elevenlabs` |
| Backend server | FastAPI + uvicorn | `fastapi`, `uvicorn[standard]` |
| Real-time delivery | WebSockets (built into FastAPI) | — |
| Student frontend | HTML + vanilla JS | — |
| Markdown rendering | marked.js + KaTeX | CDN (no install) |
| Config | python-dotenv | `python-dotenv` |

**No ffmpeg required** (Whisper removed).

---

## API Keys Required

```
GEMINI_API_KEY=...       # aistudio.google.com — free tier available
ELEVENLABS_API_KEY=...   # elevenlabs.io — paid account
```

---

## Project File Structure

```
HackAI/
├── CLAUDE.md               # Project context for AI coding sessions
├── PLAN.md                 # This file
├── server.py               # FastAPI app: WebSocket server, threads, shutdown save
├── capture.py              # Camera frame loop + audio chunk loop
├── ai.py                   # Gemini vision call + ElevenLabs transcription call
├── static/
│   └── index.html          # Student browser page (two-panel: notes + transcript)
├── .env                    # GEMINI_API_KEY + ELEVENLABS_API_KEY (never commit)
├── requirements.txt        # pip dependencies
├── test_camera.py          # Verify camera opens and returns a frame
└── test_api.py             # Verify Gemini + ElevenLabs API keys work
```

### Saved Session Output (auto-generated on shutdown)
```
notes_YYYY-MM-DD_HHMMSS.md       # Full whiteboard notes as Markdown
transcript_YYYY-MM-DD_HHMMSS.md  # Full lecture transcript as Markdown
```

---

## Build Order

### Step 1 — Environment Setup
- Confirm Python 3.10+
- Create and activate virtualenv
- `pip install -r requirements.txt`
- Fill in `.env` with both API keys
- Run `test_camera.py` → confirm camera opens
- Run `test_api.py` → confirm Gemini + ElevenLabs both respond

### Step 2 — Vision AI (`ai.py` + `capture.py`)
- `grab_frame()`: open camera, read one frame, release
- `frame_to_bytes()`: encode frame as JPEG bytes
- `analyze_whiteboard()`: send bytes + prompt to Gemini, return Markdown delta
- Test loop: grab frame → call Gemini → print output to terminal

### Step 3 — Audio Transcription (`ai.py` + `capture.py`)
- `record_audio_chunk()`: record 5s of audio via sounddevice
- `audio_to_wav_bytes()`: encode numpy float32 array → WAV bytes in memory
- `transcribe_audio()`: send WAV bytes to ElevenLabs Scribe, return text
- Test loop: record chunk → call ElevenLabs → print text to terminal
- Run both loops simultaneously in threads

### Step 4 — FastAPI WebSocket Server (`server.py`)
- FastAPI app with `/ws` WebSocket endpoint
- Connected-client set + async `broadcast()` function
- `broadcast_sync()` wrapper using `asyncio.run_coroutine_threadsafe()`
- Startup hook: init API clients, start camera + audio threads
- Shutdown hook: save notes + transcript to dated `.md` files
- `GET /` serves `static/index.html`

### Step 5 — Student Frontend (`static/index.html`)
- Dark two-panel layout: notes (left, Markdown rendered) + transcript (right, scrolling)
- WebSocket connects to `ws://localhost:8000/ws`
- On connect: server sends current state (late joiners see everything)
- On `whiteboard` message: re-render full notes with marked.js, then run KaTeX auto-render for math
- On `transcript` message: append new segment with brief highlight
- Auto-reconnect with exponential backoff
- No camera image displayed

### Step 6 — Integration Test
- `python server.py`
- Open `http://localhost:8000` in 2+ browser tabs
- Point camera at paper with writing; speak into mic
- Verify both panels update live in all tabs

---

## Key Technical Notes

- **Thread safety:** FastAPI is async; background threads use
  `asyncio.run_coroutine_threadsafe(broadcast(...), loop)` to push updates safely.
- **Camera index:** `VideoCapture(0)` = built-in laptop camera. Try `1` if it fails.
- **Audio format:** ElevenLabs expects audio file bytes (WAV/MP3), not raw numpy arrays.
  Convert with `scipy.io.wavfile.write()` to a `BytesIO` buffer — no temp files needed.
- **Gemini image input:** Pass raw JPEG bytes via `types.Part.from_bytes(data, mime_type="image/jpeg")`.
  No base64 encoding required (unlike the Anthropic API).
- **ElevenLabs cost:** ~$0.40/hour of audio on paid plan.
- **Gemini cost:** Generous free tier; `gemini-2.5-flash` is the best price/performance model.
- **Future network upgrade:** To go live, change `host="127.0.0.1"` to `host="0.0.0.0"` in
  `server.py` and have students navigate to the laptop's LAN IP. No other changes needed.
