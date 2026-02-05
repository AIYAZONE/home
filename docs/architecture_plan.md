# Family Inc. OS 架构规划（前端 + Supabase）

## 总览
- 前端：Vite + React + React Router + TanStack Query
- 状态：以 server-state 为主（React Query），少量 UI state（useState / Zustand）
- 后端：Supabase Auth + Postgres + RLS + RPC（SECURITY DEFINER）

## 模块划分与目录建议
### 目录结构（建议逐步演进）
- `src/components/ui/*`：可复用基础组件（Button/Input/Card/Toast/Skeleton…）
- `src/components/layout/*`：AppShell 结构组件（Sidebar/TopBar/MobileTab/PageHeader…）
- `src/features/*`：按业务域组织（finance/settings/dashboard…），每域包含 components/hooks/api
- `src/lib/*`：工具、错误映射、格式化、supabase client
- `src/stores/*`：全局 UI 状态（Toast/Drawer/Theme 等）

## 数据访问规范（最关键）
### 原则 1：读走 RLS，写走 RPC

#### 读（SELECT）
- 所有业务表默认开启 RLS
- 策略以 `family_id` 为隔离边界
- 页面查询尽量只取需要字段，并统一处理 loading/empty/error 状态

#### 写（INSERT/UPDATE/DELETE）
- 涉及跨表/多步写入的动作统一用 RPC（例如：创建家庭、接受邀请）
- RPC 内保证事务一致性（要么都成功，要么都失败）
- 前端只关心调用成功/失败与需要展示的最小结果

### 原则 2：禁止 policy 递归
- 禁止在 `public.users` 的 policy 中再次查询 `public.users`
- 允许调用 `SECURITY DEFINER` helper function（由数据库拥有者执行，绕开 RLS 递归）

## RLS/RPC 规范（避免递归与越权）
### 规范摘要
- policy 只做“是否可见/是否可写”的布尔判定，不做复杂业务逻辑
- 复杂逻辑放到 `SECURITY DEFINER` 函数：
  - 入参严格、字段最小化
  - 校验集中（状态、过期、邮箱匹配、是否已加入家庭）
  - 授权最小（只 grant 需要的角色）

### Helper Functions（供 policy 调用）
- `get_my_family_id()`：获取当前用户家庭
- `is_family_member(family_id)`：判断当前用户是否属于某家庭

### 业务 RPC（供前端调用）
- 邀请：
  - `get_invitation_info(token)`：支持匿名/登录，返回最小字段（family_name/role/expiry…）
  - `accept_invitation(token)`：仅登录可执行，原子化加入家庭并更新邀请状态
- 家庭：
  - `create_family(name)`：仅登录可执行，原子化创建家庭并将用户设为 admin

对应 migrations：
- [20240205000002_fix_rls_and_invites.sql](file:///Users/brucewang/Documents/AIYA/home/supabase/migrations/20240205000002_fix_rls_and_invites.sql)
- [20240205000003_create_family_rpc.sql](file:///Users/brucewang/Documents/AIYA/home/supabase/migrations/20240205000003_create_family_rpc.sql)

## 前端错误处理规范（产品化）
- 将 Supabase 错误映射为用户可理解的中文文案 + 下一步行动
- 优先使用 Toast（瞬时反馈）+ AlertBanner（阻断性错误）
- 不直接展示原始 SQL/RLS 错误文本（只在 debug 场景保留原始 message）

## 安全与隐私最低要求
- invitations 严禁全表公开读取（禁用 `using(true)`）
- token 生成必须使用强随机（WebCrypto），避免可猜测
- RPC 仅开放必要的角色与字段（最小权限、最小返回）

## 质量门槛（工程）
- `npm run check` 通过
- `npm run build` 通过
- 关键路径可在移动端完成：登录/创建家庭/邀请加入/记账
