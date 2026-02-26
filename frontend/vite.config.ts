import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "UniPlanner",
        short_name: "UniPlanner",
        description: "Planificador académico universitario",
        theme_color: "#0EA5E9",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        orientation: "any",
        categories: ["education", "productivity"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        screenshots: [
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            form_factor: "wide",
            label: "UniPlanner - Panel Academico",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            form_factor: "narrow",
            label: "UniPlanner - Vista Movil",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Skip waiting so new versions activate immediately across devices
        skipWaiting: true,
        clientsClaim: true,
        // Navigation fallback for SPA routing
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // GET API calls: network-first with offline fallback
            urlPattern: /^\/api\/.*/i,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts webfont files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\.(?:woff2?|ttf|eot)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "font-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy /api → backend so the browser never makes cross-origin requests.
      // Cookies work correctly as same-origin.
      // In Docker containers, set API_PROXY_TARGET=http://backend:4000.
      "/api": {
        target: process.env["API_PROXY_TARGET"] ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
