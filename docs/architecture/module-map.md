# 模块映射（页面 / Hook / 数据表 / RPC）

## 目的
- 快速回答“这个页面的数据从哪来、写到哪、靠什么权限兜底”

## 约定
- 前端直连 Supabase：`supabase.from(table)` / `supabase.rpc(fn)`
- “权限兜底”主要指 Supabase RLS Policies + DB Functions（RPC/trigger）

## Auth / 用户

| 页面/模块 | 主要代码 | 数据访问 | 表 / RPC | 权限关键点 |
|---|---|---|---|---|
| Auth 会话 | [AuthContext.tsx](file:///Users/brucewang/Documents/AIYA/home/src/contexts/AuthContext.tsx) | `supabase.auth.getSession/onAuthStateChange` | Supabase Auth | 前端只持有 anon key；会话由 Supabase 管理 |
| 登录守卫 | [ProtectedRoute.tsx](file:///Users/brucewang/Documents/AIYA/home/src/components/ProtectedRoute.tsx) | 读 `useAuth()` | - | 未登录强制跳转 `/login` |
| Profile 加载 | [useProfile.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useProfile.ts) | `from('users').select().eq('id', user.id)` | `users` | 依赖 RLS 限制“只能读自己的 users 行” |

## Family / 邀请 / 成员管理

| 页面/模块 | 主要代码 | 数据访问 | 表 / RPC | 权限关键点 |
|---|---|---|---|---|
| 家庭创建/加入入口 | [Setup.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/family/Setup.tsx) | 以页面实现为准（可能调用 create_family / accept） | `create_family` 等 RPC | 核心写入建议走 RPC，保证原子性与权限一致性 |
| 邀请加入落地 | [JoinFamily.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/JoinFamily.tsx) | `rpc('get_invitation_info')` + `rpc('accept_invitation')` | `invitations` + RPC | `get_invitation_info` 允许 anon；`accept_invitation` 必须登录 |
| 邀请管理 | [Invitations.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/settings/Invitations.tsx) | `from('invitations')` 增删改查 | `invitations` | 依赖 RLS：通常限制 admin/parent 可创建/撤销 |
| 家庭成员列表/改角色 | [useFamilyMembers.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useFamilyMembers.ts) | `from('users')` + `rpc('update_member_role')` | `users` + `update_member_role` | 角色变更走 RPC；应在 DB 侧校验“不能降级最后一个 admin”等约束 |
| 必须加入家庭守卫 | [RequireFamilyRoute.tsx](file:///Users/brucewang/Documents/AIYA/home/src/components/RequireFamilyRoute.tsx) | 读 `useProfile()` | `users.family_id` | `family_id` 为空则跳转 `/family/setup` |

## Finance

| 页面/模块 | 主要代码 | 数据访问 | 表 / RPC | 权限关键点 |
|---|---|---|---|---|
| 交易 | [Transactions.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Transactions.tsx) / [useTransactions.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useTransactions.ts) | `from('transactions')` CRUD | `transactions` | RLS：按 `family_id` 隔离；支持 `visibility='private'` 仅本人可见（按 migrations 实现） |
| 分类库 | [Categories.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Categories.tsx) / [useCategories.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useCategories.ts) | `from('categories')` CRUD | `categories` | RLS：按 `family_id` 隔离 |
| 预算 | [Budgets.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Budgets.tsx) / [useBudgets.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgets.ts) | `rpc('ensure_month_budgets')` + `from('budgets')` | `budgets` + `ensure_month_budgets` | 预算补齐逻辑在 DB RPC；前端 upsert 仍受 RLS 约束 |
| 固定支出/订阅 | [Recurring.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Recurring.tsx) / [useRecurringTransactions.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useRecurringTransactions.ts) | `from('recurring_transactions')` + `rpc('generate_recurring_transaction')` | `recurring_transactions` + `generate_recurring_transaction` | 生成交易建议由 RPC 做原子写入，避免客户端越权/重复 |
| 资产负债表 | [Assets.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Assets.tsx) / [useBalanceSheet.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBalanceSheet.ts) | `from('balance_sheet_items')` + `from('fund_accounts')` | `balance_sheet_items` / `fund_accounts` | 依赖 RLS：按家庭隔离；写入应校验类型/owner（按表设计） |
| 分配规则 | [useAllocationRules.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useAllocationRules.ts) | `from('allocation_rules')` CRUD | `allocation_rules` | RLS：按家庭隔离 |
| 预算模板 | [useBudgetTemplates.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgetTemplates.ts) | `from('budget_templates')` CRUD | `budget_templates` | RLS：按家庭隔离 |

## Health / Relationships（按 Hook 归口）

| Hook | 主要代码 | 表 | 说明 |
|---|---|---|---|
| [useHealthProfile.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useHealthProfile.ts) | `from('health_profiles')` | `health_profiles` | 健康档案（个人/家庭维度以表设计为准） |
| [useHealthMetrics.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useHealthMetrics.ts) | `from('health_metrics')` | `health_metrics` | 健康指标数据 |
| [useInsurancePolicies.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useInsurancePolicies.ts) | `from('insurance_policies')` | `insurance_policies` | 保险单 |
| [useRelationshipEvents.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useRelationshipEvents.ts) | `from('relationship_events')` | `relationship_events` | 关系事件 |
| [useExternalContacts.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useExternalContacts.ts) | `from('external_contacts')` | `external_contacts` | 外部联系人 |
| [useContactInteractions.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useContactInteractions.ts) | `from('contact_interactions')` | `contact_interactions` | 联系互动记录 |
| [useMemberRemarks.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useMemberRemarks.ts) | `from('family_member_remarks')` | `family_member_remarks` | 成员备注 |

## Account / 特权后端动作

| 页面/模块 | 主要代码 | 数据访问 | 表 / RPC | 权限关键点 |
|---|---|---|---|---|
| 账号注销 | [Account.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/settings/Account.tsx) / [delete.ts](file:///Users/brucewang/Documents/AIYA/home/api/account/delete.ts) | `POST /api/account/delete` | `delete_my_account` + Supabase Admin deleteUser | “删除 Auth 用户”必须走 service role；业务数据清理由 DB RPC 执行 |

