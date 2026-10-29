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
    expect(await res.json()).toEqual({ ok: true, configured: true, model: 'grok-4.7' });
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
