import { useQuery } from '@tanstack/react-query';
import { providersApi } from '@/lib/aiProviders';
import { useAuth } from '@/contexts/AuthContext';

/** 免费模型发现：折叠区首次展开（enabled=true）才请求；queryKey 带 userId 防串户 */
export function useDiscoverFreeModels(enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['ai-providers-discover', userId],
    queryFn: () => providersApi.discover(),
    enabled: Boolean(userId) && enabled,
    // 5min：后端目录缓存 60s（discover.ts DISCOVER_TTL_MS）之上的前端节流层，
    // 发现区是低频浏览场景，不必每次展开都打接口
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
