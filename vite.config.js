import { defineConfig } from 'vite';

// The game lives at lukhmandesigns.com/heyauto (proxied from the hey-auto Vercel project).
export default defineConfig({
  base: '/heyauto/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { port: 5180 },
});
