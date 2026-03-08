/**
 * GridCell.tsx — A single cell in the whiteboard grid.
 *
 * Each cell renders its content string (which may contain Markdown and LaTeX)
 * using react-markdown with plugins for math and GitHub Flavored Markdown.
 *
 * Why react-markdown instead of innerHTML + marked.js?
 * The old vanilla JS approach (marked.parse() → innerHTML) required a manual
 * "extract math → parse markdown → restore math" hack because marked.js would
 * mangle LaTeX syntax like \\ (matrix row separator) and | (column delimiter).
 * react-markdown with remark-math processes math BEFORE the Markdown parser
 * ever sees it, so LaTeX is never mangled. No extraction hack needed.
 */

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import type { Cell } from '../types/messages';
import styles from './GridCell.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Gemini uses token names for font sizes to avoid sending raw CSS values.
// We map those tokens to CSS rem values here.
// rem units scale relative to the root font size (usually 16px),
// which means they respect the user's browser font-size preference.
const FONT_SIZE_MAP: Record<string, string> = {
  small:  '0.8rem',
  normal: '1rem',
  large:  '1.2rem',
  xlarge: '1.5rem',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GridCellProps {
  /** The cell data from Gemini's JSON output. */
  cell: Cell;
}

/**
 * Renders one cell of the whiteboard grid with Markdown + LaTeX content.
 *
 * Grid placement is applied via inline CSS (gridRow, gridColumn) so that
 * each cell sits exactly where Gemini placed it on the virtual board.
 * Optional style hints (justifySelf, fontWeight, fontSize) are also applied.
 *
 * @param cell - The Cell object from the server's whiteboard JSON.
 */
export default function GridCell({ cell }: GridCellProps) {
  const { row, col, colSpan = 1, content, style = {} } = cell;

  // Build the inline style object for this cell.
  // We use CSS grid placement properties to position the cell in the grid:
  //   gridRow: the row number (1-based, as Gemini outputs)
  //   gridColumn: "start / span N" means the cell starts at `col` and spans N columns
  const inlineStyle: React.CSSProperties = {
    gridRow: row,
    gridColumn: `${col} / span ${colSpan}`,
    // Only include optional style properties if Gemini included them.
    // The spread of an empty object `...{}` is a no-op, so this is safe.
    ...(style.justifySelf && { justifySelf: style.justifySelf }),
    ...(style.fontWeight  && { fontWeight:  style.fontWeight  }),
    ...(style.fontSize    && { fontSize: FONT_SIZE_MAP[style.fontSize] ?? style.fontSize }),
  };

  return (
    // The outer div handles grid placement and cell chrome (border, background).
    // The inner "markdown-content" class on the wrapper scopes the markdown
    // styles defined in index.css (h1, p, code, table, etc.) to this div.
    <div className={styles.cell} style={inlineStyle}>
      <div className="markdown-content">
        {/*
          ReactMarkdown renders the content string as React elements.
          Three plugins are active:

          remarkMath   — recognizes $...$ inline math and $$...$$ display math.
                         It runs during the PARSING step, before the Markdown
                         AST is processed, so LaTeX special characters like \\
                         and | are never seen by the Markdown renderer.

          rehypeKatex  — converts the math nodes from remarkMath into rendered
                         KaTeX HTML. rehype plugins run on the HTML AST, after
                         Markdown parsing is complete.

          remarkGfm    — enables GitHub Flavored Markdown extras:
                         tables, strikethrough (~~text~~), task lists, etc.
                         Needed because Gemini may output Markdown tables to
                         represent structured data like truth tables.
        */}
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
