/**
 * Header.tsx — The top bar showing the app title and connection status.
 *
 * The status dot is red when disconnected and green + pulsing when live.
 * The status label gives a text description for accessibility.
 */

import styles from './Header.module.css';
import type { ConnectionStatus } from '../hooks/useWebSocket';

interface HeaderProps {
  /** Current WebSocket connection state from the useWebSocket hook. */
  status: ConnectionStatus;
}

/**
 * Renders the top navigation bar with a connection status indicator.
 *
 * @param status - 'connecting' | 'live' | 'error' from the useWebSocket hook.
 */
export default function Header({ status }: HeaderProps) {
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
    </header>
  );
}
