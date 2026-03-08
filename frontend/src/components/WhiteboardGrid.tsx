/**
 * WhiteboardGrid.tsx — CSS grid layout that mirrors the physical whiteboard.
 *
 * The server (via Gemini) sends a `columns` array and a `cells` array.
 * This component translates those into a CSS grid so content appears in
 * the same spatial arrangement as on the physical whiteboard:
 *   - Left column = left side of the board
 *   - Middle column = center of the board
 *   - Right column = right side of the board
 *
 * Each cell knows its own row, column, and optional column span.
 */

import GridCell from './GridCell';
import type { Cell } from '../types/messages';
import styles from './WhiteboardGrid.module.css';

interface WhiteboardGridProps {
  /**
   * Array of proportional column weights from Gemini.
   * Example: [1, 2, 1] means 3 columns — the middle is conceptually wider.
   * The LENGTH of this array controls how many columns the CSS grid has.
   * We currently use max-content sizing (not fractional widths) so each
   * column is exactly as wide as its widest cell.
   */
  columns: number[];

  /** The content cells to render. Each knows where it lives in the grid. */
  cells: Cell[];
}

/**
 * Renders a coordinate-aware CSS grid populated with whiteboard content cells.
 *
 * @param columns - Column count/weight array from Gemini's JSON output.
 * @param cells   - Array of Cell objects with row, col, colSpan, content, style.
 */
export default function WhiteboardGrid({ columns, cells }: WhiteboardGridProps) {
  // Build the CSS `grid-template-columns` value.
  // `max-content` sizes each column to the width of its widest child cell.
  // This prevents columns from stretching to fill empty space, which would
  // make the layout look wrong when Gemini puts content only on the left.
  // We call .map(() => 'max-content') so every column gets the same sizing rule
  // regardless of the numeric weight values in the columns array.
  const gridTemplateColumns = columns.map(() => 'max-content').join(' ');

  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns }}
    >
      {cells.map((cell) => (
        // key must be unique and stable. Row+col makes a natural compound key
        // because each grid position can only be occupied by one cell.
        <GridCell
          key={`${cell.row}-${cell.col}`}
          cell={cell}
        />
      ))}
    </div>
  );
}
