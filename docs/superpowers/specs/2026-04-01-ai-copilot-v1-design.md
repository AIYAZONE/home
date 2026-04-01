# AI Copilot v1（全站工具化 + 行动收件箱）设计稿

## 1. Summary

本项目进入 **Copilot First** 模式：AI 作为全站入口与推进器，以“最少打断”为体验原则。默认执行策略为 **生成草稿 → 用户一键确认**，并引入跨模块的 **Action Inbox（行动收件箱）** 让 AI 能持续推动完成。

v1 标杆工具集（已确定）：
- Finance：F1/F2/F3
- Health：H1/H2/H3

## 2. 背景与目标

### 2.1 背景
- 现状：Vite + React SPA（PWA）部署在 Vercel；前端直连 Supabase（RLS/RPC）；少数特权动作走 `/api/*`。
- 已有 Copilot 右侧面板（Side Copilot），但当前仅做占位回复，缺少可执行闭环。

### 2.2 目标（v1）
- 全站一致的 Copilot 交互：**解释可选、行动必有、草稿可确认**。
- “最少打断”：用户不需要离开当前页面，即可完成下一步（打开弹窗/生成草稿/一键确认）。
- “推动完成”：引入 Action Inbox，让 AI 生成的行动能被追踪、提醒、迭代（用户纠错→反馈→下次更准）。

### 2.3 非目标（v1 不做）
- 全自动执行（Auto + Undo）作为默认策略（仅在个别低风险动作上做灰度）。
- 多模态（音频/视频）与深度长链路 Agent（先稳住工具化与草稿确认闭环）。
- 银行级对账一致性与复杂会计体系。

## 3. 约束

### 3.1 技术约束
- AI Key 不允许进入前端；AI 推理必须在 `/api/*` 完成。
- 数据读写必须遵守 Supabase RLS；AI 不得绕过权限边界。
- 用户可见文案必须中文化；错误不得泄漏英文细节。

### 3.2 体验约束
- Side Copilot 是主形态：随时可用、尽量不遮挡工作流、不强制切页。
- 默认写入通过“草稿确认”完成，避免误操作与不可解释。

## 4. 总体方案（分层）

### 4.1 UI 层：Side Copilot（最少打断）
增强现有右侧 Copilot：
- 输出从“纯文本”升级为结构化内容：
  - Summary（一句话）
  - Action Cards（可点击执行）
  - Draft Preview（草稿可编辑/可确认）
  - Warnings（不确定性/风险提示）
- 与全站动作深度耦合：
  - 导航到指定页面
  - 打开指定弹窗（含预填草稿）
  - 在当前页完成“一键确认”写入

### 4.2 编排层：`POST /api/ai/chat`
新增统一 AI 入口，负责：
- 校验登录（Bearer token → Supabase `auth.getUser`）
- 读取上下文（用户/家庭/当前模块 + 必要业务数据）
- 意图识别 → 选取工具 → 生成结构化响应（JSON）
- 可选：写入 Action Inbox 草稿（仍需前端确认后提交）

### 4.3 工具层：Tool Registry（全站能力统一封装）
将“可执行能力”封装为工具（函数）：
- 明确输入/输出 schema（Zod）
- 具备权限等级：
  - `read`: 只读解释/建议
  - `draft`: 生成草稿（默认）
  - `write`: 执行写入（v1 默认不启用，仅预留）
- 工具输出必须包含 action cards（至少 1 个）

## 5. 统一返回契约（Copilot Response Schema）

### 5.1 顶层
- `summary: string`
- `cards: CopilotCard[]`（必填，至少 1）
- `drafts?: CopilotDraft[]`
- `warnings?: string[]`
- `meta?: { traceId: string; toolId?: string; confidence?: number }`

### 5.2 Action Card
建议类型：
- `type: 'navigate' | 'open_modal' | 'apply_draft' | 'open_inbox' | 'copy_text'`
- `label: string`
- `description?: string`
- `payload: Record<string, unknown>`（由前端解释）

### 5.3 Draft
统一草稿形态（v1）：
- `draftId: string`
- `kind: 'transaction' | 'transaction_import' | 'budget_adjustment' | 'health_action_plan' | 'health_metric' | 'action_item'`
- `title: string`
- `data: Record<string, unknown>`（具体结构由 kind 决定）
- `requiresConfirm: true`

