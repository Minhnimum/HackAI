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

import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '../hooks/useWebSocket';
import {
  Search,
  MessageSquare,
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';
import styles from './HomePage.module.css';
import { animateThemeSwitch } from '../utils/themeTransition';

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
    icon: <Search size={24} />,
    title: 'Board to text',
    body: 'Gemini reads the whiteboard every few seconds and formats whatever is written — equations, bullet points, diagrams.',
  },
  {
    icon: <MessageSquare size={24} />,
    title: 'Live transcript',
    body: 'Speech is transcribed word-by-word as the lecture happens. Scroll back if you missed something.',
  },
  {
    icon: <Sparkles size={24} />,
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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('echoboard-theme');
    if (savedTheme === 'dark') {
      setIsDark(true);
      document.body.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const goingDark = !isDark;
    animateThemeSwitch(e, goingDark, () => {
      if (goingDark) {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('echoboard-theme', 'dark');
      } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('echoboard-theme', 'light');
      }
      setIsDark(goingDark);
    });
  };

  return (
    <div className={styles.page}>

      {/* Math Doodle Background */}
      <div className={styles.bgDoodle}>
        <svg className={styles.bgSvg} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
          {/* Integral symbols */}
          <text x="100" y="150" fontSize="80" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(-15 100 150)">∫</text>
          <text x="900" y="200" fontSize="60" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(20 900 200)">∫₀^∞</text>
          <text x="300" y="600" fontSize="70" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(10 300 600)">∫dx</text>
          
          {/* Mathematical equations */}
          <text x="700" y="500" fontSize="40" fill="var(--border-main)" fontFamily="Caveat, cursive" transform="rotate(-8 700 500)">E = mc²</text>
          <text x="150" y="400" fontSize="45" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(12 150 400)">πr²</text>
          <text x="950" y="600" fontSize="35" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(-12 950 600)">√(x² + y²)</text>
          
          {/* Sigma notation */}
          <text x="500" y="250" fontSize="65" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(8 500 250)">Σ</text>
          <text x="200" y="700" fontSize="50" fill="var(--border-main)" fontFamily="Caveat, cursive" transform="rotate(-10 200 700)">Σn=1</text>
          
          {/* Pi and other symbols */}
          <text x="800" y="100" fontSize="55" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(15 800 100)">π</text>
          <text x="400" y="450" fontSize="45" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(-5 400 450)">∞</text>
          <text x="600" y="700" fontSize="50" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(18 600 700)">θ</text>
          
          {/* Fractions and expressions */}
          <text x="50" y="280" fontSize="35" fill="var(--border-main)" fontFamily="Caveat, cursive" transform="rotate(-15 50 280)">dx/dy</text>
          <text x="1050" y="400" fontSize="40" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(10 1050 400)">f(x)</text>
          <text x="450" y="100" fontSize="38" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(-8 450 100)">sin(x)</text>
          
          {/* Doodle shapes */}
          <circle cx="250" cy="200" r="30" fill="none" stroke="var(--border-light)" strokeWidth="3" strokeDasharray="5,5" transform="rotate(25 250 200)"/>
          <circle cx="850" cy="350" r="25" fill="none" stroke="var(--border-light)" strokeWidth="3" strokeDasharray="5,5"/>
          <circle cx="550" cy="550" r="35" fill="none" stroke="var(--border-light)" strokeWidth="3" strokeDasharray="5,5" transform="rotate(-20 550 550)"/>
          
          {/* Arrows and lines */}
          <path d="M100,500 Q150,480 200,500" stroke="var(--border-light)" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)"/>
          <path d="M700,150 Q750,130 800,150" stroke="var(--border-light)" strokeWidth="2" fill="none"/>
          <path d="M350,350 L380,320" stroke="var(--border-main)" strokeWidth="2" markerEnd="url(#arrowhead)"/>
          
          {/* More math symbols */}
          <text x="650" y="350" fontSize="42" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(5 650 350)">∂/∂x</text>
          <text x="1100" y="700" fontSize="45" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(-12 1100 700)">±</text>
          <text x="300" y="80" fontSize="38" fill="var(--border-main)" fontFamily="Caveat, cursive" transform="rotate(20 300 80)">cos θ</text>
          <text x="950" y="450" fontSize="36" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(-6 950 450)">x → ∞</text>
          
          {/* Greek letters */}
          <text x="120" y="750" fontSize="48" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(8 120 750)">α β γ</text>
          <text x="850" y="750" fontSize="44" fill="var(--accent-light)" fontFamily="Caveat, cursive" transform="rotate(-15 850 750)">δ ε</text>
          
          {/* Plus/minus and operators */}
          <text x="500" y="450" fontSize="40" fill="var(--border-main)" fontFamily="Caveat, cursive" transform="rotate(12 500 450)">+ - ×</text>
          
          {/* More integrals */}
          <text x="1050" y="150" fontSize="55" fill="var(--accent)" fontFamily="Caveat, cursive" transform="rotate(-10 1050 150)">∮</text>
          
          {/* Arrow marker definition */}
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="var(--border-light)"/>
            </marker>
          </defs>
        </svg>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Top bar                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header className={styles.topBar}>
        <span className={styles.wordmark}>EchoBoard</span>

        <div className={styles.topBarActions}>
          <span className={styles.statusBadge} data-status={modifier}>
            <span className={styles.pulseDot} />
            {label}
          </span>
          <button 
            onClick={(e) => toggleTheme(e)} 
            className={styles.themeToggle}
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
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
