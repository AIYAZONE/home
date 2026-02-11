import type { ComponentType } from 'react';
import { Bot, Heart, LayoutDashboard, Settings, TrendingUp, Users, Wallet } from 'lucide-react';

export type NavNode = {
  name: string;
  href?: string;
  icon?: ComponentType<{ className?: string }>;
  children?: NavNode[];
};

export type NavTab = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export const navigation: NavNode[] = [
  { name: '仪表板', href: '/dashboard', icon: LayoutDashboard },
  {
    name: '财务中心',
    href: '/finance',
    icon: Wallet,
    children: [
      { name: '记账/流水', href: '/finance/transactions' },
      { name: '预算', href: '/finance/budgets' },
      { name: '分类', href: '/finance/categories' },
      { name: '统计', href: '/finance/reports' },
    ],
  },
  { name: '成长规划', href: '/growth', icon: TrendingUp },
  { name: '健康中心', href: '/health', icon: Heart },
  { name: '关系管理', href: '/relationships', icon: Users },
  { name: 'AI顾问', href: '/advisor', icon: Bot },
  { name: '家庭设置', href: '/settings', icon: Settings },
];

export const mobileTabs: NavTab[] = [
  { name: '概览', href: '/dashboard', icon: LayoutDashboard },
  { name: '财务', href: '/finance', icon: Wallet },
  { name: 'AI', href: '/advisor', icon: Bot },
  { name: '设置', href: '/settings', icon: Settings },
];
