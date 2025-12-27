import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-celestrak': {
        target: 'https://celestrak.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-celestrak/, '')
      },
      '/api-amsat': {
        target: 'https://www.amsat.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-amsat/, '')
      }
    }
  }
})
