import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
