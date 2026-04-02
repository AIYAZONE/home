type SupabaseAuthGetUserResult = {
  data: { user: any | null };
  error: any;
};

type SupabaseAuthDeleteUserResult = {
  data?: any;
  error: any;
};

export async function authGetUser(client: any, token: string): Promise<SupabaseAuthGetUserResult> {
  const auth = client?.auth as any;
  if (auth && typeof auth.getUser === 'function') {
    return await auth.getUser(token);
  }
  if (auth?.api && typeof auth.api.getUser === 'function') {
    return await auth.api.getUser(token);
  }
  throw new Error('认证能力不可用');
}

export async function authAdminDeleteUser(client: any, userId: string): Promise<SupabaseAuthDeleteUserResult> {
  const auth = client?.auth as any;
  if (auth?.admin && typeof auth.admin.deleteUser === 'function') {
    return await auth.admin.deleteUser(userId);
  }
  if (auth?.api && typeof auth.api.deleteUser === 'function') {
    return await auth.api.deleteUser(userId);
  }
  throw new Error('认证管理能力不可用');
}
