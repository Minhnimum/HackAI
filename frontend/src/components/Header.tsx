/**
 * Header.tsx — The top bar showing the app title and connection status.
 *
 * The status dot is red when disconnected and green + pulsing when live.
 * The status label gives a text description for accessibility.
 */

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Moon, Sun } from 'lucide-react';
import type { ConnectionStatus } from '../hooks/useWebSocket';
import { animateThemeSwitch } from '../utils/themeTransition';
import styles from './Header.module.css';

interface HeaderProps {
  /** Current WebSocket connection state from the useWebSocket hook. */
  status: ConnectionStatus;
}

export default function Header({ status }: HeaderProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check saved theme on mount
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
  // Map status → a human-readable label for the UI.
  const statusLabel =
    status === 'live'       ? 'Live'           :
    status === 'connecting' ? 'Connecting…'    :
                              'Reconnecting…';

  return (
    <header className={styles.header}>
      {/*
        The status dot: green + animated when live, red when not.
        We apply styles.live conditionally with a template string.
        The pulsing animation (defined in Header.module.css) gives a
        visual heartbeat to confirm the connection is active.
      */}
      <div
        className={`${styles.dot} ${status === 'live' ? styles.live : ''}`}
        aria-hidden="true"
      />
      <h1 className={styles.title}>EchoBoard</h1>
      <span className={styles.label}>{statusLabel}</span>

      <nav className={styles.nav}>
        <NavLink 
          to="/"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
          end
        >
          <Home size={18} />
        </NavLink>
        <NavLink 
          to="/lecture"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
        >
          Lecture Mode
        </NavLink>
        <NavLink 
          to="/canvas"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
        >
          Canvas Mode
        </NavLink>

        <button 
          onClick={(e) => toggleTheme(e)} 
          className={styles.themeToggle}
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </nav>
    </header>
  );
}
