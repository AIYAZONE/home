import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  onPasteFiles?: (files: File[]) => void;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', onPasteFiles, onPaste, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-11 w-full rounded-2xl border border-input bg-surface px-3 text-sm text-foreground shadow-elevated outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onPaste={(e) => {
        onPaste?.(e);
        if (!onPasteFiles) return;
        const files = Array.from(e.clipboardData?.files ?? []);
        if (files.length > 0) onPasteFiles(files);
      }}
      {...props}
    />
  );
});

Input.displayName = 'Input';