## 6. Action Inbox（行动收件箱）

### 6.1 数据模型（Supabase）
新增表 `public.action_items`（建议字段）：
- `id uuid pk`
- `family_id uuid not null`
- `owner_user_id uuid null`（可选：分配给某人；null 表示家庭公共）
- `visibility 'family' | 'private'`（与现有一致）
- `module 'finance' | 'health' | 'relationships' | 'growth' | 'settings'`
- `title text not null`
- `description text null`
- `next_step text null`（一句话行动）
- `due_date date null`
- `status 'todo' | 'doing' | 'done' | 'dismissed'`
- `source 'ai' | 'user'`
- `source_meta jsonb`（含 toolId、原始提示摘要等；不存敏感原文）
- `created_by_user_id uuid null`
- `created_at/updated_at`

RLS（建议）：
- 家庭可见：family 成员可读；私密：owner 可读
- 写入：仅允许家庭成员为自己/家庭创建；更新：仅 owner 或 admin/parent

### 6.2 UI（v1）
- 新增“行动收件箱”页面（可先挂到 `/advisor` 或 `/dashboard` 的入口卡片）
- 在 Side Copilot 中提供卡片：打开收件箱、将草稿落入收件箱、完成/忽略行动

## 7. v1 工具集定义（F1-F3 / H1-H3）

### 7.1 Finance
- **F1 一句话记账（draft）**
  - 输入：自然语言（“午饭 38”“工资 +20000”）
  - 输出：`transaction` 草稿 + “打开记账弹窗（预填）/一键确认”
  - 写入：复用现有交易创建逻辑（Supabase insert）

- **F2 导入助手（draft）**
  - 输入：截图/CSV/粘贴文本（前端已有导入弹窗与解析能力）
  - 输出：`transaction_import` 草稿（列表、去重、分类建议、异常提示）+ “打开导入弹窗（预览）”
  - 写入：复用现有导入提交流程

- **F3 预算教练（draft）**
  - 输入：本月预算与支出概览（后端读取）
  - 输出：解释 + `budget_adjustment` 草稿（建议调哪些分类、调多少、原因）+ “一键应用”
  - 写入：复用现有预算模板/继承机制与 RPC（或直接 upsert budgets）

### 7.2 Health
- **H1 本周行动清单（draft）**
  - 输出：`health_action_plan` 草稿 + 同步落入 `action_items`（需确认）
  - 行动卡片：打开收件箱/确认创建计划

- **H2 指标解释与风险提示（read + optional draft）**
  - 输入：近 90 天 `health_metrics`
  - 输出：一句话结论 + 为什么 + 3 条建议
  - 可选：生成 1-2 条行动草稿（进入 Action Inbox）

- **H3 打卡纠偏（draft）**
  - 输入：一句话状态（例如“这周睡得很差”）
  - 输出：1-3 条行动草稿（进入 Action Inbox）+ 可选生成 `health_metric` 预填草稿

## 8. LLM 提供方与配置

### 8.1 原则
- 统一 OpenAI-compat 接口（便于切换供应商）
- 仅文本能力（v1）
- 结构化输出（JSON），强约束减少前端解析复杂度

### 8.2 环境变量（草案）
- `AI_LLM_PROVIDER=deepseek|openai`（默认 deepseek）
- `DEEPSEEK_API_KEY=...`
- `DEEPSEEK_BASE_URL`（可选）
- `DEEPSEEK_MODEL`（可选）
- `OPENAI_API_KEY`（可选）

## 9. 安全、隐私与审计
- 不在日志中记录用户原始提示、敏感信息或密钥。
- AI 生成的“写入建议”必须经过前端确认。
- Action Inbox 与关键写入动作进入审计（复用现有 audit_logs 能力）。
- 错误统一中文化，并避免透出供应商报错原文。

## 10. 观测与指标（用于验证“更少思考”）
- Copilot 打开率、提问率、卡片点击率、草稿确认率
- 任务完成时长（从提问到确认写入）
- 草稿被编辑比例（代表 AI 准确度）
- “撤销/驳回/忽略”比例（代表误推送）

## 11. 上线策略（建议）
- v1 先在 Finance/Health 模块灰度展示更强的 Copilot 卡片与草稿
- Action Inbox 先做最小版本（创建/完成/忽略 + 列表筛选）
- 再扩展 Relationships/Growth/Settings 的工具覆盖

