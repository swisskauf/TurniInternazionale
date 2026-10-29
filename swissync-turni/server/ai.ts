import { SCHEMAS, systemPrompt, userContent, type AiInput, type AiTask } from './prompts';

export interface AiEnv {
  XAI_API_KEY?: string;
  XAI_MODEL?: string;
  XAI_REASONING?: string;
  /** OpenAI-compatible base URL (default https://api.x.ai/v1); useful for gateways and tests. */
  XAI_BASE_URL?: string;
  AI_DAILY_LIMIT?: string;
  ALLOWED_ORIGINS?: string;
  [key: string]: string | undefined;
}

const TASKS = new Set<AiTask>(['analyze-plan', 'refine-script', 'shift-types', 'payslip']);
const MAX_BODY = 4_200_000;
const MAX_IMAGES = 4;
const MAX_TEXT = 60_000;

const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'];

function allowedOrigin(origin: string | null, request: Request, env: AiEnv): string | null {
  if (!origin) return null;
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const host = new URL(request.url).host;
  try {
    const o = new URL(origin);
    if (o.host === host) return origin;
    if (o.hostname === 'localhost' || o.hostname === '127.0.0.1') return origin;
  } catch {
    // Non-URL origins such as "null" are refused.
  }
  if (NATIVE_ORIGINS.includes(origin) || extra.includes(origin)) return origin;
  return null;
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
  });
}

// Best-effort per-instance limiter for requests paid with the server key.
const usage = new Map<string, { day: string; count: number }>();

function rateLimited(ip: string, limit: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(ip);
  if (!u || u.day !== day) {
    usage.set(ip, { day, count: 1 });
    if (usage.size > 5000) usage.clear();
    return false;
  }
  u.count++;
  return u.count > limit;
}

function sanitizeInput(raw: unknown): AiInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const images = Array.isArray(r.images) ? r.images.filter((s): s is string => typeof s === 'string' && /^data:image\/(jpeg|png);base64,/.test(s)).slice(0, MAX_IMAGES) : [];
  const text = typeof r.text === 'string' ? r.text.slice(0, MAX_TEXT) : '';
  const context = r.context && typeof r.context === 'object' ? (r.context as Record<string, unknown>) : {};
  if (!images.length && !text && !Object.keys(context).length) return null;
  return { images, text, context };
}

export async function handleAi(request: Request, env: AiEnv): Promise<Response> {
  const origin = request.headers.get('origin');
  const allow = allowedOrigin(origin, request, env);
  const cors: Record<string, string> = allow
    ? {
        'access-control-allow-origin': allow,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-xai-key',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : {};

  if (request.method === 'OPTIONS') return new Response(null, { status: allow ? 204 : 403, headers: cors });
  if (origin && !allow) return json(403, { ok: false, error: 'origin_not_allowed' }, cors);

  const model = env.XAI_MODEL || 'grok-4.7';
  if (request.method === 'GET') {
    return json(200, { ok: true, configured: !!env.XAI_API_KEY, model }, cors);
  }
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' }, cors);

  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) return json(413, { ok: false, error: 'too_large' }, cors);

  let body: { task?: AiTask; input?: unknown; locale?: string; model?: string };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { ok: false, error: 'too_large' }, cors);
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'bad_request' }, cors);
  }
  const task = body.task;
  if (!task || !TASKS.has(task)) return json(400, { ok: false, error: 'unknown_task' }, cors);
  const input = sanitizeInput(body.input);
  if (!input) return json(400, { ok: false, error: 'empty_input' }, cors);
  const locale = typeof body.locale === 'string' ? body.locale.slice(0, 5) : 'it';

  const userKey = request.headers.get('x-xai-key')?.trim();
  const key = userKey || env.XAI_API_KEY;
  if (!key) return json(503, { ok: false, error: 'ai_not_configured' }, cors);
  if (!userKey) {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
    const limit = Number(env.AI_DAILY_LIMIT || 40);
    if (rateLimited(ip, limit)) return json(429, { ok: false, error: 'rate_limited' }, cors);
  }
  // A user paying with their own key may pick another vision-capable model.
  const useModel = userKey && typeof body.model === 'string' && /^[\w.-]{3,40}$/.test(body.model) ? body.model : model;

  const payload: Record<string, unknown> = {
    model: useModel,
    messages: [
      { role: 'system', content: systemPrompt(task, locale) },
      { role: 'user', content: userContent(task, input) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: task.replace(/-/g, '_'), schema: SCHEMAS[task], strict: true },
    },
  };
  const reasoning = env.XAI_REASONING || 'medium';
  if (reasoning !== 'none') payload.reasoning_effort = reasoning;

  const call = async (p: Record<string, unknown>) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 110_000);
    try {
      return await fetch(`${(env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(p),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res = await call(payload);
    if (res.status === 400 && payload.reasoning_effort) {
      // Some models don't accept reasoning_effort: retry once without it.
      const detail = await res.clone().text();
      if (/reasoning/i.test(detail)) {
        delete payload.reasoning_effort;
        res = await call(payload);
      }
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      const error = res.status === 401 || res.status === 403 ? 'invalid_key' : res.status === 429 ? 'provider_rate_limited' : 'provider_error';
      return json(res.status === 401 || res.status === 403 ? 401 : 502, { ok: false, error, detail }, cors);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return json(502, { ok: false, error: 'invalid_ai_output' }, cors);
    }
    return json(200, { ok: true, task, data: parsed, usage: data.usage ?? null, model: data.model ?? useModel }, cors);
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return json(aborted ? 504 : 502, { ok: false, error: aborted ? 'timeout' : 'network_error' }, cors);
  }
}
