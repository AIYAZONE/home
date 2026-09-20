# AI 模型清单管理（免费算力优先）— 设计稿

> 日期：2026-09-20 ｜ 类型：新子系统（架构级，改造现有 AI 调用层） ｜ 状态：待用户审阅
> 定位：把「接哪家大模型的免费额度」从代码/环境变量决策，变成**平台管理员在界面上自由增删改的数据决策**。免费 provider 优先路由、额度耗尽自动降级付费兜底，收费模型也可在界面上手动绑定。

## 0. 决策摘要（TL;DR）

- **需求整合**：① 接入多家国内大模型的免费额度获取免费算力；② 不再用 `.env` 管理模型配置，改为 DB 驱动的「AI 模型清单」管理界面，免费/收费模型均可自由绑定。
- **Provider 候选**：国内为主——智谱 GLM（免费 GLM-4.5-Air -flash）、阿里云百炼 Qwen（每模型量大额度）、Kimi 免费档、豆包/阶跃/腾讯混元等；全部 OpenAI 兼容，与现有 `callOpenAiCompatChatJson` 协议无缝。
- **路由策略**：优先级列表 + 自动降级。429/5xx/超时 → 冷却 10 分钟并落到下一个；401/403 → 跳过不冷却；免费链全部耗尽 → 降级到 `cost_tier=paid` 兜底项；无可用项 → 友好提示 + traceId。
- **归属与权限**：清单是**平台级**资源（非家庭级），仅**平台管理员**（新增 `platform_admins` 表判定）可管理；家庭内 `admin` 角色不获得任何清单权限。
- **密钥边界**：API Key 加密存 DB（AES-256-GCM），界面**只写不读**（仅回显掩码）；唯一保留的环境变量是主密钥 `AI_PROVIDER_ENC_KEY`（密码学边界，不能也存进 DB）。
- **观测**：仅日志记录每次调用命中的 provider / model / cost_tier / traceId；不做用量表、不做面板（YAGNI）。
- **过渡**：DB 清单为空时回落到现有 `.env` 配置，部署不断流；录入清单后 `.env` provider 变量可清空。

## 1. 现状与背景

### 1.1 现有 AI 调用层（已核实）

5 个端点消费 AI：`api/ai/chat.ts`、`api/meals/recommend.ts`、`api/bills/parse.ts`、`api/health-reports/parse.ts`（文本 + 图片两条路径），全部经 `api/_lib/aiOpenAiCompat.ts` 的 OpenAI 兼容调用。

痛点：
- Provider 选择是各端点内手工 if/else（`AI_LLM_PROVIDER=deepseek|openai`），仅硬编码两家；
- 无任何额度感知——429（免费额度耗尽/限流）直接把错误抛给用户；
- 接一家新模型要改多个端点代码并重新部署，且配置只能进 `.env`。

### 1.2 可复用的技术地基（已核实）

- OpenAI 兼容调用与 `toSafeMessage`：`api/_lib/aiOpenAiCompat.ts`；
- 服务端字段加密范式：`src/lib/encryption.ts`（AES-256-CBC + scrypt，本项目将其算法升级为 AES-256-GCM 的服务端版本）；
- serverless 端点骨架：Bearer 鉴权 → service role 查询 → IP 限流 → traceId（见 `api/ai/chat.ts`）；
- 设置页体系与组件：`src/pages/settings/`（Overview / Members / TrustCenter 等同构范式）、`useConfirm`、toast 体系；
- 导航与路由守卫：`src/config/navigation.ts`、`RequireFamilyRoute` / `ProtectedRoute`；
- 迁移与 RLS 范式：`supabase/migrations/`（时间戳触发器、service-role-only 表先例见 audit_logs）。
- 本地开发：Vite 中间件需为新端点手动注册代理（既有约定，见项目记忆「Vite本地开发需手动注册新API端点代理」）。

## 2. 范围

### 2.1 本期做什么

- 新子系统：`ai_providers` 模型清单表 + `platform_admins` 管理员表（1 个迁移）。
- 运行时路由层：`api/_lib/aiProviderRouter.ts`（链解析 + 降级 + 冷却 + 缓存）。
- 管理 API：`api/ai/providers/`（list / create / update / delete / reorder / test）。
- 管理界面：设置 → 「AI 模型管理」（`/settings/ai-providers`），含测试连通按钮。
- 5 个 AI 消费端点切换到路由层入口。
- `.env` 兜底过渡逻辑与 `.env.example` 更新。

