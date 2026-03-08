/**
 * HomePage.tsx — The landing page for EchoBoard.
 *
 * This is the first thing students see when they open the app. Its job is to:
 *   1. Show whether the server is reachable before the student joins.
 *   2. Briefly explain what EchoBoard does (without marketing fluff).
 *   3. Give a clear "Join Session" button that swaps to the two-panel view.
 *
 * Pure presentational component — all live data and behavior come in as props.
 */

import type { ConnectionStatus } from '../hooks/useWebSocket';
import styles from './HomePage.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HomePageProps {
  /** Current WebSocket connection state — controls the status badge color. */
  status: ConnectionStatus;
  /** Called when the user clicks "Join Session". App.tsx switches views. */
  onJoin: () => void;
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

/**
 * Returns display text and a CSS data-attribute value for a given status.
 *
 * @param status - The current ConnectionStatus from useWebSocket.
 * @returns label (display text) and modifier (used as data-status in CSS).
 */
function getStatusInfo(status: ConnectionStatus): { label: string; modifier: string } {
  switch (status) {
    case 'live':       return { label: 'Session live',   modifier: 'live'       };
    case 'connecting': return { label: 'Connecting…',    modifier: 'connecting' };
    case 'error':      return { label: 'Server offline', modifier: 'error'      };
  }
}

// ---------------------------------------------------------------------------
// Feature card data
// ---------------------------------------------------------------------------

const FEATURE_CARDS = [
  {
    icon: '◻',
    title: 'Board to text',
    body: 'Gemini reads the whiteboard every few seconds and formats whatever is written — equations, bullet points, diagrams.',
  },
  {
    icon: '◎',
    title: 'Live transcript',
    body: 'Speech is transcribed word-by-word as the lecture happens. Scroll back if you missed something.',
  },
  {
    icon: '∫',
    title: 'Math that renders',
    body: 'LaTeX the professor writes comes through as real equations — not a wall of backslashes.',
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Landing page shown before the student joins the live session.
 *
 * @param status - Connection status from useWebSocket, drives the badge.
 * @param onJoin - Switches the app to the session view when called.
 */
export default function HomePage({ status, onJoin }: HomePageProps) {
  const { label, modifier } = getStatusInfo(status);

  return (
    <div className={styles.page}>

      {/* ------------------------------------------------------------------ */}
      {/* Top bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className={styles.topBar}>
        <span className={styles.wordmark}>EchoBoard</span>

        <span className={styles.statusBadge} data-status={modifier}>
          <span className={styles.pulseDot} />
          {label}
        </span>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.hero}>

        <p className={styles.eyebrow}>Classroom capture</p>

        <h1 className={styles.heroTitle}>
          The board, the lecture —<br />on your screen.
        </h1>

        <p className={styles.heroSubtitle}>
          EchoBoard watches the whiteboard and listens to the room,
          so students can follow along from their own devices.
          No app, no account — just open a tab.
        </p>

        <div className={styles.heroActions}>
          <span className={`${styles.statusBadge} ${styles.statusBadgeLarge}`} data-status={modifier}>
            <span className={styles.pulseDot} />
            {label}
          </span>

          <button
            className={styles.joinButton}
            onClick={onJoin}
            aria-label="Join the live lecture session"
          >
            Join session →
          </button>
        </div>
      </section>

      {/* Thin gradient rule between hero and cards */}
      <div className={styles.divider} aria-hidden="true" />

      {/* ------------------------------------------------------------------ */}
      {/* Feature cards                                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.featureGrid} aria-label="Features">
        {FEATURE_CARDS.map((card) => (
          <article key={card.title} className={styles.featureCard}>
            <span className={styles.cardIcon} aria-hidden="true">{card.icon}</span>
            <h2 className={styles.cardTitle}>{card.title}</h2>
            <p className={styles.cardBody}>{card.body}</p>
          </article>
        ))}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                              */}
      {/* ------------------------------------------------------------------ */}
      <footer className={styles.footer}>
        EchoBoard · Gemini Vision + ElevenLabs Scribe
      </footer>

    </div>
  );
}
