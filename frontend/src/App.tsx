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


import { Routes, Route, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import WhiteboardPanel from './components/WhiteboardPanel';
import TranscriptPanel from './components/TranscriptPanel';
import HomePage from './pages/HomePage';
import CanvasPage from './pages/CanvasPage';
import { useWebSocket } from './hooks/useWebSocket';
import styles from './App.module.css';

export default function App() {
  const { status, whiteboardData, segments, partialText } = useWebSocket();
  const navigate = useNavigate();

  return (
    <div className={styles.layout}>
      <Routes>
        {/* Landing Page */}
        <Route 
          path="/" 
          element={
            <HomePage
              status={status}
              onJoin={() => navigate('/lecture')}
            />
          } 
        />
        
        {/* Lecture Mode */}
        <Route 
          path="/lecture" 
          element={
            <>
              <Header status={status} />
              <main className={styles.main}>
                <WhiteboardPanel data={whiteboardData} />
                <TranscriptPanel segments={segments} partialText={partialText} />
              </main>
            </>
          } 
        />
        
        {/* Canvas Mode */}
        <Route 
          path="/canvas" 
          element={
            <>
              <Header status={status} />
              <main className={styles.main}>
                <CanvasPage />
              </main>
            </>
          } 
        />
      </Routes>
    </div>
  );
}
