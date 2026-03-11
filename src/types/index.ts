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
  category_id?: string | null;
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

export interface FamilyMemberRemark {
  id: string;
  family_id: string;
  owner_user_id: string;
  member_user_id: string;
  remark_name: string | null;
  created_at: string;
  updated_at: string;
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
  category_id?: string | null;
  category_name: string;
  amount: number;
  source?: 'manual' | 'template' | 'inherited' | string;
  created_at: string;
  updated_at: string;
}

export interface BudgetTemplate {
  id: string;
  family_id: string;
  category_id: string | null;
  category_name: string;
  method: 'fixed';
  amount: number;
  start_month: string | null;
  end_month: string | null;
  priority: number;
  active: boolean;
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

export interface BalanceSheetItem {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  visibility: 'family' | 'private';
  kind: 'asset' | 'liability';
  category: string;
  name: string;
  amount: number;
  as_of_date: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GrowthGoal {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  subject_user_id: string | null;
  created_by_user_id: string | null;
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

export interface HealthProfile {
  id: string;
  family_id: string;
  subject_user_id: string;
  created_by_user_id: string | null;
  display_name: string | null;
  birth_date: string | null;
  height_cm: number | null;
  allergies: string | null;
  conditions: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthMetric {
  id: string;
  family_id: string;
  subject_user_id: string;
  metric_key: 'weight_kg' | 'sleep_hours' | 'steps';
  value: number;
  unit: string | null;
  recorded_at: string;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsurancePolicy {
  id: string;
  family_id: string;
  subject_user_id: string;
  kind: 'health' | 'life' | 'accident' | 'critical_illness' | 'dental' | 'other';
  provider: string | null;
  product_name: string | null;
  coverage_amount: number | null;
  premium_amount: number | null;
  premium_cadence: 'monthly' | 'yearly' | 'one_time' | null;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RelationshipEvent {
  id: string;
  family_id: string;
  title: string;
  occurred_at: string;
  participant_user_ids: string[];
  notes: string | null;
  action_items: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalContact {
  id: string;
  family_id: string;
  owner_user_id: string;
  visibility: 'family' | 'private';
  name: string;
  relation: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactInteraction {
  id: string;
  family_id: string;
  contact_id: string;
  interaction_date: string;
  summary: string | null;
  next_follow_up_date: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}
