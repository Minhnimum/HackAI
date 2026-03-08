import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite is the build tool and development server for this React app.
// In development, it runs on port 5173 with Hot Module Replacement (HMR) —
// changes to React components appear in the browser instantly without a page refresh.
// In production, `npm run build` compiles everything to static files in frontend/dist/.

export default defineConfig({
  plugins: [react()],

  server: {
    // During development the React app runs on port 5173 but the Python backend
    // runs on port 8000. The browser's WebSocket connection goes to whichever
    // host served the page — so without a proxy it would try ws://localhost:5173/ws
    // which doesn't exist. The proxy below intercepts /ws requests on port 5173
    // and forwards them to the FastAPI server on port 8000 transparently.
    proxy: {
      // Forward /api requests to the FastAPI backend during development.
      // Without this, the browser would send POST /api/chat to port 5173 (Vite)
      // instead of port 8000 (FastAPI) and get a 404.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8000',
        ws: true,          // Must be true for WebSocket (not just HTTP) proxying
        changeOrigin: true,

        // Suppress noisy-but-harmless proxy error logs.
        //
        // When the browser tab is refreshed or closed, the WebSocket connection
        // is torn down from the client side. Vite's proxy sees the abrupt close
        // and emits an 'error' event with code ECONNABORTED or ECONNRESET —
        // even though this is completely normal browser behaviour. Without this
        // handler, those events bubble up and print a multi-line stack trace to
        // the terminal on every page refresh, making real errors harder to spot.
        //
        // We re-log anything that is NOT one of these two expected disconnect
        // codes so genuine proxy failures (e.g. ECONNREFUSED when the Python
        // server isn't running) are still visible.
        configure: (proxy) => {
          const EXPECTED_DISCONNECT_CODES = new Set(['ECONNABORTED', 'ECONNRESET']);
          proxy.on('error', (err: NodeJS.ErrnoException) => {
            if (!EXPECTED_DISCONNECT_CODES.has(err.code ?? '')) {
              console.error('[vite ws proxy]', err.message);
            }
          });
        },
      },
    },
  },
});
