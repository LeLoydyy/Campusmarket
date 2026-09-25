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
      '/api': { target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:5001', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
