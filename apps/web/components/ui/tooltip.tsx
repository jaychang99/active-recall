'use client';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ content, children, side = 'bottom' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-xs text-ink shadow-card">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export function DropdownMenuContent({ className, ...props }: DropdownPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content sideOffset={6} align="end" className={cn('z-50 min-w-[200px] max-w-[calc(100vw-1rem)] rounded-md border border-line bg-elevated p-1 shadow-card rs-pop', className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: DropdownPrimitive.DropdownMenuItemProps) {
  return <DropdownPrimitive.Item className={cn('flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-muted', className)} {...props} />;
}
export function DropdownMenuLabel(props: DropdownPrimitive.DropdownMenuLabelProps) {
  return <DropdownPrimitive.Label className="px-2 py-1 text-[11px] font-medium text-ink-3" {...props} />;
}
export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;
}
