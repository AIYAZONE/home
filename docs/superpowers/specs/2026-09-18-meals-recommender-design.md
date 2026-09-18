# 「今天吃什么」AI 菜谱推荐器 — 设计稿（MVP）

> 日期：2026-09-18 ｜ 类型：新模块（架构级） ｜ 状态：待用户审阅
> 定位：**自用优先**。为你老婆做一个"打开就给出今天这一桌全家吃啥"的推荐器，同时把目前最薄的 AI 顾问变成家人每天真正会用的价值入口。商业化不急于现在，但架构选择保持对多租户/未来演进友好。

## 0. 决策摘要（TL;DR）

- **内核**：一个「今天吃什么」推荐器（非菜谱相册、非库存管理）。第一版只做"根据家庭情况给出一日三餐方案"。
- **服务对象**：**全家共餐**——一次推荐 = 今天这一桌全家吃啥；口味/健康取**全家约束的并集**。
- **零录入债原则**：推荐默认**不依赖持久冰箱库存**（否则重蹈"记账录入太累"的老痛点）；仅允许**临时一句话**带食材（按需、不存储）。
- **引擎**：**纯 AI 生成**（复用 DeepSeek + `callOpenAiCompatChatJson`），预留"内置菜品库 + 校验"的演进位。
- **安全兜底**：过敏原等健康红线走 **prompt 硬约束 + 输出后服务端校验**，命中就拦/剔除，**绝不静默上桌**。
- **数据复用**：健康约束直接读现有 `health_profiles`（`allergies/conditions/notes`），**不重复录入**；口味新建轻量一次性档案。

## 1. 现状与背景

### 1.1 为什么是这个功能
- 家庭最高频的痛点（问题 1 选定）＝ **数据录入摩擦**，所以菜谱模块刻意避开"为推荐准而天天登记"的陷阱。
- 你老婆的独特需求 = 别人不会替你满足的真实刚需，且能立刻让**第二位家庭成员**真正用起来、扩大活跃家庭用户。
- 现状 AI 顾问前端仅 5KB 壳（见 `docs/commercialization-diagnosis.md` §1.2），本模块是把它做实的最佳载体。

### 1.2 可复用的技术地基（已核实）
- AI 通道：`callOpenAiCompatChatJson`（`api/_lib/aiOpenAiCompat.ts`），`response_format=json_object`，服务端按 `AI_LLM_PROVIDER` 选 DeepSeek/OpenAI。
- 后端骨架范式：`api/ai/chat.ts`（Bearer 鉴权 → 查 `users.family_id` → 按 IP 限流 → 调 AI）。
- 健康数据来源：`health_profiles` 含 `allergies / conditions / notes`（`supabase/migrations/20260308000001_health_tables.sql`）。
- 迁移/RLS 范式：`family_id` FK + `has_family_role` + 时间戳；hook 范式见 `src/hooks/useHealthProfile.ts`。
- 导航配置：`src/config/navigation.ts`。

## 2. 范围

### 2.1 MVP 做什么
- 推荐器：一次生成早/中/晚三餐；每道菜附"为什么适合我们家"的一行理由。
- 换一道：对某一餐/某道菜"换一个"，只重算该餐。
- 临时食材：一句话输入"家里还有…"，当场用、不持久化。
- 轻留痕：「存为今日方案」写一条 `meal_plans`；仪表板可展示今日方案/昨天吃了啥。
- 口味一次性设置页（可选，不设也能推荐）。

### 2.2 明确不做（v1.1+，写死为本期非目标）
- 拍照整理自家菜谱库（`dishes` 表、图片上传、AI 识别菜名/食材）。
- 持久冰箱/库存管理。
- 一键购物清单（及"库存差集"）。
- 基于近期体检指标的动态营养约束（控糖自动减糖等）。
- 按人分别出餐（一人一套菜）。

## 3. 数据模型

