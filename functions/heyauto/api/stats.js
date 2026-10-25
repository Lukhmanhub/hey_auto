// Cloudflare Pages Function: /heyauto/api/stats → the same handler as on Vercel (api/stats.js).
import { GET, OPTIONS } from '../../../api/stats.js';
import { setEnv } from '../../../api/_store.js';

export const onRequestGet = ({ request, env }) => { setEnv(env); return GET(request); };
export const onRequestOptions = () => OPTIONS();
