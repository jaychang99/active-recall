'use client';
import { useActiveBindings } from '@/lib/shortcuts/provider';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const KEY_LABEL: Record<string, string> = { ' ': 'Space', Escape: 'Esc', Enter: 'Enter', ArrowDown: '↓', ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→' };

export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const bindings = useActiveBindings();
  const groups = new Map<string, { keys: string; description: string }[]>();
  for (const { binding } of bindings) {
    if (!binding.description) continue;
    const g = binding.group ?? '기타';
    const keys = (Array.isArray(binding.keys) ? binding.keys : [binding.keys]).map((k) => KEY_LABEL[k] ?? k.toUpperCase()).join(' / ');
    const mod = binding.mod === 'ctrlOrMeta' ? '⌘/Ctrl + ' : binding.mod === 'shift' ? 'Shift + ' : binding.mod === 'alt' ? 'Alt + ' : '';
    const list = groups.get(g) ?? [];
    if (!list.some((x) => x.description === binding.description)) list.push({ keys: mod + keys, description: binding.description });
    groups.set(g, list);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="키보드 단축키" description="현재 화면에서 사용할 수 있는 단축키입니다. 입력창·한글 조합 중에는 동작하지 않습니다." wide>
        <div className="grid gap-5 sm:grid-cols-2">
          {[...groups.entries()].map(([g, list]) => (
            <section key={g}>
              <h3 className="mb-2 text-[13px] font-semibold text-ink-2">{g}</h3>
              <ul className="space-y-1.5">
                {list.map((b) => (
                  <li key={b.description} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-2">{b.description}</span>
                    <kbd className="kbd whitespace-nowrap">{b.keys}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
