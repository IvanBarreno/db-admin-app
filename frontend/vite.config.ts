import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// vite.config.ts — configuration for the Vite dev server and production build.
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), // JSX + Fast Refresh (hot reload that keeps component state)
    tailwindcss(), // Tailwind v4 as a Vite plugin: no tailwind.config.js or postcss.config.js needed
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

  build: {
    // `pnpm build` writes here; build/publish.ps1 copies it into src/SqlAdmin.Api/wwwroot.
    outDir: 'dist',
    emptyOutDir: true,
  },
})
