import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: '/',
  build: {
    outDir: '../f-worker/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://127.0.0.1:8787',
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
