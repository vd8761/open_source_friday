import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({ 
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Open Source Friday',
        short_name: 'OS Friday',
        description: 'Dashboard for Open Source Friday registrations',
        theme_color: '#07a97b',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