### 2.2 明确不做（写死为非目标）

- 主动配额计数（按日/月阈值预扣，等 429 被动降级即可）。
- 用量面板 / 消耗统计页（仅日志）。
- 家庭级各自绑 key（多租户按清单配额分发留待商业化阶段）。
- 独立 AI 网关服务（LiteLLM 等）——本规模过度设计。
- 非 OpenAI 兼容协议的 provider 适配层（如遇 DashScope 原生协议条目，一律以其 OpenAI 兼容模式接入）。
- 流式（SSE）输出改造——沿用现有同步 JSON 调用。

## 3. 数据模型

### 3.1 模型清单 `ai_providers`

```
id uuid pk default gen_random_uuid()
name text not null                     -- 展示名，如「智谱免费」「百炼-qwen-plus」
base_url text not null                 -- OpenAI 兼容端点，如 https://open.bigmodel.cn/api/paas/v4
model text not null                    -- 模型名，如 glm-4.5-air
api_key_encrypted text not null        -- AES-256-GCM 密文（格式：iv:tag:ciphertext，base64）
api_key_mask text not null             -- 展示掩码，如 sk-***a9f（前 2 后 3，保存时生成）
capability text not null default 'text'
    -- text | vision（图片识别只用 vision 项；检查约束）
cost_tier text not null default 'free'
    -- free | paid（检查约束；paid 即兜底候选）
priority int not null                  -- 越小越优先；界面调序即改它
enabled boolean not null default true
test_status text                       -- ok | error | null（未测试）
test_detail text                       -- 归一化错误码/延迟摘要
tested_at timestamptz
created_at / updated_at timestamptz    -- 复用 set_updated_at 触发器范式
```

- 无 `family_id`：平台级全局表。
- **RLS：开启且不建任何用户可读策略**（等同仅 service role 可访问）。前端与家庭用户永远无法直查此表；所有访问经管理 API / 路由层的服务端。

### 3.2 平台管理员 `platform_admins`

```
user_id uuid pk -> users(id) on delete cascade
added_by uuid -> users(id) on delete set null
created_at timestamptz
```

- 同样 RLS 全关闭（service-role-only）。
- **首位管理员入驻**：迁移文件内附注释模板，部署后在 Supabase SQL 编辑器手工执行一次
  `INSERT INTO platform_admins (user_id) VALUES ('<你的 users.id>');`。
- 管理员的增删本期只做 SQL 操作，界面不暴露（防误操作自锁）。

## 4. 密钥加密与存储边界

新增 `api/_lib/providerSecret.ts`（服务端专用）：

- 算法 **AES-256-GCM**（node `crypto`）：`encryptKey(plaintext)` → `iv:authTag:ciphertext`（base64 拼接）；`decryptKey(ciphertext)` 校验完整性，篡改即抛错（不静默返回垃圾）。
- 主密钥 = `process.env.AI_PROVIDER_ENC_KEY`，仅存在于 Vercel 环境（dev 放 `.env.local`）。
- **边界说明（已与用户确认）**：provider 的 API Key 全部进 DB 界面管理；但加密它们的**主密钥必须留在环境变量**——若主密钥也存 DB，等于明文存储。这是唯一的 `.env` 残留，且换主密钥只需一次重加密操作（本期不实现换密钥工具，文档留痕即可）。
- API Key **只写不读**：任何管理端点响应只含 `api_key_mask`，绝不回传密文或明文；更新时留空 = 不修改 key。

## 5. 运行时路由：`api/_lib/aiProviderRouter.ts`

### 5.1 链解析与缓存

```ts
getProviderChain(capability: 'text' | 'vision'): Promise<ResolvedProvider[]>
```

- service role 查询 `ai_providers`：`enabled = true` 且 capability 精确匹配（vision 请求只命中 vision 项，避免把图片塞给纯文本模型；text 请求不命中 vision 项），按 `priority asc` 排序，逐条解密 key。
- **进程内缓存 60s**（按 capability 各一份）：管理界面改完 ≤1 分钟全网生效；避免每次 AI 请求多一趟 DB 查询。
- 缓存失效兜底：管理 API 写操作成功后无法跨实例清缓存，接受 60s 窗口（管理动作低频，非关键路径）。

### 5.2 调用与降级状态机

```ts
callRoutedChat(capability, { system, user, temperature?, maxChars? }): Promise<{ jsonText, provider, model, costTier }>
```

