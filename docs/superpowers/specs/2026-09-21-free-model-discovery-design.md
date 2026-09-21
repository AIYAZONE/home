# 免费模型自动发现（Free Model Discovery）设计 Spec

> 状态：已批准（方案 A：实时发现，零新表）
> 前置：本 spec 建立在已上线的「AI 模型清单 v2（个人域 + 共享池）」之上
> （`docs/superpowers/specs/2026-09-20-ai-provider-registry-design.md`）

## 1. 背景与目标

v2 落地后，模型的发现与录入仍是纯手工：用户要知道"哪家在免费"、自己填
base_url/model/能力标记。本功能参照 opencode 的模式（集中式元数据目录 +
按字段过滤，非 AI 识别），在「设置 → 我的 AI 模型」页增加**免费模型发现区**：

- 系统实时拉取开放目录 models.dev，过滤出零单价模型；
- 与用户已有配置比对，能复用同厂商密钥的行支持**一键启用**（不经过
  "读出明文 key"——密钥红线不破）；
- 不能复用密钥的行提供**预填添加**，用户只需粘贴 key。

**非目标**：不做定时任务落表（无 cron、无新表）、不做厂商实时价格二次
校验（交给现有「测试」按钮）、不做新厂商 OAuth/自动注册。

## 2. 数据源事实（2026-09-21 实测 `https://models.dev/api.json`）

- 顶层为 `provider_id → { id, name, api, env, doc, models: { model_id → {...} } }`，
  222 个 provider，全量 JSON 约 4.7 MB。
- provider 的 `api` 字段携带调用端点（如 openrouter 为
  `"https://openrouter.ai/api/v1"`；实现时兼容 string 与 `{ url }` 两种形态，
  解析不出 URL 的 provider 跳过）。
- model 字段：`cost: { input, output, cache_read, cache_write }`（美元/百万
  token）、`modalities: { input: string[], output: string[] }`、`limit:
  { context, output }`、`reasoning: boolean`、`name`、`id`。
- 免费判定 `cost.input === 0 && cost.output === 0`。实测分布：
  `nvidia` 101、`openrouter` 24（模型 id 自带 `:free` 后缀，即调用名）、
  `zhipuai` 2（glm-4.7-flash / glm-4.5-flash，直连零单价）、`alibaba-cn` 2，
  `alibaba`/`moonshotai`/`deepseek`/`volcengine` 直连均为 0。

**已知局限（写入 spec 以示诚实）**：

1. models.dev 记录的是**牌价**，不反映厂商站内促销与新用户额度
   （例：`alibaba/qwen3.8-flash` 牌价 $0.15/$0.47，但百炼活动期实际免费）。
   发现区定位是"发现 + 快捷录入"，不是免费模型的完备清单；促销期模型
   仍走手工添加（模板已预置）。
2. 免费标记为社区维护，可能滞后活动窗口 1-2 天；启用后用现有「测试」
   按钮即时验证。
3. 网关类 provider（openrouter/nvidia）的免费模型需要该网关自己的 key
   （注册即得，无需充值）；发现区如实标注，用户自行决定是否注册。

## 3. 架构与数据流

```
[前端 发现区展开]
   → GET /api/ai/providers/discover          （现有 catch-all 新增分支，零新函数）
      → providerDiscovery.ts：拉 models.dev（8s 超时 + 60s 实例内存缓存）
      → 过滤：provider 白名单 ∩ cost 全 0 ∩ 可解析出 api URL
      → 加载该用户可见行（共享池 + 其私有，复用 list 端点的查询方式）
      → 归一化 base_url 比对 → key_reusable + reuse_provider_id
   → 返回 ≤60 条建议（key_reusable 优先排序）
[用户点启用] → POST /api/ai/providers/create（扩展 reuse_key_from）
[用户点添加] → 现有新增表单预填 → POST create（正常带 api_key）
```

无新表、无迁移、无 cron；`vercel.json` 不动（catch-all 复用，Hobby
12 函数额度不增）。

## 4. 后端设计

### 4.1 `api/ai/_lib/providerDiscovery.ts`（纯函数核心，可测）

```ts
export const CATALOG_URL = 'https://models.dev/api.json';
// provider 白名单：家庭场景相关的国产直连 + 两大免充值网关
export const CATALOG_PROVIDER_IDS = [
  'alibaba', 'alibaba-cn', 'zhipuai', 'moonshotai', 'moonshotai-cn',
  'deepseek', 'volcengine', 'minimax-cn', 'siliconflow-cn',
  'openrouter', 'nvidia',
] as const;

export interface DiscoveredModel {
  provider_id: string;        // 目录 provider id
  provider_label: string;     // 目录 provider name
  model_id: string;           // 调用用模型标识（openrouter 含 :free 后缀）
  name: string;               // 展示名（截断至 40 字符，对齐 name 列上限）
  base_url: string;           // 来自目录 provider.api
  capability: 'text' | 'vision'; // modalities.input 含 image/video → vision，否则 text
  context_window: number | null; // limit.context（0 视为 null）
  supports_reasoning: boolean;
}

// parseCatalog(json: unknown): DiscoveredModel[]
//  —— 逐 provider/模型 zod safeParse，坏条目跳过（schema 漂移不崩整表）；
//     仅保留 cost.input===0 && cost.output===0 且能解析出 http(s) URL 的条目。
// annotateReuse(models, existingRows): DiscoveredSuggestion[]
//  —— base_url 归一化（去尾斜杠、小写 host）后与用户可见行比对；
//     命中多个时取 enabled 且 priority 最小的行；
//     产出 { ...model, key_reusable, reuse_provider_id, reuse_provider_name }。
```

