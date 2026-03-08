/**
 * useWebSocket.ts — Custom React hook for the WebSocket connection.
 *
 * A "hook" in React is a function whose name starts with "use" that can
 * call other hooks (like useState and useEffect). Hooks let us share
 * stateful logic between components without duplicating code.
 *
 * This hook owns the entire WebSocket lifecycle:
 *   - Connecting to the server
 *   - Parsing incoming messages and updating React state
 *   - Reconnecting with exponential backoff when the connection drops
 *   - Sending keepalive pings so proxies don't close the idle connection
 *
 * It returns the parsed data that App.tsx passes down to the UI components.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ServerMessage, WhiteboardData, TranscriptSegmentData } from '../types/messages';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Reconnection timing — same values as the original vanilla JS frontend.
const RECONNECT_BASE_DELAY_MS = 2000;  // Start with a 2-second wait
const RECONNECT_MAX_DELAY_MS  = 15000; // Never wait longer than 15 seconds
const RECONNECT_MULTIPLIER    = 1.5;   // Each failure waits 1.5× longer than the last

// The server's receive_text() loop needs to see periodic traffic or some
// load balancers / reverse proxies will silently close the idle connection.
const KEEPALIVE_INTERVAL_MS = 20000; // Send a "ping" every 20 seconds

// ---------------------------------------------------------------------------
// Segment ID generator
// ---------------------------------------------------------------------------

// A simple counter for generating unique IDs for transcript segments.
// Defined outside the hook so the counter persists across hook re-runs
// (each render creates a new hook call, but the module-level variable stays).
// We use a simple counter rather than crypto.randomUUID() because it's
// synchronous, deterministic, and sufficient for our needs.
let segmentIdCounter = 0;
function nextSegmentId(): string {
  return `segment-${++segmentIdCounter}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The three possible connection states shown in the Header component.
export type ConnectionStatus = 'connecting' | 'live' | 'error';

// The shape of the object this hook returns to the component that calls it.
interface WebSocketHookReturn {
  status: ConnectionStatus;
  whiteboardData: WhiteboardData | null;
  segments: TranscriptSegmentData[];
  partialText: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the WebSocket connection to the FastAPI backend and returns
 * the current live state of the lecture (whiteboard + transcript).
 *
 * Usage in App.tsx:
 *   const { status, whiteboardData, segments, partialText } = useWebSocket();
 */
export function useWebSocket(): WebSocketHookReturn {
  // React state: changes to these variables trigger a re-render of any
  // component that receives them as props.
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [whiteboardData, setWhiteboardData] = useState<WhiteboardData | null>(null);
  const [segments, setSegments] = useState<TranscriptSegmentData[]>([]);
  const [partialText, setPartialText] = useState<string>('');

  // Refs: like state, but changes do NOT trigger re-renders.
  // We use refs for the WebSocket instance and timer IDs because we need to
  // access/cancel them in cleanup functions but changing them shouldn't
  // cause the component to re-render.
  const socketRef      = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef<number>(RECONNECT_BASE_DELAY_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  // useCallback memoizes the function so its identity stays stable across renders.
  // Without this, the function would be recreated every render, causing useEffect
  // (which depends on handleMessage) to re-run unnecessarily.
  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: ServerMessage;

    // The server always sends valid JSON, but defensive parsing prevents
    // the whole app from crashing if something unexpected arrives.
    try {
      msg = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }

    if (msg.type === 'whiteboard') {
      // `full` is a JSON *string* containing { columns, cells } — we need to
      // parse it a second time. This double-encoding exists because the server
      // stores the whiteboard as a JSON string internally.
      if (!msg.full) return;
      try {
        const parsed = JSON.parse(msg.full) as WhiteboardData;
        setWhiteboardData(parsed);
      } catch {
        // If Gemini returned malformed JSON, skip this update quietly.
        return;
      }

    } else if (msg.type === 'transcript') {
      // Distinguish catch-up (initial load) from incremental updates.
      // On connect the server sends: { delta: "", full: "entire transcript" }
      // On new speech:               { delta: "new sentence", full: "entire transcript" }
      // Empty delta string → catch-up.
      if (!msg.delta.trim()) {
        // Replace all existing segments with the full history as one block.
        // We mark isNew: false so no highlight animation plays on catch-up.
        if (msg.full.trim()) {
          setSegments([{ id: nextSegmentId(), text: msg.full, isNew: false }]);
        }
      } else {
        // A new committed speech segment arrived — append it as a new entry.
        // isNew: true triggers the highlight animation in TranscriptSegment.
        const newSeg: TranscriptSegmentData = {
          id:    nextSegmentId(),
          text:  msg.delta,
          isNew: true,
        };
        setSegments(prev => [...prev, newSeg]);
        // Clear the partial text — the committed segment replaces it.
        setPartialText('');
      }

    } else if (msg.type === 'transcript_partial') {
      // Real-time "still speaking" preview. Replace whatever partial was showing.
      setPartialText(msg.text);
    }
  }, []); // No dependencies — this function never needs to be recreated

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  const connect = useCallback(() => {
    // Build the WebSocket URL using the current page's host.
    // This works in both:
    //   - Dev mode: Vite proxies ws://localhost:5173/ws → ws://localhost:8000/ws
    //   - Production: FastAPI serves the React app and handles /ws directly
    const wsUrl = `ws://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;
    setStatus('connecting');

    ws.addEventListener('open', () => {
      setStatus('live');
      // Reset the backoff delay so the next disconnect starts fresh.
      reconnectDelay.current = RECONNECT_BASE_DELAY_MS;

      // Start sending periodic pings. The server's while True: receive_text()
      // loop just ignores "ping" text, but receiving it keeps the TCP connection
      // alive so proxies don't time it out.
      keepaliveTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, KEEPALIVE_INTERVAL_MS);
    });

    ws.addEventListener('close', () => {
      // Guard: if this socket is no longer the active one, it was already
      // replaced by a newer connect() call — do nothing.
      //
      // Why this matters in development: React StrictMode deliberately
      // unmounts and remounts every component once to surface side-effect
      // bugs. The unmount cleanup closes the first WebSocket, but because
      // WebSocket 'close' events are dispatched asynchronously (after the
      // current call stack), the close event fires AFTER the second
      // connect() has already created a new socket and stored it in
      // socketRef.current. Without this guard, the stale close handler
      // would schedule yet another connect(), leaving two active connections
      // that both receive and render every message — causing each transcript
      // line to appear twice.
      if (ws !== socketRef.current) return;

      setStatus('error');
      // Stop sending pings on a dead connection.
      if (keepaliveTimer.current) clearInterval(keepaliveTimer.current);

      // Schedule a reconnect attempt with exponential backoff.
      // Math.min() prevents the delay from growing forever — caps at 15 seconds.
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * RECONNECT_MULTIPLIER,
          RECONNECT_MAX_DELAY_MS
        );
        connect();
      }, reconnectDelay.current);
    });

    ws.addEventListener('error', () => {
      // The 'close' event always fires after 'error', so we let close handle
      // the reconnect logic. We just trigger the close here.
      ws.close();
    });

    ws.addEventListener('message', handleMessage);
  }, [handleMessage]);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Start the initial connection when the component mounts.
    connect();

    // Return a cleanup function that runs when the component unmounts
    // (e.g. the user navigates away or closes the tab). Without this,
    // we'd leak WebSocket connections and timer handles.
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (keepaliveTimer.current) clearInterval(keepaliveTimer.current);
      socketRef.current?.close();
    };
  }, [connect]); // connect is stable (useCallback with no deps), so this runs once

  return { status, whiteboardData, segments, partialText };
}