沿链依次尝试（内部复用现有 OpenAI 兼容 fetch 协议，扩展返回 usage 与原始 status）：

| 结果 | 行为 |
|---|---|
| 2xx | 成功返回；清除该 provider 冷却（若有） |
| 429 / 5xx / 网络错误 / 超时 | 记入冷却 Map `providerId → 冷却至 now+10min`，尝试下一个 |
| 401 / 403 | 跳过**不冷却**（key 失效重试无意义；发现机制交给界面测试按钮） |
| 链耗尽 | 抛安全错误：「AI 服务繁忙，请稍后再试。」+ traceId（沿用分层提示规范） |

- 冷却表 = 模块级 `Map<string, number>`。Vercel serverless 实例冷启动会丢失冷却——首次请求可能重新撞一次 429 再降级，可接受，不为此引入持久化计数。
- 免费优先由**数据本身**实现：管理员把免费项 priority 排在付费项之前即可；路由层不特殊对待 cost_tier，仅日志记录。
- 路由层自身超时 = 单次 provider 调用 15s（沿用 `withServerTimeout` 范式），整链预算 45s（防止链过长导致端点整体超时；超出即抛链耗尽同款错误）。

### 5.3 端点改造

5 个端点删除各自的手工 provider 组装段，改为：

- `api/ai/chat.ts`、`api/meals/recommend.ts`、`api/bills/parse.ts`、`api/health-reports/parse.ts`（文本路径）：`callRoutedChat('text', ...)`（chat.ts 的 `pickToolId` 同步接入）。
- `api/bills/parse.ts` 图片路径（vision）：`callRoutedChat('vision', ...)`；链为空时返回现有「未配置视觉模型」类友好错误。
- 响应 meta 与 console 日志追加 `provider` / `model`（观测仅日志，前端展示不变化，符合"推荐结果展示约束来源"等既有规范不受影响）。

### 5.4 `.env` 过渡兜底

`getProviderChain` 查表结果为空（表不存在或 0 行 enabled）时，回落到现行为：按 `AI_LLM_PROVIDER` 构造单元素链（DeepSeek/OpenAI 的 env 配置）。DB 有数据后 env provider 变量完全忽略。`.env.example` 更新为：标注 provider 变量「已废弃，改用管理界面」、新增 `AI_PROVIDER_ENC_KEY`。

## 6. 管理 API：`api/ai/providers/`

| 端点 | 方法 | 说明 |
|---|---|---|
| `api/ai/providers/list.ts` | GET | 全部条目（仅掩码），管理员专用 |
| `api/ai/providers/create.ts` | POST | 校验 name/base_url/model/apiKey/capability/cost_tier；生成掩码+加密入库；priority 缺省 = 当前 max+1 |
| `api/ai/providers/update.ts` | PATCH | 字段级更新；apiKey 留空 = 不修改；写后清本实例缓存（其余实例 60s 缓存自然收敛） |
| `api/ai/providers/delete.ts` | DELETE | 物理删除 + 本实例缓存清理（其余实例 60s 收敛） |
| `api/ai/providers/reorder.ts` | POST | 接收有序 id 数组，事务重写 priority |
| `api/ai/providers/test.ts` | POST | 对该条目发一次最小 chat 请求（"回复 ok"），回传 `{status, latencyMs, error?}`，写 test_status/test_detail/tested_at；失败**不**污染路由冷却表 |

统一守卫（每个端点第一段）：

1. Bearer → `authGetUser`；
2. service role 查 `platform_admins` 是否含该 `user_id`，否则 403「无权限」；
3. 写操作限流（每 user 60s/30 次）+ traceId + `toSafeMessage` 错误出口——与现有端点骨架一致。

## 7. 管理界面：设置 → 「AI 模型管理」

