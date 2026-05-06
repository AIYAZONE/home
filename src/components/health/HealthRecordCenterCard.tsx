import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHealthReportFiles } from '@/hooks/useHealthReportFiles';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { useConfirm } from '@/hooks/useConfirm';

export function HealthRecordCenterCard(props: { subjectUserId: string | null }) {
  const { files, isLoading, getPreviewUrlAsync, renameReportFileAsync, deleteReportFileAsync, isRenaming, isDeleting } = useHealthReportFiles(props.subjectUserId);
  const pushToast = useToastStore((s) => s.push);
  const { openConfirm, dialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>就医资料中心</CardTitle>
        <CardDescription>统一归档体检/化验/处方报告，便于检索追溯。</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (files?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无报告文件</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {(files ?? []).slice(0, 10).map((f) => (
              <div key={f.id} className="px-4 py-3">
                <div className="text-sm font-medium">{f.file_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {f.report_type} · {f.parse_status} · {f.created_at.slice(0, 10)}
                </div>
                {editingId === f.id ? (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="输入新文件名"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={isRenaming}
                        onClick={async () => {
                          const trimmed = editingName.trim();
                          if (!trimmed || trimmed === f.file_name) {
                            setEditingId(null);
                            return;
                          }
                          try {
                            await renameReportFileAsync({ id: f.id, file_name: trimmed });
                            setEditingId(null);
                          } catch (err: any) {
                            pushToast({ variant: 'danger', title: '重命名失败', message: toUserMessage(err) });
                          }
                        }}
                      >
                        保存
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isRenaming}
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          const url = await getPreviewUrlAsync({ filePath: f.file_path, expiresIn: 300 });
                          window.open(url, '_blank', 'noopener,noreferrer');
                        } catch (err: any) {
                          pushToast({ variant: 'danger', title: '打开失败', message: toUserMessage(err) });
                        }
                      }}
                    >
                      查看
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isRenaming || isDeleting}
                      onClick={() => {
                        setEditingId(f.id);
                        setEditingName(f.file_name);
                      }}
                    >
                      重命名
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isDeleting}
                      onClick={async () => {
                        const ok = await openConfirm({
                          title: '确认删除报告',
                          message: '删除后将无法恢复，同时会删除云端原文件。是否继续？',
                          confirmText: '删除',
                          tone: 'danger',
                        });
                        if (!ok) return;
                        await deleteReportFileAsync({ id: f.id, filePath: f.file_path });
                      }}
                    >
                      删除
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {dialog}
    </Card>
  );
}
