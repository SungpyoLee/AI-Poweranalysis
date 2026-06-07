import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/loadflow': 'http://127.0.0.1:8000',
      '/shortcircuit': 'http://127.0.0.1:8000',
    },
  },
})