### 3.1 口味档 `meal_preferences`（每成员一条，一次性、极少改）
```
id uuid pk
family_id uuid -> families(id) on delete cascade not null
subject_user_id uuid -> users(id) on delete cascade not null
disliked text        -- 忌口/不爱吃
liked text           -- 偏好
spicy_level text     -- none|mil|med|hot（不吃辣~能辣）
notes text
created_by_user_id uuid -> users(id) on delete set null
created_at / updated_at timestamptz
unique (family_id, subject_user_id)
```
- RLS 复用 `health_profiles` 同款：`admin/parent` 或本人可读写。
- **故意与 `health_profiles` 分离**：口味（爱不爱吃）与健康约束（身体限制）语义不同、修改节奏不同。

### 3.2 今日方案 `meal_plans`（轻留痕，一天一版）
```
id uuid pk
family_id uuid -> families(id) on delete cascade not null
plan_date date not null
plan_json jsonb not null      -- { breakfast:[{name,why}], lunch:[...], dinner:[...] }
constraints_snapshot jsonb    -- 当次生效的过敏/健康/口味约束，便于追溯"当时为啥这么推"
created_by_user_id uuid -> users(id) on delete set null
created_at / updated_at timestamptz
unique (family_id, plan_date)
```
- MVP 一天一版；再次「存为今日方案」按 `(family_id, plan_date)` upsert 覆盖。

### 3.3 菜品不落库
- MVP 用纯 AI 生成，菜品只活在 `meal_plans.plan_json` 中。
- 预留演进位：待"自家拍照菜谱库"上线再引入 `dishes` 表（本期不建）。

## 4. 后端：`api/meals/recommend.ts`

### 4.1 骨架（照抄 `api/ai/chat.ts`）
- POST only；Bearer 鉴权 `authGetUser`；由 `users` 查 `family_id`；按 IP 限流（复用现有实现）。
- 追加**每家庭每日推荐软上限**（默认 30 次/天，可经环境变量调整）——防误点刷 AI。
- 复用 `AI_LLM_PROVIDER` / DeepSeek env；调 `callOpenAiCompatChatJson`。

### 4.2 请求体
```
{ date: string,
  servingUserIds?: string[],      // 默认全家成员；本餐涉及的人
  adhocIngredients?: string,      // 临时一句话食材（B 增强，不存）
  direction?: string,             // 想吃清淡 / 天热没胃口 / 快速搞定
  swap?: { meal: 'breakfast'|'lunch'|'dinner', dish: string } }  // 换一道时传
```

### 4.3 服务端组装"全家约束并集"（只读不写）
1. `servingUserIds` 默认解析为该家庭全部成员。
2. 逐个读 `health_profiles` → 汇总 `allergies`（过敏原，红线）、`conditions`/`notes`（控糖/低盐/病症忌口，红线或软约束）。
3. 逐个读 `meal_preferences` → 汇总 `disliked`（忌口）、`spicy_level`、`liked`（软目标）。
4. 去重合并为约束集合，分两类：**红线（绝对排除）** vs **软目标（尽量满足）**。

### 4.4 Prompt 与输出结构
- System：红线以"绝不出现 X"表述；口味/偏好/`direction`/`adhocIngredients` 为软目标（"优先利用家里还有的…"）。
- 固定输出 JSON：
```
{ breakfast:[{name, why}], lunch:[{name, why}], dinner:[{name, why}],
  shopping_hint?: string, notes?: string }
```
- **换菜（swap）**：只重算目标那一餐，带 `exclude:[该菜名 + 该餐现有菜名]`，其余两餐原样回填（省 token、体验连贯）。

### 4.5 输出后安全校验（服务端，不信任 AI）—— 核心
1. Zod 解析返回 JSON；失败→重试 1 次；仍失败→返回可回退错误（"AI 繁忙，稍后再试"，带 traceId）。
2. 过敏原扫描：把每道菜 `name + why` 拼成文本，逐条比对任一家庭成员**过敏原关键词**；
   - 命中 → 该餐要求重生成（最多 1 次，且把命中项加入 exclude）；
   - 仍命中 → **剔除该菜并在响应里显式标注被剔除**，绝不静默端上桌。
3. 病症软约束（控糖/低盐）尽量满足但不做硬剔除（避免误杀），在 `notes` 说明。

### 4.6 错误处理
- 复用 `toSafeMessage` + `traceId` + 统一错误信封；AI 超时/失败可重试。

## 5. 前端

