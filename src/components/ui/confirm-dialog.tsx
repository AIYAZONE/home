import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={props.onCancel}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card className="border border-border/60 bg-popover shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle>{props.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">{props.message}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={props.onCancel} className="w-full sm:w-auto">
                {props.cancelText ?? '取消'}
              </Button>
              <Button type="button" variant={props.tone === 'danger' ? 'danger' : 'primary'} onClick={props.onConfirm} className="w-full sm:w-auto">
                {props.confirmText ?? '确认'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