### 4.2 `api/ai/_lib/providers/discover.ts`（端点）

- `skeleton('ai.providers.discover', req, res, { method: 'GET' })`（只读，
  不加 write 限流；requireUser 已在 skeleton 内）。
- 模块级缓存 `{ until, models }`，TTL 60s；拉取超时 8s（`AbortSignal.timeout`）。
- 拉取/解析失败 → 502 `{ message: '发现服务暂不可用，请稍后重试。', traceId }`；
  失败结果不缓存（下次请求重试）。
- 成功 → `{ models: annotateReuse(...) 按 key_reusable 降序、provider_id、
  model_id 排序，slice(0, 60), fetched_at }`。

### 4.3 create 扩展：`reuse_key_from`（密钥复用的唯一正确姿势）

明文 key 永不出服务端（AES-256-GCM 密文不可回读），因此复用必须**服务端
复制密文列**：

- `ProviderCreateSchema`：`api_key` 改为 optional，`superRefine` 校验
  `api_key` 与 `reuse_key_from` **二选一**（都缺或都有 → 400）。
- create handler：带 `reuse_key_from` 时先查被引用行，必须满足
  `id = uuid && (owner_user_id IS NULL || owner_user_id = ctx.userId)`
  ——查不到（含他人私有行）统一返回 400「引用的模型不存在」，
  复用现有 gone 语义防探测。命中后新行直接复制其
  `api_key_encrypted`、`api_key_mask`，不经过 encryptApiKey。
- 其余逻辑（scope 白名单、归属域 priority、clearInstanceCache）不变。
- `update` 端点**不**加此字段（改 key 必须显式粘贴新 key，避免歧义）。

## 5. 前端设计

### 5.1 数据层

- `src/lib/aiProviders.ts`：新增 `DiscoveredSuggestion` 类型与
  `providersApi.discover(): Promise<{ models; fetched_at }>`；
  `create` 入参类型补可选 `reuse_key_from`，`api_key` 放宽为可选。
- 新 hook `src/hooks/useDiscoverFreeModels.ts`（对齐 useXxx 命名规范）：
  `queryKey: ['ai-providers-discover', userId]`，`enabled` 受展开状态控制，
  `staleTime: 5min`，retry ≤1。

### 5.2 「我的 AI 模型」页新增折叠区「发现免费模型」

- 位置：平台共享池区之下；默认收起，**首次展开才请求**。
- 行渲染：名称 / provider_label / capability 徽标 / 上下文（k 格式化）/
  reasoning 标记 / 「可复用密钥：{reuse_provider_name}」徽标。
- 操作：
  - `key_reusable` →「启用」弹窗（复用现有 Dialog 规范）：归属单选
    （个人 / 共享池〔仅 canManageShared〕）+ 名称确认（预填，可改）→
    `create({ ..., reuse_key_from, cost_tier: 'free', api_key 省略 })`→
    invalidate 列表与发现区。
  - 非 reusable →「添加」→ 打开现有新增表单，预填 name/base_url/model/
    capability/cost_tier=free，key 由用户粘贴（OpenRouter/NVIDIA 引导语：
    "注册该网关即可免费获取 key"）。
- 状态：加载中骨架行；502 → 区内错误 + traceId + 重试按钮（不影响页面
  其他区块）；空列表 → "暂无可发现的免费模型"。

## 6. 安全与隐私

- discover 为服务端匿名 GET 公开目录，**不发送任何用户数据**；响应不含
  任何 key 信息（仅 reuse_provider_id/name）。
- 密文复制仅发生在服务端，权限边界与 create 一致（共享行写仍受邮箱白名单）。
- `data-map.md` 补一行：服务端定期只读拉取 models.dev 公开目录，不落库、
  不含用户数据。

## 7. 测试计划

- `providerDiscovery.test.ts`：fixture 目录 → 免费过滤 / capability 映射 /
  URL 解析（string 与 {url} 两形态）/ 坏条目跳过 / base_url 归一化比对 /
  reuse 行选择（enabled 优先、priority 最小）/ 排序与截断。
- `providersSchema.test.ts` 扩展：api_key 与 reuse_key_from 二选一。
- `endpointKit.test.ts` 模式内新增 create 行为测试：引用他人私有行 400、
  引用共享行成功且密文列被复制（mock supabase client 断言 insert payload）。
- 全量门禁：既有 83+ 用例 / `tsc --noEmit` / eslint / `pnpm build`；
  最后 whole-branch review。

## 8. 决策记录

| 决策 | 理由 |
| --- | --- |
| 半自动（发现+一键启用）而非全自动同步 | 免费≠可用（隔一层 key）；自动写入会产生调不通的池内行 |
| 实时拉取 + 60s 缓存，不建表不建 cron | 家庭场景数据新鲜度 1 分钟足够；省掉迁移、cron、表生命周期三块复杂度 |
| base_url 取目录 provider.api 而非硬编码映射表 | 实测目录自带端点，映射表退化为仅 provider 白名单一处常量 |
| 密钥复用 = create 的 reuse_key_from 服务端复制密文 | 明文 key 不可回读是红线，任何"前端回填 key"方案均不可行 |
| 白名单含 openrouter/nvidia 网关 | 直连厂商零单价模型极少（实测 4 个）；网关免费区才是免费算力主力，注册即得 key |
