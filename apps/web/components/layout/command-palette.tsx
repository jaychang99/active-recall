'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Layers, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Deck, type SubjectSummary } from '@/lib/api';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NAV } from './shell';
import { cn } from '@/lib/utils';

interface Item { id: string; label: string; hint?: string; href: string; group: string }

export function CommandPalette({ open, onOpenChange, onNavigate }: { open: boolean; onOpenChange: (v: boolean) => void; onNavigate: (href: string) => void }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks'), enabled: open });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects'), enabled: open });

  const items = useMemo<Item[]>(() => {
    const out: Item[] = NAV.map((n) => ({ id: n.href, label: n.label, hint: n.key, href: n.href, group: '이동' }));
    out.push({ id: 'study-all', label: '모든 덱 학습 시작', hint: '오늘 due 전체', href: '/study/all', group: '학습' });
    out.push({ id: 'mistakes', label: '틀린 문제 다시 보기', hint: 'mistakes', href: '/study/all?mode=mistakes', group: '학습' });
    out.push({ id: 'flagged', label: '표시한 문제 학습', hint: 'flagged', href: '/study/all?mode=flagged', group: '학습' });
    for (const d of decks.data ?? []) {
      out.push({ id: `deck-${d.id}`, label: d.title, hint: `${d.subject} · due ${d.progress.dueToday}`, href: `/decks/${d.id}`, group: '덱' });
      out.push({ id: `study-${d.id}`, label: `학습: ${d.title}`, hint: `새 ${d.progress.new} · 복습 ${d.progress.review}`, href: `/study/${d.id}`, group: '학습' });
    }
    for (const s of subjects.data ?? []) out.push({ id: `subj-${s.id}`, label: `과목: ${s.name}`, hint: `${s.questionCount}문항`, href: `/study/all?subject=${encodeURIComponent(s.name)}&mode=cram`, group: '과목' });
    return out;
  }, [decks.data, subjects.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 14);
    return items.filter((i) => i.label.toLowerCase().includes(needle) || i.hint?.toLowerCase().includes(needle) || i.group.includes(needle)).slice(0, 14);
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);
  useEffect(() => setCursor(0), [q]);

  useShortcuts(
    'modal',
    [
      { keys: 'ArrowDown', allowInEditable: true, allowRepeat: true, handler: () => setCursor((c) => Math.min(filtered.length - 1, c + 1)) },
      { keys: 'ArrowUp', allowInEditable: true, allowRepeat: true, handler: () => setCursor((c) => Math.max(0, c - 1)) },
      { keys: 'Enter', allowInEditable: true, handler: () => { const it = filtered[cursor]; if (it) onNavigate(it.href); } },
      { keys: 'Escape', allowInEditable: true, handler: () => onOpenChange(false) },
    ],
    open,
    true,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="명령 팔레트" description="페이지·덱·학습 모드로 바로 이동" className="p-0 [&>div:first-child]:sr-only">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 text-ink-3" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="덱 이름, 페이지, 과목…" aria-label="명령 검색" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-3" />
          <kbd className="kbd">esc</kbd>
        </div>
        <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5" data-testid="palette-list">
          {filtered.length === 0 ? <li className="px-3 py-6 text-center text-sm text-ink-3">검색 결과가 없습니다</li> : null}
          {filtered.map((it, i) => (
            <li key={it.id} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => onNavigate(it.href)}
                className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm', i === cursor ? 'bg-muted' : '')}
              >
                <Layers className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint ? <span className="truncate text-[11px] text-ink-3">{it.hint}</span> : null}
                <span className="text-[11px] text-ink-3">{it.group}</span>
                <ArrowRight className={cn('h-3.5 w-3.5', i === cursor ? 'text-ink-2' : 'text-transparent')} />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
