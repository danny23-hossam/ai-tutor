import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // expose on 0.0.0.0 so mobile devices can connect
    port: 5173,
    proxy: {
      // Forward /api/* → backend so mobile doesn't hit localhost
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // MED-3: forward cookies through the proxy so HttpOnly cookies work in dev
        secure: false,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})
