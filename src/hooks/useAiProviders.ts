import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError, providersApi, type ProviderDefaults, type ProviderDraft } from '@/lib/aiProviders';

export function useAiProviders() {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const query = useQuery({
    // queryKey 带 userId：登录切换后不串读上一位用户的清单/默认
    queryKey: ['ai-providers', userId],
    queryFn: () => providersApi.list(),
    enabled: Boolean(userId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ai-providers', userId] });
  // 行集变化会使发现区「可复用密钥」比对与已启用状态过期（spec §5.2）；仅 create/remove 挂，
  // 读类 mutation（test/setDefault…）不动行集，避免无谓重拉 4.7MB 目录
  const invalidateWithDiscover = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ['ai-providers-discover', userId] });
  };
  const create = useMutation({ mutationFn: (draft: ProviderDraft) => providersApi.create(draft), onSuccess: invalidateWithDiscover });
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<ProviderDraft> }) => providersApi.update(id, patch), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => providersApi.remove(id), onSuccess: invalidateWithDiscover });
  const reorder = useMutation({ mutationFn: (ids: string[]) => providersApi.reorder(ids), onSuccess: invalidate });
  const test = useMutation({ mutationFn: (id: string) => providersApi.test(id), onSuccess: invalidate });
  const setDefault = useMutation({
    mutationFn: ({ capability, providerId }: { capability: 'text' | 'vision'; providerId: string }) =>
      providersApi.setDefault(capability, providerId),
    onSuccess: invalidate,
  });

  const data = query.data;
  return {
    providers: data?.providers ?? [],
    defaults: (data?.defaults ?? { text: null, vision: null }) as ProviderDefaults,
    canManageShared: data?.canManageShared ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    create,
    update,
    remove,
    reorder,
    test,
    setDefault,
    isMutating: create.isPending || update.isPending || remove.isPending || reorder.isPending || test.isPending || setDefault.isPending,
  };
}

export type { PublicProvider, ProviderDraft } from '@/lib/aiProviders';
