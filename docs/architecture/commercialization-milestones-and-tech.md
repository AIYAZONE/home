# 商业化里程碑与技术落地点（隐私优先）

目标：你现在自用也能顺畅迭代；未来商业化时不需要“推倒重来”，而是按清单补齐即可。

本文不是法律意见，商业化上线前建议律师与安全顾问审阅。

## 1. 里程碑拆解（从自用到收费）

### M0：自用 / 内测（现在）
**产品侧**
- 默认最少数据：备注选填、敏感提示
- 隐私可见范围：至少支持“家庭可见 / 仅自己”
- 基础权限：角色存在且可控（admin/parent/child）

**技术侧**
- 数据分级与数据流明确：见 docs/privacy/data-map.md
- RLS 全表启用（你当前已做），并且策略能表达“可见范围”
- 关键 RPC 使用 security definer 且固定 search_path

### M1：小规模封闭测试（邀请制）
**产品侧**
- 账号注销/数据删除策略明确（哪部分删、保留期）
- 数据导出（至少交易导出）
- 邀请安全：撤销、过期、可选 email 绑定

**技术侧**
- 审计事件（最小）：邀请创建/撤销/接受、导出、删除
- 反滥用：邀请/导出/登录基础速率限制
- 备份与恢复策略（数据丢失也是高风险事件）

### M2：公开发布（可增长）
**产品侧**
- 隐私政策/条款对用户可见并可访问（注册/设置页）
- 明确第三方处理清单（若接入分析、OCR、导入）
- 未成年人路径与默认保护（如果开放 child）

**技术侧**
- 安全监控与告警（最小可观测性）
- 数据保留期可配置化（尤其邀请、审计日志）
- 自动化测试覆盖核心隐私路径（private 交易不可被他人读取）

### M3：付费与规模化
- DPA/供应商安全评估（分析/OCR/邮件/客服）
- 周期性渗透测试与整改闭环
- DPIA/风险评估与内部制度化（视地区与规模）

## 2. 当前代码库的“技术落地点地图”

### 2.1 数据分级与权限设计（文档）
- Data Map：docs/privacy/data-map.md
- 权限矩阵与隐私开关：docs/privacy/permissions-and-privacy-controls.md

### 2.2 合规文档骨架（草案）
- 隐私政策：docs/legal/privacy-policy-draft.md
- 服务条款：docs/legal/terms-of-service-draft.md
- 未成年人政策：docs/legal/minors-policy-draft.md
- 合规清单：docs/legal/compliance-checklist.md

### 2.3 数据库与 RLS（Supabase）
**现状**
- family 隔离：public.users.family_id + RLS（is_family_member）
- 邀请加入：get_invitation_info/accept_invitation

**新增（本轮已做）**
- 交易可见性与归属：
  - migrations：supabase/migrations/20260210000000_transactions_visibility.sql
  - RLS：supabase/migrations/20260210000001_transactions_rls_visibility.sql

### 2.4 前端产品能力
- 财务记账：src/pages/finance/Overview.tsx
  - 已支持“家庭可见/仅自己”
  - 列表对私密交易展示标记

## 3. 下一轮建议（最小可卖的隐私闭环）

### 3.1 产品能力
- 数据导出（交易 CSV）
- 账号注销与数据删除（个人/家庭）
- 家庭邀请的管理权限（建议仅 admin/parent 可创建/撤销）

### 3.2 技术能力
- invitations RLS 收紧到 admin/parent（避免 child 滥用邀请）
- 审计表（audit_logs）+ 最小事件写入
- 导出接口与速率限制
