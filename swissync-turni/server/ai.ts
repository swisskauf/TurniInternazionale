import { consumeAi, refundAi, userFromRequest } from './accounts';
import { accountsEnabled, type ServerEnv } from './env';
import { corsHeaders, json } from './http';
import { SCHEMAS, systemPrompt, userContent, type AiInput, type AiTask } from './prompts';

/** @deprecated use ServerEnv */
export type AiEnv = ServerEnv;
type Quota = { used: number; limit: number };

const TASKS = new Set<AiTask>(['analyze-plan', 'refine-script', 'shift-types', 'payslip']);
const MAX_BODY = 4_200_000;
const MAX_IMAGES = 4;
const MAX_TEXT = 60_000;

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

export async function handleAi(request: Request, env: ServerEnv): Promise<Response> {
  const origin = request.headers.get('origin');
  const { allow, headers: cors } = corsHeaders(request, env);

  if (request.method === 'OPTIONS') return new Response(null, { status: allow ? 204 : 403, headers: cors });
  if (origin && !allow) return json(403, { ok: false, error: 'origin_not_allowed' }, cors);

  const model = env.XAI_MODEL || 'grok-4.7';
  if (request.method === 'GET') {
    // `accounts`: analyses paid by the service need a Swissync account (monthly allowance).
    return json(200, { ok: true, configured: !!env.XAI_API_KEY, model, accounts: accountsEnabled(env) }, cors);
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
  let payer: string | null = null;
  let quota: Quota | undefined;
  if (!userKey) {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
    const limit = Number(env.AI_DAILY_LIMIT || 40);
    if (rateLimited(ip, limit)) return json(429, { ok: false, error: 'rate_limited' }, cors);
    if (accountsEnabled(env)) {
      // Free for every account, up to the monthly allowance — counted here, not in the app.
      const user = await userFromRequest(request, env);
      if (!user) return json(401, { ok: false, error: 'auth_required' }, cors);
      let credit: Quota & { allowed: boolean };
      try {
        credit = await consumeAi(env, user.id);
      } catch {
        return json(503, { ok: false, error: 'quota_unavailable' }, cors);
      }
      if (!credit.allowed) return json(429, { ok: false, error: 'monthly_limit', quota: { used: credit.used, limit: credit.limit } }, cors);
      payer = user.id;
      quota = { used: credit.used, limit: credit.limit };
    }
  }
  // A failed analysis doesn't count against the allowance.
  const failed = async (status: number, body: Record<string, unknown>) => {
    if (payer && quota) {
      await refundAi(env, payer);
      quota = { ...quota, used: Math.max(0, quota.used - 1) };
    }
    return json(status, { ...body, ...(quota ? { quota } : {}) }, cors);
  };
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
      return failed(res.status === 401 || res.status === 403 ? 401 : 502, { ok: false, error, detail });
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
      return failed(502, { ok: false, error: 'invalid_ai_output' });
    }
    return json(200, { ok: true, task, data: parsed, usage: data.usage ?? null, model: data.model ?? useModel, ...(quota ? { quota } : {}) }, cors);
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return failed(aborted ? 504 : 502, { ok: false, error: aborted ? 'timeout' : 'network_error' });
  }
}
