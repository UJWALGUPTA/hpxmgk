import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, /api is proxied to the FastAPI server (uvicorn on :8000).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } },
  },
  server: {
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000' },
  },
})
