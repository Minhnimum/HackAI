/**
 * TranscriptPanel.tsx — The right panel that shows the live lecture transcript.
 *
 * Displays a scrolling list of committed speech segments plus the current
 * in-progress partial (shown dimmed/italic while the professor is mid-sentence).
 *
 * Auto-scrolls to the bottom whenever new content arrives so students always
 * see the most recent text without manually scrolling down.
 */

import { useEffect, useRef } from 'react';
import TranscriptSegment from './TranscriptSegment';
import type { TranscriptSegmentData } from '../types/messages';
import styles from './TranscriptPanel.module.css';

interface TranscriptPanelProps {
  /** All committed transcript segments, in arrival order. */
  segments: TranscriptSegmentData[];

  /**
   * The real-time in-progress text from ElevenLabs' partial transcript.
   * Empty string when the professor isn't speaking or just finished a sentence.
   */
  partialText: string;
}

/**
 * Renders the right panel with the scrolling live transcript.
 *
 * @param segments    - Committed speech segments from useWebSocket.
 * @param partialText - Current partial (in-progress) transcript text.
 */
export default function TranscriptPanel({ segments, partialText }: TranscriptPanelProps) {
  // A ref attached to the scrollable body div. Refs give us direct access to a
  // DOM element without triggering re-renders — exactly what we need for
  // imperative scroll manipulation.
  const bodyRef = useRef<HTMLDivElement>(null);

  // Scroll to the bottom whenever segments or partialText changes.
  // useEffect runs AFTER React has updated the DOM, so scrollHeight is accurate
  // and includes any newly rendered content.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [segments, partialText]);

  const hasContent = segments.length > 0 || partialText.length > 0;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>Live Transcript</div>

      <div className={styles.panelBody} ref={bodyRef}>
        {hasContent ? (
          <>
            {/* Render committed segments. Each segment manages its own
                highlight animation internally via TranscriptSegment. */}
            {segments.map((seg) => (
              <TranscriptSegment
                key={seg.id}
                text={seg.text}
                isNew={seg.isNew}
                isPartial={false}
              />
            ))}

            {/* Render the partial (in-progress) segment if there is one.
                We show it as a separate visual segment, dimmed and italic,
                so students can see the professor is still speaking. */}
            {partialText && (
              <TranscriptSegment
                // Using "partial" as the key means React reuses this DOM node
                // on every partial update instead of creating a new one —
                // which avoids flickering as the text changes rapidly.
                key="partial"
                text={partialText}
                isNew={false}
                isPartial={true}
              />
            )}
          </>
        ) : (
          <p className={styles.emptyState}>Waiting for audio…</p>
        )}
      </div>
    </section>
  );
}
