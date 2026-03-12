import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
};

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<null | ((value: boolean) => void)>(null);

  const openConfirm = useCallback((next: ConfirmOptions) => {
    if (resolverRef.current) resolverRef.current(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(value);
  }, []);

  const dialog = useMemo(() => {
    if (!options) return null;
    return createPortal(
      <ConfirmDialog
        open
        title={options.title}
        message={options.message}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        tone={options.tone}
        onCancel={() => close(false)}
        onConfirm={() => close(true)}
      />,
      document.body,
    );
  }, [close, options]);

  return { openConfirm, confirm: openConfirm, dialog };
}
