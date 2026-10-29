import { handleAuth, handleSync } from './accounts';
import { handleAi } from './ai';
import type { ServerEnv } from './env';
import { corsHeaders, json } from './http';

/** Routes `/api/*` (Cloudflare Worker in production, Vite middleware in development). */
export async function handleApi(request: Request, env: ServerEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/ai') return handleAi(request, env);
  if (pathname === '/api/sync') return handleSync(request, env);
  const auth = pathname.match(/^\/api\/auth\/([a-z-]{2,20})$/);
  if (auth) return handleAuth(request, env, auth[1]);
  if (pathname === '/api/account/delete') return handleAuth(request, env, 'delete');
  return json(404, { ok: false, error: 'not_found' }, corsHeaders(request, env).headers);
}
