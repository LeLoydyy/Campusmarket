import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // API_PROXY_TARGET lets a second copy of the app run against another backend.
      // xfwd passes each device's address on, so the backend rate-limits phones separately.
      '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:5001', changeOrigin: true, xfwd: true },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
