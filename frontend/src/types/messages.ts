/**
 * messages.ts — TypeScript types for every WebSocket message the server sends.
 *
 * TypeScript types are erased at runtime (they exist only during development
 * and compilation). But they are extremely useful here because they let the
 * editor and compiler warn us if we try to access a field that doesn't exist
 * or pass the wrong data type to a component.
 *
 * All types here mirror the JSON shapes documented in CLAUDE.md.
 */

// ---------------------------------------------------------------------------
// Grid cell types (for whiteboard messages)
// ---------------------------------------------------------------------------

/**
 * A single content cell in the whiteboard grid.
 * Gemini outputs an array of these in its JSON response.
 *
 * row and col are 1-based grid positions (CSS grid uses 1-based indexing).
 * colSpan controls how many columns wide a cell is (default 1).
 * content is a Markdown+LaTeX string — react-markdown handles rendering it.
 * style contains optional visual hints from Gemini.
 */
export type Cell = {
  row: number;
  col: number;
  colSpan?: number;
  content: string;
  style?: {
    justifySelf?: 'start' | 'center' | 'end';
    fontWeight?: 'normal' | 'bold';
    // fontSize tokens that map to CSS rem values (see GridCell.tsx)
    fontSize?: 'small' | 'normal' | 'large' | 'xlarge';
  };
};

/**
 * The full whiteboard state as parsed from the JSON string inside
 * a WhiteboardMessage's `full` field.
 *
 * columns is an array of proportional weights — one entry per column.
 * Its LENGTH tells us how many columns the grid has; the numeric values
 * are currently unused (we use max-content sizing instead of stretching).
 * Example: [1, 2, 1] → 3 columns, middle one is "wider" conceptually.
 *
 * cells is the list of content cells to render.
 */
export type WhiteboardData = {
  columns: number[];
  cells: Cell[];
};

// ---------------------------------------------------------------------------
// WebSocket message shapes
// ---------------------------------------------------------------------------

/**
 * Sent by the server when the whiteboard content changes.
 * `full` is a JSON string containing { columns, cells } — parse it with JSON.parse().
 * `delta` is always an empty string (the full state replaces the previous state).
 */
export type WhiteboardMessage = {
  type: 'whiteboard';
  full: string;
  delta: string;
};

/**
 * Sent by the server for transcript updates.
 *
 * On connect (catch-up):  full = entire transcript so far, delta = ""
 * On new speech segment:  full = entire transcript, delta = the new sentence
 *
 * We use delta to detect which case we're in — empty string = catch-up.
 */
export type TranscriptMessage = {
  type: 'transcript';
  full: string;
  delta: string;
};

/**
 * Sent continuously while ElevenLabs is still processing a speech segment.
 * This is the real-time "best guess" before the sentence finishes.
 * The browser shows it dimmed/italic to indicate it's not final.
 */
export type PartialMessage = {
  type: 'transcript_partial';
  text: string;
};

/**
 * Union type: any message the server might send over the WebSocket.
 * TypeScript uses the `type` field to narrow which shape a message has
 * in if/switch statements (this is called a "discriminated union").
 */
export type ServerMessage = WhiteboardMessage | TranscriptMessage | PartialMessage;

// ---------------------------------------------------------------------------
// UI-level transcript segment type
// ---------------------------------------------------------------------------

/**
 * One committed speech segment as tracked in React state.
 *
 * id:    Unique string key — React uses this to identify list items.
 * text:  The committed transcript text for this speech segment.
 * isNew: Whether this segment just arrived (triggers the highlight animation).
 *        False for segments loaded from a catch-up message on reconnect.
 */
export type TranscriptSegmentData = {
  id: string;
  text: string;
  isNew: boolean;
};
