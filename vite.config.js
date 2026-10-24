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

// The game lives at lukhmandesigns.com/heyauto (proxied from the hey-auto Vercel project);
// the analytics dashboard is a second page at /heyauto/analytics.
export default defineConfig({
  base: '/heyauto/',
  plugins: [devApi],
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), analytics: resolve(import.meta.dirname, 'analytics.html') } },
  },
  server: { port: 5180 },
});
