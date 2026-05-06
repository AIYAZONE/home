import type { ComponentType } from 'react';
import { BarChart3, Bot, Download, Heart, LayoutDashboard, Receipt, PiggyBank, Repeat, Settings, Tags, Target, TrendingUp, UserPlus, Users, Wallet, CircleUser, Shield } from 'lucide-react';

export type NavLinkNode = {
  kind?: 'link';
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavGroupNode = {
  kind: 'group';
  name: string;
  icon: ComponentType<{ className?: string }>;
  children: NavNode[];
};

export type NavHeadingNode = {
  kind: 'heading';
  name: string;
};

export type NavNode = NavLinkNode | NavGroupNode | NavHeadingNode;

export type NavTab = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export const navigation: NavNode[] = [
  { name: '仪表板', href: '/dashboard', icon: LayoutDashboard },
  {
    kind: 'group',
    name: '财务中心',
    icon: Wallet,
    children: [
      { kind: 'heading', name: '常用' },
      { name: '概览', href: '/finance', icon: LayoutDashboard },
      { name: '交易记录', href: '/finance/transactions', icon: Receipt },
      { name: '资产统计', href: '/finance/assets', icon: BarChart3 },
      { kind: 'heading', name: '策略' },
      { name: '预算管理', href: '/finance/budgets', icon: PiggyBank },
      { name: '固定支出', href: '/finance/recurring', icon: Repeat },
      { kind: 'heading', name: '配置' },
      { name: '分类管理', href: '/finance/categories', icon: Tags },
      { kind: 'heading', name: '进阶' },
      { name: '3层基金', href: '/finance/funds', icon: TrendingUp },
    ],
  },
  {
    kind: 'group',
    name: '成长规划',
    icon: TrendingUp,
    children: [
      { name: '概览', href: '/growth', icon: LayoutDashboard },
      { name: '目标列表', href: '/growth/goals', icon: Target },
    ],
  },
  { name: '健康中心', href: '/health', icon: Heart },
  { name: '关系管理', href: '/relationships', icon: Users },
  { name: 'AI顾问', href: '/advisor', icon: Bot },
  {
    kind: 'group',
    name: '设置中心',
    icon: Settings,
    children: [
      { kind: 'heading', name: '常用' },
      { name: '概览', href: '/settings', icon: LayoutDashboard },
      { name: '账户中心', href: '/settings/account', icon: CircleUser },
      { kind: 'heading', name: '家庭' },
      { name: '成员管理', href: '/settings/members', icon: Users },
      { name: '邀请管理', href: '/settings/invitations', icon: UserPlus },
      { name: '数据管理', href: '/settings/data', icon: Download },
      { name: '信任中心', href: '/settings/trust', icon: Shield },
    ],
  },
];

export const mobileTabs: NavTab[] = [
  { name: '概览', href: '/dashboard', icon: LayoutDashboard },
  { name: '财务', href: '/finance', icon: Wallet },
  { name: 'AI', href: '/advisor', icon: Bot },
  { name: '设置', href: '/settings', icon: Settings },
];

export type AppModule = {
  id: string;
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  node: Extract<NavNode, { icon: ComponentType<{ className?: string }> }>;
};

export type ModuleQuickAction = {
  id: string;
  name: string;
  description?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  action?: string;
};

function getOverviewHrefFromGroup(group: NavGroupNode): string {
  const overview = group.children.find((child): child is NavLinkNode => 'href' in child && child.name === '概览');
  const first = group.children.find((child): child is NavLinkNode => 'href' in child);
  return overview?.href ?? first?.href ?? '/dashboard';
}

export function getAppModules(items: NavNode[] = navigation): AppModule[] {
  return items
    .filter((item): item is Extract<NavNode, { icon: ComponentType<{ className?: string }> }> => item.kind !== 'heading')
    .map((item) => {
      const href = item.kind === 'group' ? getOverviewHrefFromGroup(item) : item.href;
      return { id: href, name: item.name, href, icon: item.icon, node: item };
    });
}

export function flattenNavLinks(items: NavNode[] = navigation): NavLinkNode[] {
  const result: NavLinkNode[] = [];
  for (const item of items) {
    if (item.kind === 'heading') continue;
    if ('href' in item) {
      result.push(item);
      continue;
    }
    for (const child of item.children) {
      if (child.kind === 'heading') continue;
      if ('href' in child) result.push(child);
    }
  }
  return result;
}

export const moduleQuickActions: Record<string, ModuleQuickAction[]> = {
  '/dashboard': [
    { id: 'dashboard.invite', name: '邀请成员', description: '快速邀请家人加入', href: '/settings/invitations', icon: UserPlus, action: 'generate' },
    { id: 'dashboard.quick-book', name: '快速记账', description: '记一笔收入/支出', href: '/finance', icon: Receipt, action: 'add' },
  ],
  '/finance': [
    { id: 'finance.add', name: '记一笔', description: '快速记录收入/支出', href: '/finance', icon: Receipt, action: 'add' },
    { id: 'finance.import', name: '导入账单', description: '上传 CSV 或粘贴截图批量入账', href: '/finance/transactions', icon: Download, action: 'import' },
    { id: 'finance.transactions', name: '交易记录', description: '查看与筛选交易', href: '/finance/transactions', icon: Receipt },
    { id: 'finance.budgets', name: '预算管理', description: '设置预算与模板', href: '/finance/budgets', icon: PiggyBank },
    { id: 'finance.recurring', name: '固定支出', description: '周期性账单管理', href: '/finance/recurring', icon: Repeat },
  ],
  '/growth': [
    { id: 'growth.add-goal', name: '创建目标', description: '新增一个成长目标', href: '/growth/goals', icon: Target, action: 'add' },
    { id: 'growth.goals', name: '目标列表', description: '查看进行中与已完成', href: '/growth/goals', icon: Target },
  ],
  '/health': [
    { id: 'health.overview', name: '查看概览', description: '健康中心概览', href: '/health', icon: Heart },
    { id: 'health.import-report', name: '导入报告', description: '上传体检报告并自动识别', href: '/health?action=import', icon: Download, action: 'import' },
  ],
  '/relationships': [
    { id: 'relationships.overview', name: '查看概览', description: '关系管理概览', href: '/relationships', icon: Users },
  ],
  '/advisor': [
    { id: 'advisor.workspace', name: '打开工作台', description: '进入 AI 工作台', href: '/advisor', icon: Bot },
  ],
  '/settings': [
    { id: 'settings.account', name: '账户中心', description: '个人账号与安全', href: '/settings/account', icon: CircleUser },
    { id: 'settings.members', name: '成员管理', description: '管理家庭成员与权限', href: '/settings/members', icon: Users },
    { id: 'settings.invite', name: '邀请管理', description: '生成邀请链接', href: '/settings/invitations', icon: UserPlus, action: 'generate' },
  ],
};
