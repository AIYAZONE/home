import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeMemberAccount, validateMemberAccount } from '@/lib/member';

export interface CreateMemberInput {
  name: string;
  account: string;
  role: 'child' | 'parent';
  password: string;
}

export interface CreateMemberResult {
  ok: boolean;
  userId: string;
  account: string;
  email: string;
}

async function createMember(input: CreateMemberInput): Promise<CreateMemberResult> {
  const account = normalizeMemberAccount(input.account);
  const accountError = validateMemberAccount(account);
  if (accountError) throw new Error(accountError);
  if (input.password.length < 6) throw new Error('密码至少 6 位。');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('未登录或登录已过期，请重新登录。');

  const res = await fetch('/api/members/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...input, account }),
  });
  const json = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new Error(json?.message || '创建成员失败，请稍后再试。');
  return json as CreateMemberResult;
}

export function useCreateMember(onSuccess?: (result: CreateMemberResult) => void) {
  return useMutation({
    mutationFn: createMember,
    onSuccess: (result) => onSuccess?.(result),
  });
}
