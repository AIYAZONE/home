# 账号注销（方案 B）设计说明

## 目标
- 支持用户发起“注销账号”，完成业务数据清理 + 删除 Supabase Auth 用户
- 关键动作写入审计日志，便于排查与追责

## 核心原则
- 业务数据清理在数据库侧完成（事务内），前端只负责发起请求与展示结果
- 删除 Supabase Auth 用户必须走服务端（使用 service role），严禁在前端泄漏 service role key
- 删除后仍保留必要的审计记录（审计表不对 actor_id 建立外键）

## 注销语义（MVP）
### 1) 非“最后成员”
- 清理用户的“私密数据”（对他人不可见的数据）
- 清理强归属用户的个人数据（如个人外部联系人）
- 家庭共享数据默认保留（例如：家庭可见交易、家庭预算/分类等）
- 用户从家庭解绑（family_id 置空），随后由服务端删除 Auth 用户（触发 public.users 级联删除）

### 2) “最后成员”
- 在完成个人清理后，额外清理该家庭下全部数据并删除家庭记录（避免孤儿家庭）

### 3) 管理员约束
- 若用户是该家庭“唯一 admin 且家庭仍有其他成员”，禁止注销（需先转移管理员权限）

## 需要处理的数据库依赖（按风险优先）
- families.created_by 引用 auth.users：注销前必须置空（否则删 Auth 用户会触发外键错误）
- invitations.created_by 引用 public.users：注销前必须置空或将外键改为 on delete set null
- 私密记录若 owner_user_id 被置空会变成“不可见孤儿”（例如 private 的 recurring/balance_sheet_items），必须主动删除

## 数据清理范围（建议）
### 私密数据（必须删）
- transactions：owner_user_id = 当前用户 且 visibility = 'private'
- recurring_transactions：owner_user_id = 当前用户 且 visibility = 'private'
- balance_sheet_items：owner_user_id = 当前用户 且 visibility = 'private'

### 强归属个人数据（建议删）
- external_contacts：owner_user_id = 当前用户（含 interaction 级联）
- family_member_remarks：owner_user_id = 当前用户 或 member_user_id = 当前用户（表本身已级联）

### 以用户为主体的数据（建议删或解绑）
- health_profiles / health_metrics / insurance_policies：subject_user_id = 当前用户（表本身多为级联）
- growth_goals：subject_user_id = 当前用户 或 created_by_user_id = 当前用户（goal_key_results 级联）
- relationship_events：建议从 participant_user_ids 中移除当前用户；created_by_user_id = 当前用户的记录可保留（created_by 会 set null）

### 家庭共享数据（默认保留）
- categories / budgets / fund_accounts / allocation_rules / fund_allocations 等

## 审计事件（MVP 最小集合）
- invitation.created / invitation.revoked / invitation.accepted
- data.exported
- account.delete_requested / account.deleted

## 前后端调用链
1. 前端：调用 `/api/account/delete`（携带 Supabase access_token）
2. 服务端：
   - 验证 token → 得到 user.id
   - 调用数据库 RPC `delete_my_account(...)` 做业务清理 + 写审计
   - 调用 `auth.admin.deleteUser(user.id)` 删除 Auth 用户
3. 前端：收到成功后强制 signOut + 跳转登录页

