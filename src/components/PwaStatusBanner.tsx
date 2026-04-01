import { Button } from '@/components/ui/button';
import { usePwaStore } from '@/stores/pwa';
import { useToastStore } from '@/stores/toast';
import { useState } from 'react';

export default function PwaStatusBanner() {
  const needRefresh = usePwaStore((s) => s.needRefresh);
  const offlineReady = usePwaStore((s) => s.offlineReady);
  const updateSW = usePwaStore((s) => s.updateSW);
  const setNeedRefresh = usePwaStore((s) => s.setNeedRefresh);
  const setOfflineReady = usePwaStore((s) => s.setOfflineReady);
  const pushToast = useToastStore((s) => s.push);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-lg rounded-2xl border border-border bg-card/80 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/60">
      {needRefresh ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">新版本可用</div>
            <div className="text-sm text-muted-foreground">刷新即可更新到最新版本</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setNeedRefresh(false);
              }}
            >
              稍后
            </Button>
            <Button
              size="sm"
              disabled={isUpdating}
              onClick={async () => {
                if (isUpdating) return;
                setIsUpdating(true);
                try {
                  if (updateSW) {
                    await updateSW(true);
                    return;
                  }
                  window.location.reload();
                } catch {
                  setIsUpdating(false);
                  pushToast({ variant: 'danger', title: '更新失败', message: '刷新失败，请稍后再试。' });
                  setNeedRefresh(true);
                }
              }}
            >
              {isUpdating ? '刷新中…' : '刷新'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">已可离线使用</div>
            <div className="text-sm text-muted-foreground">核心资源已缓存，断网也能打开</div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setOfflineReady(false);
            }}
          >
            知道了
          </Button>
        </div>
      )}
    </div>
  );
}
