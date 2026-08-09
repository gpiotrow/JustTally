import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Baked in at Docker build time (Dockerfile ARG/ENV); empty until R2 is live.
// generateSW serializes function-typed urlPattern entries via `.toString()`,
// so a closure over this would reference an undefined variable once that
// source lands in the service worker — a RegExp literal per origin avoids
// that instead of building one combined predicate function.
const mediaOrigin = process.env.VITE_MEDIA_ORIGIN || '';
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Just Tally',
        short_name: 'Just Tally',
        description: 'Gym tracker — exercises with instructions, photos and videos',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        runtimeCaching: [
          {
            // Local driver: media served from the app's own origin.
            urlPattern: /\/uploads\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              // 500 exercises x up to 2 files (full + thumbnail) is already
              // 1000 — 200 would start evicting cached photos mid-catalog.
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          ...(mediaOrigin
            ? [
                {
                  // R2/CDN driver: media served from a separate origin.
                  urlPattern: new RegExp(`^${escapeRegExp(mediaOrigin)}/`),
                  handler: 'CacheFirst' as const,
                  options: {
                    cacheName: 'media-cache',
                    expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ]
            : []),
          {
            // Stale-while-revalidate for the exercises API.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/exercises'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-exercises',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
