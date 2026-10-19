'use client';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
        secondary: 'bg-elevated text-ink border border-line hover:bg-muted active:bg-sunken',
        ghost: 'text-ink-2 hover:bg-muted hover:text-ink',
        soft: 'bg-accent-soft text-accent-soft-ink hover:brightness-105',
        danger: 'bg-bad-soft text-bad-ink border border-transparent hover:brightness-105',
        link: 'text-accent underline-offset-4 hover:underline px-0',
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
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, kbd, children, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props}>
    {children}
    {kbd ? <kbd className="kbd ml-1 opacity-80" aria-hidden>{kbd}</kbd> : null}
  </button>
));
Button.displayName = 'Button';
