/**
 * TranscriptSegment.tsx — A single line in the transcript panel.
 *
 * Each committed speech segment is one of these. The segment highlights in
 * indigo when it first arrives and fades back to normal after 3 seconds,
 * giving a visual cue that new content just appeared.
 *
 * Partial (in-progress) segments are rendered with a different dimmed style
 * to indicate that ElevenLabs is still processing the speech.
 */

import { useState, useEffect } from 'react';
import styles from './TranscriptSegment.module.css';

interface TranscriptSegmentProps {
  /** The transcript text for this segment. */
  text: string;

  /**
   * True if this segment was newly committed (not loaded from a catch-up message).
   * When true, the component starts in a highlighted state and fades after 3 seconds.
   */
  isNew: boolean;

  /**
   * True if this is the current in-progress partial transcript.
   * Partial segments are dimmed and italic to distinguish from committed text.
   */
  isPartial: boolean;
}

// How long to show the "new segment" highlight before fading it out.
const NEW_HIGHLIGHT_DURATION_MS = 3000; // 3 seconds — long enough to notice, short enough to not distract

/**
 * Renders one transcript segment with optional highlight and fade animation.
 *
 * @param text      - The text content to display.
 * @param isNew     - Whether to show the arrival highlight animation.
 * @param isPartial - Whether to show the partial/in-progress styling.
 */
export default function TranscriptSegment({ text, isNew, isPartial }: TranscriptSegmentProps) {
  // Local state: track whether the highlight is currently showing.
  // We initialize from the `isNew` prop so new segments start highlighted.
  // We use local state (not the prop) so we can clear the highlight after
  // the timer fires, without needing the parent to know about it.
  const [highlighted, setHighlighted] = useState(isNew);

  // When a new segment mounts with isNew = true, schedule the highlight removal.
  // The empty dependency array [] means this effect runs once on mount only —
  // which is exactly what we want. The value of `isNew` at mount time is
  // what determines whether we set the timer. If the prop changes later
  // (it won't, since each segment has a stable key), we don't care.
  useEffect(() => {
    if (!isNew) return; // Catch-up segments don't need a timer

    const timer = setTimeout(() => {
      setHighlighted(false);
    }, NEW_HIGHLIGHT_DURATION_MS);

    // Cleanup: if this component unmounts before the timer fires
    // (shouldn't happen normally, but good practice), cancel the timer.
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build the className string by combining the base class with conditional classes.
  // Template literals let us compose class names cleanly.
  const className = [
    styles.segment,
    highlighted  ? styles.new     : '',
    isPartial    ? styles.partial  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className}>
      {text}
    </div>
  );
}
