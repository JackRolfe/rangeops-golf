import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The console runs on its own port so it can sit beside the player app (5173) in development.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
})
