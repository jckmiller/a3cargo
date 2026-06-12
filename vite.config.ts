import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 3000,
    open: true,
    // During local development the Node API runs on port 3001.
    // Vite forwards any /api/* request there so the frontend works
    // identically to production (where nginx does the same proxying).
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
