import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config' // vite's defineConfig plus the typed `test` block

// vite.config.ts — configuration for the Vite dev server and production build.
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), // JSX + Fast Refresh (hot reload that keeps component state)
    // Styling is Mantine: its CSS is imported in main.tsx, and postcss.config.cjs (picked up by Vite on its
    // own) adds the helpers used in *.module.css files. No CSS plugin is needed here.
  ],

  server: {
    // Vite serves the UI on http://localhost:5173 during development.
    // Any request starting with /api or /openapi is forwarded to the .NET API on port 5000.
    // Because the browser only ever talks to :5173, there is no cross-origin request and
    // therefore no CORS configuration anywhere. In production the .NET app serves the
    // built files itself, so the same relative URLs keep working unchanged.
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/openapi': 'http://127.0.0.1:5000',
    },
  },

  // `pnpm test` (Vitest): hooks and components render in a fake DOM (jsdom), no browser or server needed.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Stand-ins for the browser APIs jsdom lacks and Mantine needs (matchMedia, ResizeObserver...).
    setupFiles: './src/test/setup.ts',
  },

  build: {
    // `pnpm build` writes here; build/publish.ps1 copies it into src/SqlAdmin.Api/wwwroot.
    outDir: 'dist',
    emptyOutDir: true,
  },
})
