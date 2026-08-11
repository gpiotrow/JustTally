import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Deliberately separate from vite.config.ts, same as the backend keeps its
 * vitest.config.js apart from any dev-server config. Reusing vite.config.ts
 * would pull VitePWA into every test run — a service-worker build step that
 * has nothing to do with unit tests and only slows them down.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
