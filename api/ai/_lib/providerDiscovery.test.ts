import { describe, expect, it } from 'vitest';
import { annotateReuse, CATALOG_PROVIDER_IDS, normalizeBaseUrl, parseCatalog } from './providerDiscovery.js';

const fixture = {
  zhipuai: {
    name: 'Zhipu AI',
    api: 'https://open.bigmodel.cn/api/paas/v4',
    models: {
      'glm-4.7-flash': {
        id: 'glm-4.7-flash', name: 'GLM-4.7-Flash',
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
        modalities: { input: ['text'], output: ['text'] },
        limit: { context: 200000, output: 131072 }, reasoning: true,
      },
      'glm-paid': {
        id: 'glm-paid', name: 'GLM Paid',
        cost: { input: 1, output: 2 }, modalities: { input: ['text'], output: ['text'] },
      },
    },
  },
  openrouter: {
    name: 'OpenRouter', api: { url: 'https://openrouter.ai/api/v1' },
    models: {
      'qwen/qwen3.8-27b:free': {
        id: 'qwen/qwen3.8-27b:free', name: 'Qwen3.8 27B',
        cost: { input: 0, output: 0 },
        modalities: { input: ['text', 'image', 'video'], output: ['text'] },
        limit: { context: 262144 },
      },
    },
  },
  nvidia: { name: 'NVIDIA', models: { 'x/y': { id: 'x/y', name: 'Y', cost: { input: 0, output: 0 }, modalities: { input: ['text'], output: ['text'] } } } }, // 无 api → 跳过
  'not-whitelisted': { name: 'Other', api: 'https://o.test/v1', models: { m: { id: 'm', name: 'M', cost: { input: 0, output: 0 }, modalities: { input: ['text'], output: ['text'] } } } },
};

describe('parseCatalog', () => {
  it('只保留白名单 ∩ 零单价 ∩ 可解析 URL；兼容 api string 与 {url} 两形态', () => {
    const out = parseCatalog(fixture);
    expect(out.map((m) => `${m.provider_id}/${m.model_id}`)).toEqual([
      'zhipuai/glm-4.7-flash', 'openrouter/qwen/qwen3.8-27b:free',
    ]);
  });
  it('capability：输入含 image/video → vision，否则 text；context 0/缺失 → null', () => {
    const out = parseCatalog(fixture);
    expect(out[0]).toMatchObject({ capability: 'text', context_window: 200000, supports_reasoning: true });
    expect(out[1]).toMatchObject({ capability: 'vision', base_url: 'https://openrouter.ai/api/v1' });
  });
  it('坏条目跳过不崩整表（缺 cost / 缺 name / 非对象）', () => {
    const out = parseCatalog({ zhipuai: { name: 'Z', api: 'https://x.test/v4', models: { bad: 'not-an-object', bad2: { id: 'bad2' } } }, garbage: 42 });
    expect(out).toEqual([]);
  });
});

describe('normalizeBaseUrl', () => {
  it('尾斜杠/大小写 host/默认端口无关，路径大小写保留', () => {
    expect(normalizeBaseUrl('https://Open.BigModel.cn/api/paas/v4/')).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(normalizeBaseUrl('http://x.test:80/v1')).toBe('http://x.test/v1');
    expect(normalizeBaseUrl('https://x.test:443/v1')).toBe('https://x.test/v1');
    expect(normalizeBaseUrl('不是 URL')).toBe('');
  });
  it('非默认端口必须保留，不同主机不得折叠为同一 key（密钥复用比对路径）', () => {
    expect(normalizeBaseUrl('http://192.168.1.5:8000/v1/')).toBe('http://192.168.1.5:8000/v1');
    expect(normalizeBaseUrl('http://x.test:8080/v1')).not.toBe(normalizeBaseUrl('http://x.test80/v1'));
  });
});

describe('常量与边界', () => {
  it('白名单冻结为 spec §8 决策 5 的 11 项', () => {
    expect(CATALOG_PROVIDER_IDS).toHaveLength(11);
  });
  it('超长 name 截断至 40（对齐 ai_providers.name 列上限）', () => {
    const out = parseCatalog({ zhipuai: { name: 'Z', api: 'https://x.test/v4', models: { m: { id: 'm', name: 'N'.repeat(60), cost: { input: 0, output: 0 } } } } });
    expect(out[0]?.name).toHaveLength(40);
  });
});

describe('annotateReuse', () => {
  const models = parseCatalog(fixture);
  it('同厂商命中：enabled 优先、priority 小者优先', () => {
    const rows = [
      { id: 'r1', name: '智谱备用', base_url: 'https://open.bigmodel.cn/api/paas/v4', enabled: true, priority: 5 },
      { id: 'r2', name: '智谱停用', base_url: 'https://open.bigmodel.cn/api/paas/v4/', enabled: false, priority: 1 },
      { id: 'r3', name: '智谱主用', base_url: 'https://open.bigmodel.cn/api/paas/v4', enabled: true, priority: 2 },
    ];
    const [glm] = annotateReuse([models[0]], rows);
    expect(glm).toMatchObject({ key_reusable: true, reuse_provider_id: 'r3', reuse_provider_name: '智谱主用' });
  });
  it('无匹配 → key_reusable false 且 reuse 字段为 null', () => {
    const [or] = annotateReuse([models[1]], []);
    expect(or).toMatchObject({ key_reusable: false, reuse_provider_id: null, reuse_provider_name: null });
    expect(or.capability).toBe('vision'); // 复用行不影响 capability 映射结果
  });
});
