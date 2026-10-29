import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    // MapLibre alone is ~1 MB (≈300 KB gzipped). It is lazy-loaded after first paint (SPEC §8.8).
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        unsubscribe: resolve(__dirname, 'unsubscribe.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
