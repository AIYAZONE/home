import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-colors transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-elevated hover:shadow-glow hover:brightness-95 active:brightness-90',
  secondary:
    'border border-border bg-surface-2 text-secondary-foreground shadow-elevated hover:bg-surface-3 hover:shadow-glow active:bg-surface-3',
  ghost: 'bg-transparent text-foreground hover:bg-surface-2 active:bg-surface-3',
  danger: 'bg-destructive text-destructive-foreground shadow-elevated hover:shadow-glow hover:brightness-95 active:brightness-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