### 5.1 页面 `src/pages/meals/Today.tsx`
- 顶部轻输入区：`direction`（"今天想怎么吃？"）+ `adhocIngredients`（"家里还有…（可选）"）+ 日期；全留空也能直接点「推荐今日三餐」。
- 三餐卡片：早/中/晚，每道菜 = 菜名 + 一行 `why`（贴合家庭情况的理由，让 AI 价值"看得见"）。
- 每道菜「换一个」→ 调 swap，仅刷该餐。
- 底部「存为今日方案」→ upsert `meal_plans`。
- 状态：加载骨架屏；失败"再试一次"；被剔除菜显式提示。

### 5.2 口味设置 `src/pages/settings/Taste.tsx`
- 入口放**设置中心**（不塞进菜谱页，避免高频页被低频设置干扰）。
- 每成员一行：忌口/偏好/吃辣度；复用 `useHealthProfile` upsert 范式。
- 可选：不设也能推荐（只是约束更少）。

### 5.3 仪表板轻留痕
- 在 Dashboard / `ActionInboxCard` 附近展示"今日已定：早/中/晚"摘要 + "昨天吃了啥"（来自 `meal_plans`），帮避免短期重复。

### 5.4 导航 `src/config/navigation.ts`
- 桌面顶层新增 `{ name: '今天吃什么', href: '/meals', icon: Utensils }`（lucide `Utensils`/`ChefHat`，靠家庭日常高频区）。
- 路由：`App.tsx` 在 `ProtectedRoute` 下挂 `/meals`；设置中心挂 `/settings/taste`。
- **mobileTabs 本期不加**（保持概览/财务/AI/设置四项）——列为可讨论点。

### 5.5 新增 hooks
- `useRecommendMeals`（mutation → `/api/meals/recommend`，含 swap）。
- `useMealPlan`（读写 `meal_plans`）。
- `useMealPreferences`（读写 `meal_preferences`）。

## 6. 隐私与合规（本模块必须诚实处理）
- 推荐会把**全家健康数据（过敏/病症）+ 口味**发给 AI 服务商（默认 DeepSeek）处理——属敏感个人信息给第三方。项目已有先例（`bills/parse`、`health-reports/parse`），但健康→AI 更敏感。
- 做法：
  1. 首次进入「今天吃什么」给**一次性明确告知 + 同意**（说清"健康/口味信息会发送给 AI 服务商 X 用于生成建议"），口径与 `TrustCenter` 一致。
  2. **最小必要**：只发过敏原/约束/口味等必要字段，不发病历原文、不发身份标识。
  3. 沿用 `TrustCenter` 第三方处理叙事，**不夸大合规**（诊断报告点名的红线：宣称"已合规"但无实现＝风险）。
- 免责：AI 建议不替代医疗/营养专业意见（餐卡 `notes` 或告知处一句带过）。

## 7. 测试要点
- 后端（mock AI，覆盖安全兜底）：
  - swap 只重算单餐、其余两餐原样回填。
  - 过敏原命中 → 重生成 → 仍命中则剔除并标注（绝不静默上桌）。
  - Zod 解析失败 → 重试 → 回退错误。
  - 每日软上限触发 → 限流响应。
- 前端：
  - 口味档为空仍能出推荐。
  - 空/加载/错误/被剔除态渲染正确。
  - 全留空一键出方案。

## 8. 待议点（已取默认，可推翻）
1. 命名：默认口语化「今天吃什么」（自用更亲切）；备选「膳食 / 厨房」。
2. mobileTabs 是否加入口：默认不加。
3. 每日推荐软上限：默认 30 次/家庭/天，env 可配。

## 9. 演进路线（非本期，保持架构不挡路）
- v1.1：内置/校验菜品库（从纯 AI 生成演进到"AI 生成 + 库校验"）、一键购物清单、动态体检指标营养约束。
- v1.2：自家拍照菜谱库（`dishes` 表 + Storage + AI 识别），作为推荐的额外菜源。
- 商业化（后置）：本模块是 Freemium 里"AI 顾问/Plus"的天然付费卖点；计量/配额与 `docs/commercialization-diagnosis.md` §2.2 一致，但本期不建。
