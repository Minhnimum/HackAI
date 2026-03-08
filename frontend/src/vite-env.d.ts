/**
 * vite-env.d.ts — Type declarations for Vite-specific imports.
 *
 * This file tells TypeScript about things that Vite handles at build time
 * but that TypeScript doesn't know about on its own:
 *
 *   - `import styles from './Foo.module.css'`
 *     CSS Modules are transformed by Vite into a plain JavaScript object
 *     that maps class names to hashed strings. TypeScript needs to know
 *     that these imports return `{ [className: string]: string }`.
 *
 *   - `import.meta.env` — Vite's environment variable API.
 *   - `import.meta.hot` — Vite's Hot Module Replacement API.
 *
 * The triple-slash reference below pulls in all of these declarations from
 * the `vite/client` package that was installed as a dev dependency.
 */

/// <reference types="vite/client" />
