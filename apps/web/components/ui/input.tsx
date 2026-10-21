import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn('h-9 min-w-0 w-full rounded-md border border-line bg-elevated px-3 text-sm text-ink placeholder:text-ink-3 focus-visible:border-accent disabled:opacity-60', className)}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn('min-w-0 w-full rounded-md border border-line bg-elevated px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:border-accent disabled:opacity-60 leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-ink-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('h-9 min-w-0 max-w-full rounded-md border border-line bg-elevated px-2.5 text-sm text-ink focus-visible:border-accent', className)} {...props}>
      {children}
    </select>
  );
}
