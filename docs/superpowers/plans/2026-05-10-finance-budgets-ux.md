# Finance Budgets UX Implementation Plan

> **For agentic workers:** REQUIRED: Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/finance/budgets` 重构为“配置｜复盘｜模板”三 Tab，默认聚焦当月预算配置；补齐改为手动触发；模板应用增加预览确认且默认仅新增缺失。

**Architecture:** 页面结构重排为 Tab 分区；数据层将“自动补齐”从查询副作用剥离为显式 mutation；新增一个轻量预览弹窗组件完成模板应用确认。

**Tech Stack:** React + TypeScript + React Router + @tanstack/react-query + Supabase + Tailwind UI components

---

## File Map（将修改/新增哪些文件）

**Modify**
- [Budgets.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Budgets.tsx)：拆分为 3 Tab（配置/复盘/模板），迁移区块，接入模板预览弹窗
- [useBudgets.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgets.ts)：移除 queryFn 内自动 ensure；增加 applyTemplatesToMonth（支持 ignoreDuplicates）等写入能力
- [useBudgetTemplates.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgetTemplates.ts)：增加“本月保存为模板”的统一 action（可选，但推荐收敛写入路径）
- [BudgetGuideCard.tsx](file:///Users/brucewang/Documents/AIYA/home/src/components/finance/BudgetGuideCard.tsx)：去除重复 KPI（执行率/覆盖率）或改为更紧凑的“未预算提示卡”（按需要）

**Create**
- `src/components/finance/ApplyTemplatesPreviewModal.tsx`：模板应用预览/确认弹窗（目标月份、将新增/覆盖清单、覆盖开关）

---

### Task 1: 数据层去副作用（手动补齐）

**Files:**
- Modify: [useBudgets.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgets.ts)

- [ ] Step 1: 移除 budgets 查询 queryFn 内对 `ensure_month_budgets` 的调用
- [ ] Step 2: 保留 `ensureMonthBudgets` mutation，作为显式按钮触发
- [ ] Step 3: 确保 queryKey/invalidations 不变，避免缓存错乱
- [ ] Step 4: 运行类型检查
  - Run: `pnpm check`
  - Expected: PASS

---

### Task 2: 模板应用写入能力（默认仅新增缺失）

**Files:**
- Modify: [useBudgets.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgets.ts)

- [ ] Step 1: 增加一个批量 upsert 方法（模板应用）
  - 输入：monthStartKey、templates、overwrite(boolean)
  - 行为：
    - 构造 budgets rows（source='template'）
    - `upsert(..., { onConflict: 'family_id,month_start,category_name', ignoreDuplicates: !overwrite })`
- [ ] Step 2: mutation 成功后 invalidation `['budgets', monthStartKey]`（按当前实现）
- [ ] Step 3: 运行类型检查
  - Run: `pnpm check`
  - Expected: PASS

---

### Task 3: 新增“模板应用预览/确认”弹窗组件

**Files:**
- Create: `src/components/finance/ApplyTemplatesPreviewModal.tsx`

- [ ] Step 1: 复用现有 portal + Card 的弹窗样式（与 BudgetEditorModal 一致）
- [ ] Step 2: Props 设计（建议）
  - `open: boolean`
  - `monthLabel: string`
  - `adds: Array<{ category_name: string; amount: number }>`
  - `overwrites: Array<{ category_name: string; amount: number; existingAmount: number }>`
  - `defaultOverwrite: boolean`（默认 false）
  - `onConfirm: (overwrite: boolean) => void`
  - `onClose: () => void`
- [ ] Step 3: UI 行为
  - 展示目标月份与摘要（新增 X / 覆盖 Y）
  - 覆盖开关（默认关闭）
  - 确认/取消按钮
- [ ] Step 4: 运行 `pnpm check`

---

### Task 4: 页面重构为 3 Tab（配置/复盘/模板）

**Files:**
- Modify: [Budgets.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Budgets.tsx)
- Modify (optional): [BudgetGuideCard.tsx](file:///Users/brucewang/Documents/AIYA/home/src/components/finance/BudgetGuideCard.tsx)
- Create: `src/components/finance/ApplyTemplatesPreviewModal.tsx`

- [ ] Step 1: 增加 `tab` state（'config' | 'review' | 'templates'），默认 'config'
- [ ] Step 2: 配置 Tab
  - 顶部：月份切换 + 补齐本月（显式）+ 新增预算
  - KPI：预算合计/已花费/未预算支出（当月口径）
  - 未预算提示：展示 Top 分类按钮，点击打开新增预算弹窗（带建议值）
  - 本月预算列表（编辑/删除）
- [ ] Step 3: 复盘 Tab
  - 移动现有 summaryMode（月/季/年）与 summaryMetrics 到这里
  - 保证只读：不出现新增/编辑/删除/补齐/模板应用
  - 提供 CTA：返回配置 Tab
- [ ] Step 4: 模板 Tab
  - 移动“本月保存为模板”+ 新增模板表单 + 模板列表到此处
  - 模板“用到本月”改为打开预览弹窗（不直接写）
- [ ] Step 5: 清理旧文案/空态（移除“右侧按钮开始”等不再成立的提示）

---

### Task 5: 统一“本月保存为模板”写入路径（推荐）

**Files:**
- Modify: [useBudgetTemplates.ts](file:///Users/brucewang/Documents/AIYA/home/src/hooks/useBudgetTemplates.ts)
- Modify: [Budgets.tsx](file:///Users/brucewang/Documents/AIYA/home/src/pages/finance/Budgets.tsx)

- [ ] Step 1: 在 `useBudgetTemplates` 新增 `saveMonthAsTemplatesAsync({ familyId, budgets })`（内部批量 upsert + toast + invalidate）
- [ ] Step 2: Budgets 页面改为调用该 hook 方法，删除页面内直连 supabase 的 mutation

---

## Verification（必须跑）
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] 手工验证（浏览器）
  - 默认进入“配置”Tab
  - “补齐本月”不自动触发，只有点击才触发
  - 模板“用到本月”出现预览弹窗，确认后才生效；默认不覆盖已有
  - 复盘 Tab 无写入入口

---

## Notes
- 本计划不自动执行 git commit；如需要提交记录，我会在你明确要求后再执行。

