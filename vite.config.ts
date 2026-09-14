/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest,svg,ico}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 8787 },
  preview: { host: true, port: 8787 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
