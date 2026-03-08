import { cn } from '@/lib/utils';

export function ListRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      {...props}
    />
  );
}

export function ListRowLeading({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-w-0 items-center gap-3', className)} {...props} />;
}

export function ListRowTrailing({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3', className)} {...props} />
  );
}

