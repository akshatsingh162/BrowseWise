import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const fromRoot = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Readable output makes debugging and store review easier; we can revisit for release.
    minify: false,
    rollupOptions: {
      // Each entry becomes a stable, predictable file name that manifest.json can reference.
      input: {
        'service-worker': fromRoot('./src/background/service-worker.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
