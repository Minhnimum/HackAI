# HackAI: Intelligent Lecture Capture & Interactive Canvas 🎓✨

Welcome to our hackathon project! This platform revolutionizes the classroom and personal studying experience by merging real-time lecture capture with an interactive, AI-driven study canvas. We built an application that not only captures everything a professor says and writes but also provides a dynamic "Study Canvas" where students can sketch out problems and receive step-by-step tutoring.

## 🌟 Project Overview

This project attacks educational friction from two angles:
1. **The Classroom Experience (Lecture Capture):** Students no longer need to scramble to copy down what the professor draws on the whiteboard. Our system captures periodic frames of the physical whiteboard, uses AI to logically merge them into structured Markdown/LaTeX notes, and synchronizes them with real-time speaker transcription.
2. **The Personal Study Experience (Canvas Study Tool):** A digital, interactive whiteboard where students can draw their math problems, diagrams, or notes. With a single click, our "AI Design Director/Tutor" analyzes the drawing and gives contextual, helpful hints—without just blurting out the final answer. 

---

## 🛠 Tech Stack

We leveraged a modern, heavily decoupled architecture to ensure smooth real-time performance.

### **Frontend**
- **React & TypeScript**: For building a robust, type-safe user interface.
- **Vite**: Provides lightning-fast Hot Module Replacement (HMR) and optimized build processes.
- **Fabric.js**: Powers the interactive, pixel-perfect digital drawing canvas.
- **WebSocket (Native)**: Enables real-time pushing of notes and transcripts from the server without polling.

### **Backend**
- **Python & FastAPI**: An async Python web framework capable of handling simultaneous WebSocket connections alongside heavy computation.
- **OpenCV & PyAudio**: Manages hardware-level video camera capture and microphone audio streaming in background threads, keeping the async server responsive.
- **Uvicorn**: An ASGI web server designed for concurrency.

### **AI & Cloud Integrations**
- **Google Gemini (Vision 2.0 Flash)**: 
  - *Whiteboard Merging*: Compares current camera frames against previously saved whiteboard states to intelligently extract *new* notes without duplicating existing text.
  - *Canvas Tutoring*: Analyzes the complex drawings/sketches submitted by students from the frontend canvas to understand context, equations, layouts, and geometries, providing high-quality pedagogical assistance.
  - *Art Generation*: Translates rough student sketches into beautiful, full-color illustrative imagery.
- **ElevenLabs API**: Powers our ultra-low latency, real-time audio transcription. We establish a WebSocket connection directly to ElevenLabs to stream the professor's audio chunks and receive formatted text segments in return.
- **Featherless API**: Integrated for fast, efficient hosting of open-source conversational LLMs.

---

## 🧠 How the AI Integrates

The magic of our project lies in how the AI agents act continuously and proactively in the background, interacting natively with human input.

### 1. Real-Time Lecture Capture Loop
- **The Trigger**: As soon as a student connects to the lecture via WebSockets, our Python backend spawns two background threads.
- **Visual Branch**: Every 5 seconds, OpenCV grabs a frame from the physical camera. The backend sends the image *along with the existing summarized notes* to **Gemini Vision**. Gemini intelligently diffs them. It recognizes objects the professor is standing in front of, updates changed diagrams, and returns a cohesive Markdown+LaTeX string.
- **Audio Branch**: Simultaneously, `PyAudio` streams chunks of microphone data to **ElevenLabs** to generate an accurate transcription stream.
- **The Delivery**: The FastAPI backend combines both streams and pushes JSON payloads over WebSockets directly to the React frontend, updating the student's dashboard in live time. 

### 2. Interactive Canvas Tutoring Loop
- **The Trigger**: A student is stuck on a problem they've drawn on the digital canvas and asks for AI help.
- **The Processing**: The frontend serializes the Fabric.js canvas into a base64 Data URL and posts it to our FastAPI backend (`/api/analyze-canvas`).
- **The AI Analysis**: FastAPI hands the image data and the student's text prompt to **Gemini Vision**. Gemini acts as a tutor. It analyzes the specific coordinates, strokes, and geometric relationships on the canvas. 
- **The Result**: Instead of just solving the equation, Gemini generates a rich Markdown/LaTeX explanation that guides the student through their specific drawing mistake or points them toward the next logical step. The student sees this rendered smoothly on their side-panel UI.

---

## 🚀 How to Run the Project Locally

1. **Clone the repository.**
2. **Backend Setup**:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate   # (Windows)
   pip install -r requirements.txt
   ```
3. **Environment Variables**: Create a `.env` file in the root directory and add your API credentials:
   ```env
   ELEVENLABS_API_KEY=your_key_here
   GEMINI_API_KEY=your_key_here
   FEATHERLESS_API_KEY=your_key_here
   ```
4. **Start the Backend**:
   ```bash
   python server.py
   # The API and WebSocket server will run on http://127.0.0.1:8000
   ```
5. **Start the Frontend**: Open a new terminal.
   ```bash
   cd frontend
   npm install
   npm run dev
   # The Vite server will run on http://localhost:5173
   ```
6. **Access the App**: Navigate to `http://localhost:5173` in your browser.