- **入口与守卫**：`/settings/ai-providers`；导航项仅对平台管理员渲染（新增 `useIsPlatformAdmin` hook，经 `api/ai/providers/list` 的 200/403 判定，不新增公开查询面）；路由级守卫防直达。
- **列表**：名称、base_url、model、capability 标签、cost_tier 标签（免费=绿/收费=金）、优先级上移/下移按钮、启用开关、最近测试结果（✓ 1234ms / ✗ 429 / 未测试）、操作（测试/编辑/删除）。
- **新增/编辑弹窗**：预置模板下拉加速录入——内置国内免费额度常用组合（智谱 `https://open.bigmodel.cn/api/paas/v4` + `glm-4.5-air`、百炼 `https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen-plus` 等），选模板自动填 base_url/model，名称可改；API Key 输入框（密码型，编辑时 placeholder 显示掩码并提示"留空则不修改"）。
- **测试按钮**：行内 loading → 结果徽标（延迟 / 归一化错误），失败透出 `test_detail` 摘要。
- **删除**：`useConfirm` 二次确认，文案注明「删除后该模型立即从路由链摘除（≤60s 全量生效）」。
- **空态**：清单为空时显示引导卡片（"尚未配置任何模型，当前使用 .env 兜底配置"）+「新增模型」主按钮。
- **错误态**：所有写操作失败 → toast + traceId。
- 组件沿用 `src/components/ui/` 现有件；无新依赖。

## 8. 错误处理与隐私影响

- 路由层向上只抛中文安全信息（`toSafeMessage` 兜底），API Key 明文/密文均不进日志；日志仅记 provider 名 + 掩码。
- `data-map` 文档（`docs/privacy/data-map.md`）追加两张新表的数据说明：平台级配置数据，不含家庭成员个人数据。
- 管理 API 全部 no-store；错误响应带 traceId（符合「AI 调用失败需分层提示并附 traceId」规范）。

## 9. 测试与验收

### 9.1 自动化测试（Vitest，对齐 meals `_lib` 测试范式）

- `aiProviderRouter.test.ts`：链过滤（enabled/capability/排序）、429→冷却→降级下一家、401→跳过不冷却、冷却窗口过期恢复、链耗尽错误、60s 缓存命中、空表→env 兜底单元素链、整链超时预算。
- `providerSecret.test.ts`：加解密往返、篡改密文抛错、掩码生成规则。
- `providersGuard.test.ts`：非管理员 403 / 未登录 401（管理员判定经 service role 查询注入 mock）。
- 现有 `allergenGuard.test.ts` 等回归不受影响。

### 9.2 手工验收（本地 dev server + 中间件注册新端点）

1. 空表启动 → 「今天吃什么」走 env 兜底成功（行为与今日一致）；
2. 界面录入智谱免费 key → 推荐请求日志命中 `provider=智谱免费`；
3. 故意填错 key → 测试按钮 ✗，调用链自动跳过该项降级到下一家；
4. 模拟 429（临时把 rate 阈值调低或 mock）→ 观察冷却 + 降级到 paid 项；
5. 非管理员账号 → 设置页无入口、直达 URL 被守卫拦截、直调管理 API 403。

### 9.3 验收标准（端到端）

- 至少接入 2 家国内免费 provider 并在界面管理成功，推荐链路日志可见命中切换；
- 任一 provider 429 时用户无感知（自动降级），仅日志留痕；
- 全部免费耗尽且已配 paid 项时，链路落到 paid 项继续可用；无任何可用项时用户看到友好提示 + traceId；
- 管理界面完成 增 / 改 / 测 / 序 / 删 全闭环，60s 内生效；
- API Key 在列表、详情、日志、网络响应任何位置均不可还原明文（仅掩码）。

## 10. 风险与对策

| 风险 | 对策 |
|---|---|
| 免费额度政策变动（各家额度、模型名频繁调整） | 清单即数据：改模型名/换端点在界面完成，零发版 |
| Serverless 实例间冷却不同步 | 接受（冷启动首次重撞 429 代价小）；不引入持久计数 |
| 主密钥轮换 | 本期不做工具，文档留痕"重加密一次即可"；泄露则手动重录 key |
| vision 免费模型稀缺导致图片识别无免费项 | 允许图片路径继续走付费 OpenAI 项；清单为空时 env 兜底覆盖 |
| 误删全部 enabled 项导致 AI 全停 | 界面删除二次确认 + 兜底提示；恢复只需重新录入（≤60s 生效） |

## 11. 实施里程碑建议（供 writing-plans 细化）

1. **M1 数据与加密**：迁移 SQL + `providerSecret` + 单测；
2. **M2 路由层**：`aiProviderRouter` + 单测 + 5 端点切换 + env 兜底 + Vite 中间件注册；
3. **M3 管理 API**：6 端点 + 守卫 + 测试；
4. **M4 管理界面**：设置页 + 模板下拉 + 测试按钮 + 守卫与导航项；
5. **M5 验收**：§9.2 手工剧本 + 日志观察 + 文档更新（`.env.example`、data-map）。
