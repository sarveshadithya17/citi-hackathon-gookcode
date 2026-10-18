import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = process.env.THIRAN_API || 'http://localhost:8000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/thiran-logo.svg', 'icons/thiran-logo-32.png', 'locales/*.json'],
      manifest: {
        name: 'Thiran - career companion',
        short_name: 'Thiran',
        description: 'Voice-first career companion for rural students',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fbf7f1',
        theme_color: '#0f766e',
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached so Thiran opens with no network.
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/docs/, /^\/openapi\.json/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/qr.svg'),
            handler: 'CacheFirst',
            options: { cacheName: 'thiran-qr', expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': API, '/docs': API, '/openapi.json': API },
  },
  build: { outDir: 'dist', sourcemap: false },
});
