// Lays the Vite build out for Cloudflare Pages: the game lives under /heyauto/ (same paths as on the
// portfolio), every file may be loaded from lukhmandesigns.com (CORS), and hashed files cache for a year.
import { cpSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';

rmSync('cf', { recursive: true, force: true });
mkdirSync('cf', { recursive: true });
cpSync('dist', 'cf/heyauto', { recursive: true });
writeFileSync('cf/_headers', `/*
  Access-Control-Allow-Origin: *
/heyauto/assets/*
  Cache-Control: public, max-age=31536000, immutable
/heyauto/tex/*
  Cache-Control: public, max-age=604800
/heyauto/hdri/*
  Cache-Control: public, max-age=604800
/heyauto/sounds/*
  Cache-Control: public, max-age=604800
/heyauto/chars/*
  Cache-Control: public, max-age=604800
/heyauto/posters/*
  Cache-Control: public, max-age=604800
/heyauto/fonts/*
  Cache-Control: public, max-age=604800
`);
writeFileSync('cf/_redirects', `/ /heyauto/ 302
/heyauto /heyauto/ 301
`);
console.log('cf/ ready');
