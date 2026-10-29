import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAi } from './ai';
import { SCHEMAS } from './prompts';

const env = { XAI_API_KEY: 'test-key', XAI_MODEL: 'grok-4.7', AI_DAILY_LIMIT: '2' };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://turni.example/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': headers.ip ?? '1.1.1.1', ...headers },
    body: JSON.stringify(body),
  });
}

function mockXai(content: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 42 }, model: 'grok-4.7' }), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('AI endpoint', () => {
  it('reports its configuration', async () => {
    const res = await handleAi(new Request('https://turni.example/api/ai'), env);
    expect(await res.json()).toEqual({ ok: true, configured: true, model: 'grok-4.7', accounts: false });
  });

  it('rejects unknown tasks and empty input', async () => {
    expect((await handleAi(post({ task: 'chat', input: { text: 'hi' } }), env)).status).toBe(400);
    expect((await handleAi(post({ task: 'payslip', input: {} }), env)).status).toBe(400);
  });

  it('sends a strict JSON-schema request with images and returns parsed data', async () => {
    const fetchMock = mockXai({ types: [] });
    const res = await handleAi(post({ task: 'shift-types', locale: 'de', input: { text: 'P1 8-12', images: ['data:image/jpeg;base64,AAA', 'javascript:alert(1)'] } }, { ip: '2.2.2.2' }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, data: { types: [] } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    const payload = JSON.parse(init.body as string);
    expect(payload.model).toBe('grok-4.7');
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(payload.response_format.json_schema.schema).toEqual(SCHEMAS['shift-types']);
    expect(payload.messages[0].content).toContain('German');
    const images = payload.messages[1].content.filter((p: { type: string }) => p.type === 'image_url');
    expect(images).toHaveLength(1); // the non-image data URL is dropped
  });

  it('uses the user key without rate limiting', async () => {
    const fetchMock = mockXai({ types: [] });
    for (let i = 0; i < 4; i++) {
      const res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, { ip: '3.3.3.3', 'x-xai-key': 'user-key' }), env);
      expect(res.status).toBe(200);
    }
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer user-key');
  });

  it('rate limits requests paid with the server key', async () => {
    mockXai({ types: [] });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, { ip: '4.4.4.4' }), env)).status);
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('explains a missing server key', async () => {
    const res = await handleAi(post({ task: 'payslip', input: { text: 'x' } }), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'ai_not_configured' });
  });

  it('allows native app origins and refuses foreign ones', async () => {
    mockXai({ types: [] });
    const ok = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, { origin: 'capacitor://localhost', ip: '5.5.5.5' }), env);
    expect(ok.headers.get('access-control-allow-origin')).toBe('capacitor://localhost');
    const bad = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, { origin: 'https://evil.example', ip: '5.5.5.6' }), env);
    expect(bad.status).toBe(403);
  });

  it('maps provider auth errors', async () => {
    mockXai({}, 401);
    const res = await handleAi(post({ task: 'payslip', input: { text: 'x' } }, { ip: '6.6.6.6' }), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_key' });
  });
});

describe('AI monthly allowance (accounts)', async () => {
  const { sqliteDb } = await import('./sqlite');
  const { handleApi } = await import('./api');
  const cloud = { ...env, AI_DAILY_LIMIT: '100', AI_MONTHLY_LIMIT: '2', TOKEN_SECRET: 'test', AUTH_DEBUG_CODES: '1', DB: sqliteDb(':memory:', 'migrations') };

  async function signIn(email: string): Promise<string> {
    const call = (action: string, body: unknown) => handleApi(new Request(`https://turni.example/api/auth/${action}`, { method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify(body) }), cloud).then((r) => r.json());
    const up = await call('signup', { email, password: 'password123' });
    const done = await call('verify', { email, code: up.debugCode });
    return done.token;
  }

  it('asks to sign in when the service pays', async () => {
    mockXai({ types: [] });
    const res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, { ip: '5.5.5.1' }), cloud);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'auth_required' });
  });

  it('counts analyses per account, stops at the limit and gives failed ones back', async () => {
    const token = await signIn('quota@example.ch');
    const auth = { ip: '5.5.5.2', authorization: `Bearer ${token}` };
    mockXai({ types: [] });
    let res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, auth), cloud);
    expect(await res.json()).toMatchObject({ ok: true, quota: { used: 1, limit: 2 } });
    // xAI fails: the analysis doesn't count.
    mockXai({ types: [] }, 500);
    res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, auth), cloud);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ quota: { used: 1, limit: 2 } });
    mockXai({ types: [] });
    res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, auth), cloud);
    expect(await res.json()).toMatchObject({ ok: true, quota: { used: 2, limit: 2 } });
    const xai = mockXai({ types: [] });
    res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, auth), cloud);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'monthly_limit', quota: { used: 2, limit: 2 } });
    expect(xai).not.toHaveBeenCalled();
  });

  it("does not count analyses paid with the user's own key", async () => {
    mockXai({ types: [] });
    const res = await handleAi(post({ task: 'shift-types', input: { text: 'x' } }, { ip: '5.5.5.5', 'x-xai-key': 'mine' }), cloud);
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('quota');
  });
});
