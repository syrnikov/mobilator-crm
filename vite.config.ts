import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages servește aplicația sub /<repo>/ — BASE_PATH vine din workflow.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png', 'logo_light.png', 'logo_dark.png'],
      manifest: {
        name: 'Mobilator CRM',
        short_name: 'Mobilator',
        description: 'Conexiuni noi de la târguri și întâlniri — Mobilator',
        lang: 'ro',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#EFEAE0',
        theme_color: '#151310',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /\/storage\/v1\/object\/public\/logos\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'logos', expiration: { maxEntries: 300 } },
          },
        ],
      },
    }),
  ],
})
