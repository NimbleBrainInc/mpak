import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [reactRouter(), tailwindcss()],
  server: {
    port: 5173,
    // The registry API is same-origin in production, so proxy it in dev to keep
    // the browser talking to relative paths either way.
    proxy: {
      '/app': { target: 'http://localhost:3200', changeOrigin: true },
      '/v1': { target: 'http://localhost:3200', changeOrigin: true },
    },
    allowedHosts: ['.ngrok.app'],
  },
  build: { target: 'es2020', sourcemap: false },
});
