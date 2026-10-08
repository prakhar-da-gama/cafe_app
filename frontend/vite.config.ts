import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Serve the app under /app/ so the domain root can host a separate landing
  // page. API calls stay on absolute /api/... paths and resolve at the root.
  base: '/app/',
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the FastAPI backend during development.
      // ws: true also forwards the game WebSocket at /api/game/ws.
      '/api': { target: 'http://localhost:8000', ws: true },
    },
  },
})
