import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      'sileo': fileURLToPath(new URL('./src/utils/sileo-adapter.tsx', import.meta.url))
    }
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: [
        'Icon-app.webp',
        'Clients.webp',
        'Mesas.webp',
        'Reservas.webp',
        'comanda.webp',
        'hotel.webp',
        'menu.webp',
        'no_resultado.webp',
        'ordenes.webp',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
      ],
      // Workbox: estrategias de caché offline-first
      workbox: {
        // Precachea todos los assets del build
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // Rutas que van directo a la red (Supabase / PowerSync)
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/realtime\//],
        runtimeCaching: [
          // Google Fonts: cache-first
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Imágenes remotas: cache-first
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Supabase API: network-first (datos siempre frescos cuando hay red)
          {
            urlPattern: /^https:\/\/.+\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      // Manifest de la PWA
      manifest: {
        name: 'POS Restaurante',
        short_name: 'POS Food',
        description: 'Sistema de comandas y gestión de mesas para restaurante',
        theme_color: '#2f3325',
        background_color: '#2f3325',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'es',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/Icon-app.webp',
            sizes: '1000x1000',
            type: 'image/webp',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/screenshot_desktop.png',
            sizes: '1024x1024',
            type: 'image/png',
            form_factor: 'wide',
            label: 'POS Restaurante Escritorio',
          },
          {
            src: '/screenshot_mobile.png',
            sizes: '1024x1024',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'POS Restaurante Móvil',
          },
        ],
        categories: ['food', 'business', 'productivity'],
        shortcuts: [
          {
            name: 'Mesas',
            short_name: 'Mesas',
            description: 'Plano de mesas',
            url: '/mesas',
            icons: [{ src: '/icon-512.png', sizes: '1024x1024', type: 'image/png' }],
          },
          {
            name: 'Órdenes',
            short_name: 'Órdenes',
            description: 'Historial de comandas',
            url: '/ordenes',
            icons: [{ src: '/icon-512.png', sizes: '1024x1024', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // Expone el servidor a la red local
  },
  worker: {
    format: 'es',
  },
})
