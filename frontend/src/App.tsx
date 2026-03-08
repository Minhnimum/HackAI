/**
 * App.tsx — The root React component.
 *
 * App has three responsibilities:
 *   1. Call useWebSocket() to establish the server connection and receive live data.
 *   2. Track which view is active — 'home' (landing page) or 'session' (live panels).
 *   3. Lay out the appropriate view and pass data down as props.
 *
 * The WebSocket connection starts immediately (even on the home page) so that the
 * connection status badge on the landing page reflects the live server state.
 * When the user clicks "Join Session", the view flips to 'session' — no page
 * reload or URL change, just a React state update.
 *
 * This is the only component that knows about WebSocket state. All child
 * components receive their data as plain props and don't know (or care) where
 * it comes from. This separation makes components easier to understand and test.
 */

import { useState } from 'react';
import Header from './components/Header';
import WhiteboardPanel from './components/WhiteboardPanel';
import TranscriptPanel from './components/TranscriptPanel';
import HomePage from './pages/HomePage';
import { useWebSocket } from './hooks/useWebSocket';
import styles from './App.module.css';

// ---------------------------------------------------------------------------
// View type
// ---------------------------------------------------------------------------

// A union type means the variable can only ever be one of these two strings.
// TypeScript will warn us if we accidentally assign something else.
type View = 'home' | 'session';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function App() {
  // useState<View>('home') creates a state variable that starts as 'home'.
  // `setView` is the function we call to change it (which triggers a re-render).
  const [view, setView] = useState<View>('home');

  // useWebSocket() handles connection, reconnection, keepalive, and parsing.
  // It returns the current state that the UI needs to render.
  // We call it here (not inside HomePage) so the connection is established
  // immediately — the home page can then show the live server status.
  const { status, whiteboardData, segments, partialText } = useWebSocket();

  // ---------------------------------------------------------------------------
  // Home view
  // ---------------------------------------------------------------------------

  if (view === 'home') {
    return (
      <HomePage
        status={status}
        // Arrow function so we don't have to define a named handler.
        // Clicking Join Session switches the view — instant, no network request.
        onJoin={() => setView('session')}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Session view
  // ---------------------------------------------------------------------------

  return (
    // The outer div fills the viewport and stacks header + main vertically.
    <div className={styles.layout}>
      {/* Header shows the connection status dot and title */}
      <Header status={status} />

      {/* Main area: two panels side by side.
          WhiteboardPanel is on the left (flexible width).
          TranscriptPanel is on the right (fixed width). */}
      <main className={styles.main}>
        <WhiteboardPanel data={whiteboardData} />
        <TranscriptPanel segments={segments} partialText={partialText} />
      </main>
    </div>
  );
}
