import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/footprint-tutorial/',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['footprint'],
  },
  build: {
    commonjsOptions: {
      include: [/footprint/, /node_modules/],
    },
  },
})
