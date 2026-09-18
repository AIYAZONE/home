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

export interface HealthReportFile {
  id: string;
  family_id: string;
  subject_user_id: string;
  created_by_user_id: string | null;
  report_type: 'checkup' | 'lab' | 'prescription';
  source_type: 'pdf' | 'image';
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  checksum: string | null;
  captured_at: string | null;
  parse_status: 'pending' | 'parsed' | 'failed' | 'confirmed';
  parse_error: string | null;
  confidence_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface HealthReportItem {
  id: string;
  report_file_id: string;
  metric_code: string;
  metric_name: string;
  value_text: string | null;
  value_num: number | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  abnormal_flag: 'high' | 'low' | 'normal' | 'unknown';
  confidence: number | null;
  source_page: number | null;
  raw_line: string | null;
  created_at: string;
}

export interface HealthMetricRecord {
  id: string;
  family_id: string;
  subject_user_id: string;
  report_file_id: string | null;
  metric_code: string;
  metric_name: string;
  value_num: number;
  unit: string | null;
  recorded_at: string;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  abnormal_flag: 'high' | 'low' | 'normal' | 'unknown';
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthFollowup {
  id: string;
  family_id: string;
  subject_user_id: string;
  report_file_id: string | null;
  source_type: 'report_abnormal' | 'manual' | 'ai';
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'doing' | 'done' | 'dismissed';
  title: string;
  description: string | null;
  suggested_action: string | null;
  due_date: string | null;
  resolved_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthMedication {
  id: string;
  family_id: string;
  subject_user_id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  reminder_rule: Record<string, unknown>;
  status: 'active' | 'paused' | 'stopped';
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthRevisit {
  id: string;
  family_id: string;
  subject_user_id: string;
  related_report_file_id: string | null;
  department: string | null;
  hospital: string | null;
  revisit_reason: string | null;
  revisit_date: string;
  status: 'scheduled' | 'done' | 'cancelled' | 'missed';
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthCheckPlan {
  id: string;
  family_id: string;
  subject_user_id: string;
  plan_type: 'checkup' | 'lab' | 'vaccination' | 'other';
  title: string;
  cadence: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  next_due_date: string;
  last_completed_date: string | null;
  status: 'active' | 'paused' | 'completed';
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItem {
  id: string;
  family_id: string;
  owner_user_id: string | null;
  visibility: 'family' | 'private';
  module: 'finance' | 'health' | 'relationships' | 'growth' | 'settings';
  title: string;
  description: string | null;
  next_step: string | null;
  due_date: string | null;
  status: 'todo' | 'doing' | 'done' | 'dismissed';
  source: 'ai' | 'user';
  source_meta: Record<string, unknown>;
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


// ---- 膳食 / 「今天吃什么」 ----
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface MealDish {
  name: string;
  why: string;
}

export interface MealPlanData {
  breakfast: MealDish[];
  lunch: MealDish[];
  dinner: MealDish[];
  shopping_hint?: string;
  notes?: string;
}

export interface MealRemoved {
  meal: MealSlot;
  name: string;
  reason: string;
}

export interface MealRecommendResponse {
  plan: MealPlanData;
  removed: MealRemoved[];
  notes?: string;
}

export interface MealPreference {
  id: string;
  family_id: string;
  subject_user_id: string;
  disliked?: string | null;
  liked?: string | null;
  spicy_level?: 'none' | 'mil' | 'med' | 'hot' | null;
  notes?: string | null;
}
