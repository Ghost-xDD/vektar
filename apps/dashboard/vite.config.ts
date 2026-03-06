import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/proxy/convergence': {
        target: 'https://convergence2026-token-api.cldev.cloud',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/convergence/, ''),
      },
    },
  },
});
