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
