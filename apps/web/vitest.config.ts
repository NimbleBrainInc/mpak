import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Deliberately not merged with vite.config.ts. That config loads the React
// Router plugin, which injects a runtime preamble the component tests never
// receive — they render pieces inside a MemoryRouter rather than booting the
// app — so every one of them fails with "can't detect preamble". The plain
// React transform is all these tests need.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
