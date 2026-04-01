# AI Copilot v1（全站工具化 + Action Inbox）Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在全站右侧 Side Copilot 中实现“工具化 Copilot”：默认输出草稿并支持一键确认；并新增 Action Inbox（行动收件箱）作为持续推进机制，v1 覆盖 Finance F1/F2/F3 与 Health H1/H2/H3。

**Architecture:** 前端 CopilotPanel 渲染结构化响应（cards/drafts/warnings）并负责确认写入；后端新增 `/api/ai/chat` 作为编排层（鉴权、上下文聚合、工具选择、LLM 调用、结构化 JSON 输出）；新增 `action_items` 表作为跨模块行动承载。

**Tech Stack:** Vite + React + TypeScript + TanStack Query + Supabase (RLS/RPC) + Vercel Serverless `/api/*` + zod。

---

## 0) Files Map（将要改动/新增的文件）

**Database**
- Create: `supabase/migrations/20260401000000_action_items.sql`

**API (Vercel serverless)**
- Create: `api/_lib/aiOpenAiCompat.ts`
- Create: `api/_lib/aiSchemas.ts`
- Create: `api/_lib/aiTools.ts`
- Create: `api/ai/chat.ts`

**Frontend**
- Modify: `src/components/ai/copilot-panel.tsx`
- Modify: `src/layouts/MainLayout.tsx`
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/client.ts`
- Create: `src/hooks/useActionItems.ts`
- Create: `src/pages/dashboard/ActionInboxCard.tsx`
- Modify: `src/pages/dashboard/Dashboard.tsx`
- Modify: `src/types/index.ts`

**Docs**
- Modify: `docs/superpowers/specs/2026-04-01-ai-copilot-v1-design.md`（如实现过程中需要补字段/边界）

---

## Task 1: 新增 Action Inbox 数据表与 RLS

**Files:**
- Create: `supabase/migrations/20260401000000_action_items.sql`
- Modify: `src/types/index.ts`（新增类型）

- [ ] **Step 1: 设计 SQL（表结构 + 索引 + RLS）**
  - 表：`public.action_items`
  - 字段（最小可用）：
    - `id uuid primary key default uuid_generate_v4()`
    - `family_id uuid not null references public.families(id) on delete cascade`
    - `owner_user_id uuid null references public.users(id) on delete set null`
    - `visibility text not null check (visibility in ('family','private'))`
    - `module text not null check (module in ('finance','health','relationships','growth','settings'))`
    - `title text not null`
    - `description text null`
    - `next_step text null`
    - `due_date date null`
    - `status text not null check (status in ('todo','doing','done','dismissed')) default 'todo'`
    - `source text not null check (source in ('ai','user'))`
    - `source_meta jsonb not null default '{}'::jsonb`
    - `created_by_user_id uuid null references public.users(id) on delete set null`
    - `created_at timestamptz default now()`
    - `updated_at timestamptz default now()`
  - 索引：
    - `(family_id, status, due_date)`
    - `(owner_user_id, status, due_date)`
    - `(family_id, module, status)`
  - `enable row level security`
  - RLS（最小可用）：
    - select: 家庭成员可见 `visibility='family'`；`visibility='private'` 仅 owner 可见；admin/parent 可读全家
    - insert: 必须属于自己 family；`owner_user_id` 只能为自己或 null（公共）
    - update/delete: owner 或 admin/parent

- [ ] **Step 2: 补齐前端类型**

```ts
export interface ActionItem {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  visibility: 'family' | 'private';
  module: 'finance' | 'health' | 'relationships' | 'growth' | 'settings';
  title: string;
  description: string | null;
  next_step: string | null;
  due_date: string | null;
  status: 'todo' | 'doing' | 'done' | 'dismissed';
  source: 'ai' | 'user';
  source_meta: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: 验证**
  - Run: `pnpm check`
  - 预期：TypeScript 通过
  - 数据库验证：在 Supabase SQL Editor 执行 migration，确认表可 select/insert（以家庭成员身份测试）。

---

## Task 2: 后端 `/api/ai/chat`（鉴权 + 工具化编排 + JSON 输出）

**Files:**
- Create: `api/_lib/aiOpenAiCompat.ts`
- Create: `api/_lib/aiSchemas.ts`
- Create: `api/_lib/aiTools.ts`
- Create: `api/ai/chat.ts`
- Modify: `.env.example`（补充 AI 变量）

- [ ] **Step 1: 定义 Copilot 响应 schema（Zod）**
  - 在 `api/_lib/aiSchemas.ts` 定义：
    - `CopilotCardSchema`
    - `CopilotDraftSchema`（kind 枚举，data 为 unknown 但限制最大体积）
    - `CopilotResponseSchema`
    - `ChatRequestSchema`：`{ message: string; module?: string; page?: string; context?: {...} }`

- [ ] **Step 2: 提取 OpenAI-compat 调用（DeepSeek/OpenAI 统一）**
  - `api/_lib/aiOpenAiCompat.ts`：
    - `callChatJson({ baseUrl, apiKey, model, system, user, temperature }): Promise<string>`
    - 统一 `trimJsonEnvelope`
    - 统一错误中文化 `toSafeMessage`

- [ ] **Step 3: 实现 Tool Registry（v1 仅 6 个工具）**
  - `api/_lib/aiTools.ts` 结构：
    - `toolId` → `{ schema, run(ctx, input) }`
    - `ctx` 包含：`userId/familyId/role/supabaseClient` + 必要上下文数据
  - v1 工具（按最小闭环）：
    - `finance.quickbook.nl`（F1）
    - `finance.import.assistant`（F2：先做“打开导入弹窗 + 指导语 + 识别参数草稿占位”，识别复用现有前端）
    - `finance.budget.coach`（F3：读取 budgets+transactions 汇总，生成预算调整草稿）
    - `health.week.plan`（H1：生成 action_items 草稿列表）
    - `health.metrics.explain`（H2：只读解释 + 可选 action_items 草稿）
    - `health.checkin.coach`（H3：生成 action_items 草稿 + 可选 health_metric 草稿）

- [ ] **Step 4: 实现 `/api/ai/chat.ts`**
  - 鉴权：
    - 从 header 读 Bearer token
    - 复用 `api/_lib/supabaseAuthCompat.ts` 的 `authGetUser`
    - anon client 校验 user
    - user client：`global.headers.Authorization = Bearer token` 用于按 RLS 读取业务数据
  - 速率限制：沿用 `api/bills/parse.ts` 的 in-memory rate limit（按 ip）
  - 工具选择策略（v1 不上复杂 agent）：
    - 规则优先：根据 message 关键词与 module 推断 toolId
    - 再 fallback：走 LLM classifier（输出 `{ toolId, reason, confidence }` 的 JSON）
  - 工具执行：
    - tool 返回 `CopilotResponse`
    - 服务端校验 `CopilotResponseSchema.parse`
  - 响应：`{ summary, cards, drafts, warnings, meta }`

- [ ] **Step 5: `.env.example` 增加 AI 配置示例**
  - `AI_LLM_PROVIDER=deepseek`
  - `DEEPSEEK_API_KEY=...`
  - `DEEPSEEK_BASE_URL=...`
  - `DEEPSEEK_MODEL=...`
  - `OPENAI_API_KEY=...`

- [ ] **Step 6: 验证**
  - Run: `pnpm check`
  - 手动验证：
    - 已登录情况下，前端 fetch `/api/ai/chat` 返回 200 且 JSON 可解析
    - 未登录返回 401 且 message 中文

---

## Task 3: 前端 AI 客户端与类型（稳定渲染结构化输出）

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/client.ts`
- Modify: `src/components/ai/copilot-panel.tsx`
- Modify: `src/layouts/MainLayout.tsx`

- [ ] **Step 1: 新增前端 Copilot 类型**
  - `src/lib/ai/types.ts`：
    - `CopilotCard`
    - `CopilotDraft`
    - `CopilotResponse`
    - `ChatRequest`

- [ ] **Step 2: 新增 ai client（自动携带 supabase token）**
  - `src/lib/ai/client.ts`：
    - `sendCopilotMessage({ message, module, page, context }): Promise<CopilotResponse>`
    - 使用 `supabase.auth.getSession()` 拿 token
    - 错误转中文 `toUserMessage`

- [ ] **Step 3: 升级 CopilotPanel 渲染**
  - 目标：消息列表支持两类 assistant 内容：
    - 纯文本（兼容旧消息）
    - 结构化响应（summary/cards/drafts/warnings）
  - UI（最小可用）：
    - summary 作为气泡
    - cards 渲染为按钮列表（点击触发 handler）
    - drafts 渲染为“草稿卡片”：标题 + 关键信息（可折叠）+ “确认”按钮
    - warnings 渲染为 Alert（warning）

- [ ] **Step 4: 在 MainLayout 注入 Copilot 执行器**
  - `MainLayout` 已是 Copilot 的挂载点，新增：
    - `onSubmitPrompt` 调用 `sendCopilotMessage`
    - 根据返回的 cards/drafts 绑定动作处理（navigate / 打开弹窗 / 打开导入）
  - v1 行动卡片落地（必须覆盖）：
    - `navigate`：用 `navigate(href)`
    - `open_modal`：用 query param（例如 `/finance?action=add`）复用现有弹窗打开逻辑
    - `open_inbox`：navigate `/dashboard` 并滚动到收件箱（可后置）

- [ ] **Step 5: 验证**
  - Run: `pnpm check`
  - 手动验证：
    - 在任意页面打开 Copilot，输入一句话，能看到 cards/drafts
    - 点击 card 能打开对应页面/弹窗

---

## Task 4: Dashboard 增加 Action Inbox 入口（v1）

**Files:**
- Create: `src/hooks/useActionItems.ts`
- Create: `src/pages/dashboard/ActionInboxCard.tsx`
- Modify: `src/pages/dashboard/Dashboard.tsx`

- [ ] **Step 1: 新增 useActionItems hook**
  - 查询：按 `family_id` 拉取 `status in ('todo','doing')`，排序 `due_date nulls last, created_at desc`
  - Mutations：
    - `updateStatus(id, status)`
    - `dismiss(id)`（status='dismissed'）

- [ ] **Step 2: 新增 Dashboard 卡片 ActionInboxCard**
  - 展示：
    - 标题：行动收件箱
    - 前 5 条 todo/doing
    - 每条：title + next_step（可选）+ due_date（可选）
    - CTA：完成 / 忽略（最小操作）
    - 空态：引导“去问 AI 生成本周行动清单”

- [ ] **Step 3: Dashboard 接入**
  - 在 `Dashboard.tsx` 的头部 CTA 保留原有按钮
  - 在主内容区域（趋势/结构上方或下方）插入 ActionInboxCard

- [ ] **Step 4: 验证**
  - Run: `pnpm check`
  - 手动验证：
    - 创建 action_items 后 Dashboard 可见
    - 完成/忽略能更新状态并实时刷新

---

## Task 5: 将 H1/H3 输出落到 Action Inbox（草稿确认 → 写入）

**Files:**
- Modify: `api/_lib/aiTools.ts`
- Modify: `src/components/ai/copilot-panel.tsx`
- Modify: `src/layouts/MainLayout.tsx`
- Modify: `src/hooks/useActionItems.ts`

- [ ] **Step 1: 约定 action_item 草稿 data 结构**
  - `draft.kind = 'action_item'`
  - `draft.data`：
    - `visibility/module/title/description/next_step/due_date/owner_user_id`（最小字段）

- [ ] **Step 2: 前端确认写入 action_items**
  - 点击草稿“确认”：
    - 直接 `supabase.from('action_items').insert(...)`
    - 成功后刷新 `useActionItems` query
    - 给 toast：成功/失败（中文）

- [ ] **Step 3: H1/H3 工具生成 action_item 草稿**
  - H1：生成 2-6 条 action_item 草稿（默认 due_date=本周内）
  - H3：生成 1-3 条 action_item 草稿（更轻量）

- [ ] **Step 4: 验证**
  - 手动验证：在 Copilot 输入“给我本周健康行动清单”，生成草稿并一键确认后出现在 Dashboard 收件箱

---

## Task 6: Finance v1 三工具落地（以“草稿确认 + 现有弹窗/流程复用”为主）

**Files:**
- Modify: `api/_lib/aiTools.ts`
- Modify: `src/layouts/MainLayout.tsx`
- Modify: `src/pages/finance/Overview.tsx`（如需支持更多 query action）

- [ ] **Step 1: F1 一句话记账（草稿 → 打开记账弹窗预填）**
  - 服务端输出 `transaction` 草稿：
    - `amount/type/category/date/visibility/description`
  - 前端：
    - action card：`open_modal` → `/finance?action=add`
    - 草稿确认：复用 `TransactionEditorModal` 的提交逻辑（可先用“打开弹窗预填 → 用户确认保存”作为 v1）

- [ ] **Step 2: F2 导入助手（先做强入口闭环）**
  - v1 策略：不在 Copilot 内重复实现解析；复用现有 `TransactionImportModal`
  - action card：打开导入入口（如 `/finance/transactions?action=import`，或在 `/finance` 新增 action=import）
  - Copilot 输出：导入前检查清单（文件格式/截图清晰度/隐私提示）+ 下一步按钮

- [ ] **Step 3: F3 预算教练（草稿 → 跳转预算页并预填调整）**
  - v1 策略：先产出“建议列表 + CTA 跳转预算管理”
  - 若时间允许：实现 `budget_adjustment` 草稿并在预算页提供“应用草稿”（以模板/继承机制为准）

- [ ] **Step 4: 验证**
  - 手动验证：
    - F1：一句话 → 打开记账弹窗 → 预填正确
    - F2：点击入口 → 能打开导入弹窗
    - F3：点击入口 → 能跳转预算页并看到建议

---

## Task 7: 全局验收（Definition of Done）

- [ ] Copilot 在全站可用，输出结构化 cards/drafts，不再是占位回复
- [ ] 默认“草稿+确认”路径可闭环写入（至少 action_items）
- [ ] Dashboard 存在行动收件箱入口并可完成/忽略
- [ ] Finance F1/F2/F3 至少具备“AI → 行动入口 → 完成下一步”的闭环
- [ ] Health H1/H2/H3 至少具备“AI → 生成行动 → 进入收件箱 → 完成”的闭环
- [ ] Run: `pnpm lint` 与 `pnpm check` 均通过

