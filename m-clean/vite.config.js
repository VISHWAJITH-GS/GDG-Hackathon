// vite.config.js — Vite + Tailwind CSS v4 + PWA plugin configuration
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    // React fast refresh support
    react(),

    // Tailwind CSS v4 — handled entirely as a Vite plugin (no postcss.config needed)
    tailwindcss(),

    // PWA — generates service worker + web manifest automatically
    VitePWA({
      registerType: 'autoUpdate',   // SW updates silently in background
      injectRegister: 'auto',       // Auto-inject the SW registration script

      // Web App Manifest — defines how the app looks when installed
      manifest: {
        name: 'm-clean',
        short_name: 'm-clean',
        description: 'Cleanliness reporting & officer dashboard PWA',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },

      // Workbox — pre-cache all static assets for offline support
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },

      // Dev options — enable PWA in dev mode so you can test it
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
