// Cloudflare Pages Function: /heyauto/api/t → the same handler as on Vercel (api/t.js).
import { POST, OPTIONS } from '../../../api/t.js';
import { setEnv } from '../../../api/_store.js';

export const onRequestPost = ({ request, env }) => { setEnv(env); return POST(request); };
export const onRequestOptions = () => OPTIONS();
