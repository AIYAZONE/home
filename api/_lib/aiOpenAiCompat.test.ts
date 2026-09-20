import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiUpstreamError, callLow, callOpenAiCompatChatJson } from './aiOpenAiCompat.js';

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

describe('callLow', () => {
  it('2xx 返回 choices content（已 trim）', async () => {
    mockFetch(200, { choices: [{ message: { content: ' hello ' } }] });
    const r = await callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('hello');
  });

  it('429 抛 AiUpstreamError 且携带状态码', async () => {
    mockFetch(429, { error: { message: 'rate limited' } });
    await expect(callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [] }))
      .rejects.toMatchObject({ status: 429, name: 'AiUpstreamError', message: 'rate limited' });
  });

  it('非 JSON 响应体也按状态码抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('bad'); } }));
    const p = callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [] });
    await expect(p).rejects.toBeInstanceOf(AiUpstreamError);
  });

  it('网络失败抛 status=0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    await expect(callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [] }))
      .rejects.toMatchObject({ status: 0 });
  });

  it('responseFormatJson 时请求体带 json_object，且 baseUrl 尾斜杠被规范化', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }) });
    vi.stubGlobal('fetch', f);
    await callLow({ baseUrl: 'https://x.test/v1/', apiKey: 'k', model: 'm', responseFormatJson: true, messages: [{ role: 'user', content: 'hi' }] });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/v1/chat/completions');
    expect(JSON.parse(String(init.body)).response_format).toEqual({ type: 'json_object' });
  });

  it('空 content 抛 status=502', async () => {
    mockFetch(200, { choices: [{ message: { content: '   ' } }] });
    await expect(callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [] }))
      .rejects.toMatchObject({ status: 502 });
  });
});

describe('callOpenAiCompatChatJson（回归：签名与信封剥离不变）', () => {
  it('剥离 markdown 信封后返回纯 JSON 文本', async () => {
    mockFetch(200, { choices: [{ message: { content: '```json\n{"a":1}\n```' } }] });
    const { jsonText } = await callOpenAiCompatChatJson({ baseUrl: 'https://x.test', apiKey: 'k', model: 'm', system: 's', user: 'u' });
    expect(jsonText).toBe('{"a":1}');
  });
});
