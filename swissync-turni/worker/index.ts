import { handleApi } from '../server/api';
import type { ServerEnv } from '../server/env';

interface Env extends ServerEnv {
  /** The built web app (Workers static assets). */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** Swissync Turni on Cloudflare: the web app, its API and the account database (D1). */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
