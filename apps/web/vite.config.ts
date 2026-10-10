import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } }, allowedHosts: true },
  build: { outDir: 'dist', target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  // mind-ar is consumed from source (deep imports); its own dependencies still need pre-bundling (CJS → ESM)
  optimizeDeps: { exclude: ['mind-ar'], include: ['@tensorflow/tfjs', 'mind-ar > @tensorflow/tfjs', '@msgpack/msgpack', 'mind-ar > @msgpack/msgpack', 'mind-ar > mathjs', 'mind-ar > ml-matrix', 'mind-ar > svd-js', 'mind-ar > tinyqueue'] },
});
