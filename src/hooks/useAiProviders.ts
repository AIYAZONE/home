import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, providersApi, type ProviderDraft, type PublicProvider } from '@/lib/aiProviders';

export function useAiProviders() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => providersApi.list().then((r) => r.providers),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 2,
    // 平台管理员门控常驻于 app-shell：降噪，避免每次窗口聚焦/重连都打一次 list（非管理员必 403）
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const isAdmin = !query.isError || !(query.error instanceof ApiError && query.error.status === 403);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ai-providers'] });
  const create = useMutation({ mutationFn: (draft: ProviderDraft) => providersApi.create(draft), onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<ProviderDraft> }) => providersApi.update(id, patch), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => providersApi.remove(id), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: string[]) => providersApi.reorder(ids), onSuccess: invalidate });
  const test = useMutation({ mutationFn: (id: string) => providersApi.test(id), onSuccess: invalidate });

  return {
    providers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isAdmin,
    refetch: query.refetch,
    create,
    update,
    remove,
    reorder,
    test,
    isMutating: create.isPending || update.isPending || remove.isPending || reorder.isPending || test.isPending,
  };
}

export type { PublicProvider, ProviderDraft };
