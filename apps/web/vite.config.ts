import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      usePolling: true,
    },
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3200",
        changeOrigin: true,
      },
    },
    allowedHosts: [".ngrok.app"],
  },
  build: {
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Generate source maps only in development
    sourcemap: false,
  },
});
