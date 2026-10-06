import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the FastAPI backend during development.
      // ws: true also forwards the game WebSocket at /api/game/ws.
      '/api': { target: 'http://localhost:8000', ws: true },
    },
  },
})
