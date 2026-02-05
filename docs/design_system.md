# Family Inc. OS UI 设计系统（Tailwind + CSS Variables）

## 设计目标
- 高端、克制、可读性强
- 组件一致性强：同样的卡片/按钮/输入框在所有页面表现一致
- 移动端优先：从 320px 起无横向滚动，交互热区≥44px

## 设计 Token（落地方式）
### 色彩
- 使用 `src/index.css` 内的 CSS Variables 作为唯一真相：
  - `--background/--foreground`
  - `--card/--card-foreground`
  - `--primary/--primary-foreground`
  - `--muted/--muted-foreground`
  - `--border/--input/--ring`
- Tailwind 通过 `tailwind.config.js` 映射为 `bg-background`、`text-foreground` 等

### 圆角与阴影
- 卡片：`rounded-xl` + `shadow-sm`
- 输入框：`rounded-lg` + `shadow-sm`
- 主按钮：`rounded-lg`，hover/active 使用轻微亮度变化（避免缩放导致布局抖动）

### 动效
- 过渡：`transition-colors` 为主，150–250ms
- Loading：Skeleton（pulse）+ 局部 spinner
- 尊重 `prefers-reduced-motion`

## 组件库（基础 UI）
位置：`src/components/ui/*`

- Button：`button.tsx`
  - variants：primary/secondary/ghost/danger
  - sizes：sm/md/lg
- Input：`input.tsx`
- Card：`card.tsx`（Card/CardHeader/CardTitle/CardDescription/CardContent）
- Badge：`badge.tsx`
- Alert：`alert.tsx`
- Skeleton：`skeleton.tsx`

## 结构组件（布局与页面）
位置：`src/components/layout/*`（后续落地）
- AppShell：桌面侧边栏 + 顶栏；移动底部 Tab
- Page / PageHeader：统一标题区、描述、CTA 区域

## 页面模式（Patterns）
- 表单页：标题区 + 卡片表单 + 阻断性错误（Alert）+ 成功反馈（Toast）
- 列表页：顶部筛选/搜索 + 列表行（44px+）+ EmptyState + Skeleton
- 仪表板：StatCard 栅格 + 趋势图 + 最近活动

