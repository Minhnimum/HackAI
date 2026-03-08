/**
 * WhiteboardPanel.tsx — The left panel that shows AI-formatted whiteboard notes.
 *
 * This component is a shell: it renders the panel chrome (header bar, scrollable body)
 * and delegates the actual grid rendering to WhiteboardGrid.
 * When no data has arrived yet, it shows a placeholder message instead.
 */

import WhiteboardGrid from './WhiteboardGrid';
import ChatBox from './ChatBox';
import type { WhiteboardData } from '../types/messages';
import styles from './WhiteboardPanel.module.css';

interface WhiteboardPanelProps {
  /**
   * The parsed whiteboard state from the server.
   * null means no whiteboard data has been received yet.
   */
  data: WhiteboardData | null;
}

/**
 * Renders the left panel containing the coordinate-aware whiteboard grid.
 *
 * @param data - Parsed { columns, cells } from the latest whiteboard message,
 *               or null if the session just started.
 */
export default function WhiteboardPanel({ data }: WhiteboardPanelProps) {
  // We only render the grid if we have cells to show.
  // An empty cells array also shows the placeholder, which prevents a blank
  // grid from flashing before the first content arrives.
  const hasCells = data !== null && data.cells.length > 0;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>Whiteboard Notes</div>

      {/* The scrollable body. overflow-y: auto is set in CSS so long content
          scrolls within the panel rather than expanding it. */}
      <div className={styles.panelBody}>
        {hasCells ? (
          <WhiteboardGrid columns={data!.columns} cells={data!.cells} />
        ) : (
          <p className={styles.emptyState}>Waiting for whiteboard content…</p>
        )}
      </div>

      {/* EchoBoard chat section — fixed height below the scrollable board.
          Students type questions here and get Gemini answers grounded in the
          lecture content captured so far. No WebSocket needed — it uses HTTP POST. */}
      <ChatBox />
    </section>
  );
}
