import { SCHEMAS, systemPrompt, userContent, type AiInput, type AiTask } from '../../server/prompts';
import { useStore } from '@/store/store';
import { apiEndpoint } from '@/lib/api';
import { accessToken, refreshQuota, useAccount } from '@/cloud/account';

export class AiError extends Error {
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

export { apiEndpoint };
export const apiUrl = () => apiEndpoint('ai');

export async function aiStatus(): Promise<{ configured: boolean; model: string; accounts?: boolean } | null> {
  const url = apiUrl();
  if (!url) return null;
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const j = await res.json();
    return { configured: !!j.configured, model: j.model ?? '', accounts: !!j.accounts };
  } catch {
    return null;
  }
}

export interface AiResult<T> {
  data: T;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

async function direct<T>(task: AiTask, input: AiInput, key: string, model: string, locale: string): Promise<AiResult<T>> {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model || 'grok-4.7',
      messages: [
        { role: 'system', content: systemPrompt(task, locale) },
        { role: 'user', content: userContent(task, input) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: task.replace(/-/g, '_'), schema: SCHEMAS[task], strict: true } },
    }),
  });
  if (res.status === 401 || res.status === 403) throw new AiError('invalid_key');
  if (res.status === 429) throw new AiError('provider_rate_limited');
  if (!res.ok) throw new AiError('provider_error', (await res.text()).slice(0, 200));
  const j = await res.json();
  try {
    return { data: JSON.parse(j.choices?.[0]?.message?.content ?? '') as T, usage: j.usage ?? null };
  } catch {
    throw new AiError('invalid_ai_output');
  }
}

/** Calls one of the fixed AI tasks. Throws AiError with a code the UI can translate. */
export async function callAi<T>(task: AiTask, input: AiInput): Promise<AiResult<T>> {
  const { ai, profile, bumpAi } = useStore.getState();
  if (ai.mode === 'off') throw new AiError('ai_disabled');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline');
  const ownKey = ai.mode === 'own-key' ? ai.apiKey.trim() : '';
  if (ai.mode === 'own-key' && !ownKey) throw new AiError('missing_key');
  const url = apiUrl();
  bumpAi('requests');

  if (!url) {
    if (ownKey) return direct<T>(task, input, ownKey, ai.model, profile.locale);
    throw new AiError('no_backend');
  }

  // Analyses paid by the service are counted on the signed-in account (monthly allowance).
  const token = ownKey ? null : await accessToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(ownKey ? { 'x-xai-key': ownKey } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ task, input, locale: profile.locale, model: ai.model || undefined }),
    });
  } catch {
    if (ownKey) return direct<T>(task, input, ownKey, ai.model, profile.locale);
    throw new AiError('network_error');
  }
  let body: { ok?: boolean; data?: T; error?: string; detail?: string; usage?: AiResult<T>['usage']; quota?: { used: number; limit: number } } = {};
  try {
    body = await res.json();
  } catch {
    // Not JSON (e.g. static hosting without functions).
    if (ownKey) return direct<T>(task, input, ownKey, ai.model, profile.locale);
    throw new AiError(res.status === 404 ? 'no_backend' : 'provider_error');
  }
  if (body.quota) useAccount.setState({ quota: body.quota });
  else if (token) void refreshQuota();
  if (!res.ok || !body.ok) throw new AiError(body.error ?? 'provider_error', body.detail);
  return { data: body.data as T, usage: body.usage ?? null };
}
