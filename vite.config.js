import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pinned, and deliberately allowed to fail rather than drift.
  //
  // Vite's default is to hunt for the next free port, so a stray process on
  // 5173 silently moves the app to 5174. That changes the origin, and both the
  // stored session and the agent's CORS allowlist are per-origin — so the app
  // comes up looking signed out for no visible reason. Failing loudly on a
  // busy port is far easier to diagnose than a session that vanished.
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('d3') || id.includes('topojson-client')) {
              return 'd3';
            }
            if (id.includes('recharts')) {
              return 'recharts';
            }
            if (id.includes('framer-motion')) {
              return 'motion';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'vendor';
            }
          }
        }
      }
    }
  }
})
