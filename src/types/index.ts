export interface Transaction {
  id: string;
  family_id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  created_at: string;
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
