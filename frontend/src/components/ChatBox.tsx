/**
 * ChatBox.tsx — EchoBoard in-panel Q&A chat component.
 *
 * Renders a small Q&A thread at the bottom of the whiteboard panel.
 * Students type a question, hit Enter (or click Send), and Gemini answers
 * using the lecture context captured so far (speech + whiteboard events).
 *
 * This component is self-contained:
 *   - No WebSocket — it uses a plain HTTP POST to /api/chat.
 *   - No shared state — messages are stored locally in useState.
 *   - No external dependencies — just React hooks and the fetch API.
 */

import { useEffect, useRef, useState } from 'react';
import styles from './ChatBox.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single message in the Q&A thread.
 *
 * id:   Unique string used as the React key — avoids list re-render issues.
 * role: 'user' for student messages, 'assistant' for Gemini responses.
 * text: The message content as a plain string.
 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the EchoBoard chat section (header + history + input row).
 *
 * No props are needed — this component manages all its own state and talks
 * to the server directly via fetch().
 */
export default function ChatBox() {
  // All messages shown in the thread (both user and assistant).
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Current value of the textarea input.
  const [input, setInput] = useState('');

  // True while waiting for the Gemini response — disables the send button
  // and shows a "thinking…" bubble so students know a request is in flight.
  const [loading, setLoading] = useState(false);

  // A ref attached to the scrollable history div. We use a ref (not state)
  // because we want to manipulate the DOM scroll position directly without
  // triggering a re-render.
  const historyRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom of the history whenever messages change.
  // useEffect runs AFTER React updates the DOM, so scrollHeight is accurate
  // and includes any newly rendered message bubbles.
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Send logic
  // ---------------------------------------------------------------------------

  /**
   * Send the current input as a question to /api/chat.
   *
   * Steps:
   *   1. Trim and validate — do nothing if blank or already loading.
   *   2. Append the user's message to the thread immediately (optimistic UI).
   *   3. Clear the input and show the loading indicator.
   *   4. POST {"question": input} to /api/chat.
   *   5. Append Gemini's answer (or an error message) to the thread.
   */
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Append the user's message right away so the UI feels responsive.
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Clear the textarea and enter the loading state.
    setInput('');
    setLoading(true);

    try {
      // fetch() is the browser's built-in HTTP client. We send a POST request
      // with a JSON body. The Vite proxy (vite.config.ts) forwards this to
      // the FastAPI server on port 8000 during development.
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok) {
        // response.ok is false for 4xx/5xx HTTP status codes.
        throw new Error(`Server returned ${response.status}`);
      }

      // response.json() parses the response body as JSON.
      // We expect { "answer": "..." } from the server.
      const data = await response.json() as { answer: string };

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: data.answer,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      // Network errors, JSON parse failures, or non-OK HTTP responses all
      // end up here. Show a user-friendly error in the chat instead of crashing.
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: 'Something went wrong. Please check your connection and try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      // Always clear the loading state, whether the request succeeded or failed.
      setLoading(false);
    }
  }

  /**
   * Handle key events in the textarea.
   *
   * Enter alone submits the message.
   * Shift+Enter inserts a newline (default textarea behaviour — we don't interfere).
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Prevent the default newline insertion that Enter would normally add.
      e.preventDefault();
      handleSend();
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={styles.section}>
      {/* Header label — matches the panelHeader style in WhiteboardPanel */}
      <div className={styles.header}>Ask EchoBoard</div>

      {/* Scrollable Q&A thread */}
      <div className={styles.history} ref={historyRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}
          >
            {msg.text}
          </div>
        ))}

        {/* "Thinking…" indicator shown while the POST request is in flight.
            We render it as a separate element after the last message so it
            appears at the bottom of the thread. */}
        {loading && (
          <div className={styles.pending}>thinking…</div>
        )}
      </div>

      {/* Input row — textarea + Send button */}
      <div className={styles.inputRow}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about the lecture…"
          rows={1}
          disabled={loading}
        />
        <button
          className={styles.sendButton}
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
