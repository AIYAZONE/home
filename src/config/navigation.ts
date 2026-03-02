import type { ComponentType } from 'react';
import { BarChart3, Bot, CircleUser, Heart, LayoutDashboard, Receipt, PiggyBank, Repeat, Settings, Tags, Target, TrendingUp, Users, Wallet } from 'lucide-react';

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
    icon: Wallet,
    children: [
      { name: '概览', href: '/finance', icon: LayoutDashboard },
      { name: '资产统计', href: '/finance/assets', icon: BarChart3 },
      { name: '交易记录', href: '/finance/transactions', icon: Receipt },
      { name: '预算管理', href: '/finance/budgets', icon: PiggyBank },
      { name: '分类管理', href: '/finance/categories', icon: Tags },
      { name: '固定支出', href: '/finance/recurring', icon: Repeat },
      { name: '3层基金', href: '/finance/funds', icon: TrendingUp },
    ],
  },
  {
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
  { name: '账户中心', href: '/settings/account', icon: CircleUser },
  {
    name: '家庭设置',
    icon: Settings,
    children: [
      { name: '概览', href: '/settings', icon: LayoutDashboard },
      { name: '成员管理', href: '/settings/members', icon: Users },
    ],
  },
];

export const mobileTabs: NavTab[] = [
  { name: '概览', href: '/dashboard', icon: LayoutDashboard },
  { name: '财务', href: '/finance', icon: Wallet },
  { name: 'AI', href: '/advisor', icon: Bot },
  { name: '设置', href: '/settings', icon: Settings },
];
