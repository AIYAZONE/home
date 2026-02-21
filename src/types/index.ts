export interface Transaction {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  visibility: 'family' | 'private';
  amount: number;
  category: string;
  description: string | null;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  created_at: string;
}

export interface RecurringTransaction {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  visibility: 'family' | 'private';
  amount: number;
  category: string;
  description: string | null;
  type: 'income' | 'expense';
  cadence: 'weekly' | 'monthly';
  next_run_date: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  name: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  family_id: string | null;
  role: 'admin' | 'parent' | 'child';
  name: string | null;
  email: string | null;
}

export interface Category {
  id: string;
  family_id: string;
  name: string;
  kind: 'income' | 'expense' | 'both';
  created_at: string;
}

export interface Budget {
  id: string;
  family_id: string;
  month_start: string;
  category_name: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface FundAccount {
  id: string;
  family_id: string;
  name: string;
  kind: 'safety' | 'goal' | 'dream';
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  description: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FundAllocation {
  id: string;
  family_id: string;
  fund_account_id: string;
  transaction_id: string | null;
  amount: number;
  kind: 'deposit' | 'withdrawal' | 'adjustment';
  note: string | null;
  created_at: string;
}

export interface AllocationRule {
  id: string;
  family_id: string;
  fund_account_id: string;
  percentage: number;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GrowthGoal {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  title: string;
  description: string | null;
  category: 'education' | 'career' | 'skill' | 'health' | 'finance' | 'other';
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  priority: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrowthKeyResult {
  id: string;
  goal_id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  created_at: string;
  updated_at: string;
}
