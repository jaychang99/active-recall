'use client';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './loading';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 disabled:bg-line-strong disabled:text-ink',
        secondary: 'bg-elevated text-ink border border-line hover:bg-muted active:bg-sunken disabled:bg-sunken disabled:text-ink-3 disabled:border-line',
        ghost: 'text-ink-2 hover:bg-muted hover:text-ink disabled:text-ink-3',
        soft: 'bg-accent-soft text-accent-soft-ink hover:brightness-105 disabled:bg-muted disabled:text-ink-3',
        danger: 'bg-bad-soft text-bad-ink border border-transparent hover:brightness-105 disabled:bg-muted disabled:text-ink-3',
        link: 'text-accent underline-offset-4 hover:underline px-0 disabled:text-ink-3',
      },
      size: {
        sm: 'h-8 px-2.5 text-[13px]',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-9 w-9',
        iconSm: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Small keyboard hint rendered at the right. */
  kbd?: string;
  loading?: boolean;
  loadingLabel?: string;
  /** Real measured percentage, when available. Otherwise the busy bar is indeterminate. */
  progress?: number;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, kbd, children, type = 'button', loading = false, loadingLabel, progress, disabled, ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), loading && 'relative overflow-hidden', className)} {...props} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? <Spinner /> : null}
    <span className={cn('inline-flex min-w-0 items-center justify-center gap-1.5', loading && '[&>svg]:hidden', loading && (size === 'icon' || size === 'iconSm') && 'sr-only')}>{loading && loadingLabel ? loadingLabel : children}</span>
    {kbd && !loading ? <kbd className="kbd ml-1 opacity-80" aria-hidden>{kbd}</kbd> : null}
    {loading && size !== 'icon' && size !== 'iconSm' ? <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-current/15"><span className={cn('block h-full bg-current/60', progress === undefined ? 'rs-progress-indeterminate w-1/3' : '')} style={progress === undefined ? undefined : { width: `${Math.max(0, Math.min(100, progress))}%` }} /></span> : null}
  </button>
));
Button.displayName = 'Button';
