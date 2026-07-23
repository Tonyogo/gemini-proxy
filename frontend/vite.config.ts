import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/ui/',
  build: {
    outDir: path.resolve(__dirname, '../dist/frontend'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api/admin': 'http://localhost:3000',
      '/v1': 'http://localhost:3000'
    }
  }
});
