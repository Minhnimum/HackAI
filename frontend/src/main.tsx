/**
 * main.tsx — The React application entry point.
 *
 * This file is the first thing Vite loads. Its only job is to find the
 * <div id="root"> placeholder in index.html and mount the React component
 * tree into it. After this file runs, React controls the entire page.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Find the root div declared in index.html.
// The non-null assertion (!) tells TypeScript we are certain this element
// exists. If it somehow doesn't, we throw early with a clear error message
// rather than letting React crash with a confusing stack trace.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error(
    'Root element not found. Make sure index.html contains <div id="root">.'
  );
}

// createRoot() is the React 18 API for mounting a React app.
// It replaces the older ReactDOM.render() which is deprecated.
//
// StrictMode wraps the app in development-time safety checks:
//   - Components are rendered twice to detect side effects
//   - Deprecated API usages are flagged with console warnings
// These checks are stripped out in production builds automatically.
import { BrowserRouter } from 'react-router-dom';

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
