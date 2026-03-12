# Family Inc. OS - 技术架构（现状口径）

## 0. 一句话总结
- 当前实现是 Vite + React SPA（PWA）部署在 Vercel；业务数据主要由前端直连 Supabase（PostgREST/RPC + RLS）完成；仅将“必须使用 service role 的特权动作”放在 `/api/*`（例如账号注销）。

## 1. 架构总览

### 1.1 关键边界
- **前端（SPA）**：路由、页面渲染、表单交互、React Query 缓存、调用 Supabase（`from/rpc/auth`）
- **Supabase**：Auth、Postgres、RLS（授权兜底）、RPC/Trigger（原子业务操作）
- **Vercel Serverless**：少量后端动作（例如删除 Auth 用户），负责安全地使用 service role

### 1.2 架构图（C4-like）
- Context：[c4-context.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/c4-context.md)
- Containers：[c4-containers.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/c4-containers.md)
- Core Components：[c4-components-core.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/c4-components-core.md)

## 2. 技术栈（以 package.json 为准）

### 2.1 前端
- 构建：Vite
- 框架：React 18 + TypeScript
- 路由：react-router-dom（嵌套路由 + 守卫）
- 数据缓存：TanStack Query
- 本地状态：Zustand
- 样式：Tailwind CSS
- PWA：vite-plugin-pwa + workbox-window

### 2.2 后端/数据
- Supabase：Auth + Postgres（RLS + Functions/RPC + Triggers）
- Vercel Serverless Functions：`api/*`（当前存在 `/api/account/delete`）

## 3. 入口与路由

### 3.1 应用入口
- [main.tsx](file:///Users/brucewang/Documents/AIYA/home/src/main.tsx)：注册 PWA 更新提示 + React Root
- [App.tsx](file:///Users/brucewang/Documents/AIYA/home/src/App.tsx)：Router + QueryClientProvider + AuthProvider + ErrorBoundary

### 3.2 路由与权限守卫
- 是否登录（Auth）：[ProtectedRoute.tsx](file:///Users/brucewang/Documents/AIYA/home/src/components/ProtectedRoute.tsx)
- 是否已加入家庭（Profile.family_id）：[RequireFamilyRoute.tsx](file:///Users/brucewang/Documents/AIYA/home/src/components/RequireFamilyRoute.tsx)
- 当前路由表以 [App.tsx](file:///Users/brucewang/Documents/AIYA/home/src/App.tsx) 为准（例如 `/login`、`/join`、`/finance/*`、`/settings/*` 等）

## 4. 数据访问与权限模型

### 4.1 主数据路径（读写模型）
- UI 触发 → `src/hooks/*`（React Query）→ `supabase.from(table)` / `supabase.rpc(fn)` → Supabase PostgREST/RPC → Postgres（RLS/Functions）→ 返回 → React Query 缓存与失效

### 4.2 鉴权与授权（关键约束）
- **鉴权**：Supabase Auth（session/access token 在前端管理）
- **授权**：Supabase RLS（决定“前端直连”是否安全可控）
- **特权动作**：只有 service role 才能做的操作必须走 `/api/*`（避免在前端暴露 service role）

### 4.3 端到端动态流
- Auth + 路由守卫：[c4-dynamic-auth.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/c4-dynamic-auth.md)
- 邀请加入家庭：[c4-dynamic-invite.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/c4-dynamic-invite.md)
- 账号注销：[c4-dynamic-delete-account.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/c4-dynamic-delete-account.md)

## 5. API（现状）

### 5.1 Vercel Serverless
- `POST /api/account/delete`：[delete.ts](file:///Users/brucewang/Documents/AIYA/home/api/account/delete.ts)
  - 使用 bearer token 校验用户身份
  - 调用 DB RPC `delete_my_account` 清理业务数据
  - 使用 service role 删除 Supabase Auth 用户

### 5.2 Supabase RPC（现状示例）
- 邀请：`get_invitation_info` / `accept_invitation`
- 预算补齐：`ensure_month_budgets`
- 固定支出生成：`generate_recurring_transaction`
- 成员角色更新：`update_member_role`

## 6. 部署与配置

### 6.1 Vercel
- SPA Rewrite + /api 保留：[vercel.json](file:///Users/brucewang/Documents/AIYA/home/vercel.json)

### 6.2 环境变量
- 客户端（Vite）：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（缺失会在生产显示配置错误页）
- Serverless（Vercel）：`SUPABASE_SERVICE_ROLE_KEY`（以及 URL/ANON_KEY 的 server-side 读取）

## 7. 研发定位入口（推荐从这里找）
- 架构 SSOT：`docs/architecture/*`（见下）
  - Context/Container/Components/Dynamic
  - 模块映射：[module-map.md](file:///Users/brucewang/Documents/AIYA/home/docs/architecture/module-map.md)
- DB 侧：`supabase/migrations/*`（schema/RLS/RPC/trigger）

