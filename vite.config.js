import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// In dev, serve the Vercel functions in api/ too (they fall back to an in-memory store locally).
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const m = /^(?:\/heyauto)?\/api\/(t|stats)(?:\?|$)/.exec(req.url);
      if (!m) return next();
      try {
        const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
        const handler = mod[req.method];
        if (!handler) { res.statusCode = 405; return res.end(); }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request(`http://${req.headers.host}${req.url}`, {
          method: req.method, headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const r = await handler(request);
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch (err) { next(err); }
    });
  },
};

// The game lives at lukhmandesigns.com/heyauto; the analytics dashboard is a second page at /heyauto/analytics.
// The portfolio only proxies the page itself: `npm run build:cf` points every script, texture and sound
// straight at Cloudflare Pages (HEYAUTO_BASE), so they never count against the portfolio's Vercel limits.
export default defineConfig({
  base: process.env.HEYAUTO_BASE || '/heyauto/',
  plugins: [devApi],
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), analytics: resolve(import.meta.dirname, 'analytics.html') } },
  },
  server: { port: 5180 },
});
