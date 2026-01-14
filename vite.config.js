import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Render sets RENDER=true automatically; GitHub Pages needs /TRaceON/ base path
export default defineConfig({
  base: process.env.RENDER ? '/' : '/TRaceON/',
  plugins: [
    react(),
    tailwindcss(),
  ],
})
