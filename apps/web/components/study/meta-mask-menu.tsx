'use client';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { api, type Settings } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import { useSettings } from '@/components/layout/settings-context';
import { META_KEYS, META_LABEL, META_SETTING, allPatch, hiddenCount, isAllHidden, maskFromSettings, toggleAllPatch, togglePatch, type MetaKey, type MetaMask } from '@/components/questions/meta-mask';

type MaskPatch = Partial<Pick<Settings, 'hideDifficulty' | 'hideTags' | 'hideSubject' | 'hideSource' | 'revealMetaOnAnswer'>>;

/**
 * The study-time metadata mask, read from (and written straight back to) the user's global settings.
 * Writes are optimistic so a toggle during a card feels instant; a failed save rolls back and toasts.
 */
export function useMetaMask() {
  const qc = useQueryClient();
  const { settings } = useSettings();
  const mask = useMemo(() => maskFromSettings(settings), [settings]);
  const save = useMutation({
    mutationFn: (patch: MaskPatch) => api<Settings>('/settings', { method: 'PATCH', json: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['settings'] });
      const prev = qc.getQueryData<Settings>(['settings']);
      qc.setQueryData<Settings>(['settings'], (s) => (s ? { ...s, ...patch } : s));
      return { prev };
    },
    onError: (e: Error, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(['settings'], ctx.prev);
      toast.error('가리기 설정을 저장하지 못했습니다', { description: e.message });
    },
    onSuccess: (s) => qc.setQueryData(['settings'], s),
  });
  const { mutate } = save;
  const toggle = useCallback((key: MetaKey) => mutate(togglePatch(maskFromSettings(qc.getQueryData<Settings>(['settings']) ?? settings), key)), [mutate, qc, settings]);
  const setAll = useCallback((hidden: boolean) => mutate(allPatch(hidden)), [mutate]);
  const setRevealOnAnswer = useCallback((v: boolean) => mutate({ revealMetaOnAnswer: v }), [mutate]);
  const toggleAll = useCallback(() => {
    const current = maskFromSettings(qc.getQueryData<Settings>(['settings']) ?? settings);
    const patch = toggleAllPatch(current);
    mutate(patch);
    toast(patch.hideDifficulty ? '메타데이터를 모두 가렸습니다' : '메타데이터를 모두 표시합니다', { description: '설정에 저장되어 다음 학습에도 유지됩니다.' });
  }, [mutate, qc, settings]);
  return { mask, revealOnAnswer: settings.revealMetaOnAnswer, toggle, setAll, toggleAll, setRevealOnAnswer, saving: save.isPending };
}

/** Header button + popover: one switch per metadata item, all-on / all-off, and the reveal-on-answer option. */
export function MetaMaskMenu({ mask, revealOnAnswer, onToggle, onSetAll, onSetRevealOnAnswer, shortcut }: { mask: MetaMask; revealOnAnswer: boolean; onToggle: (key: MetaKey) => void; onSetAll: (hidden: boolean) => void; onSetRevealOnAnswer: (v: boolean) => void; shortcut?: string }) {
  const n = hiddenCount(mask);
  const all = isAllHidden(mask);
  return (
    <PopoverPrimitive.Root>
      <Tooltip content={<>메타데이터 가리기{n ? ` (${n}개 가림)` : ''}{shortcut ? <kbd className="kbd ml-1">{shortcut}</kbd> : null}</>}>
        <PopoverPrimitive.Trigger asChild>
          <Button variant="ghost" size="iconSm" aria-label={`메타데이터 가리기 (${n}개 가림)`} data-testid="meta-mask-btn" data-hidden-count={n} className={cn('relative', n > 0 && 'text-accent')}>
            {n > 0 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {n > 0 && !all ? <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-0.5 text-[9px] font-semibold leading-none text-accent-ink tabular" aria-hidden>{n}</span> : null}
          </Button>
        </PopoverPrimitive.Trigger>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="end" sideOffset={6} className="z-50 w-[300px] rounded-lg border border-line bg-elevated p-3 shadow-card rs-pop" data-testid="meta-mask-menu">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-ink">메타데이터 가리기</div>
              <p className="text-[11px] leading-snug text-ink-3">정답 힌트가 될 수 있는 정보를 숨깁니다. 바로 적용되고 모든 기기에 저장됩니다.</p>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {META_KEYS.map((k) => (
              <li key={k} className="flex items-center justify-between gap-3 py-2">
                <label htmlFor={`mask-${k}`} className="min-w-0 cursor-pointer">
                  <div className="text-[13px] text-ink">{META_LABEL[k].label}</div>
                  <div className="text-[11px] leading-snug text-ink-3">{META_LABEL[k].hint}</div>
                </label>
                <Switch id={`mask-${k}`} checked={mask[k]} onCheckedChange={() => onToggle(k)} aria-label={`${META_LABEL[k].label} 가리기`} data-testid={`mask-${META_SETTING[k]}`} />
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-line py-2">
            <label htmlFor="mask-reveal-on-answer" className="min-w-0 cursor-pointer">
              <div className="text-[13px] text-ink">정답 공개 시 모두 표시</div>
              <div className="text-[11px] leading-snug text-ink-3">정답을 본 뒤에만 가린 항목을 잠시 보여주고, 다음 문제에서 다시 가립니다.</div>
            </label>
            <Switch id="mask-reveal-on-answer" checked={revealOnAnswer} onCheckedChange={onSetRevealOnAnswer} aria-label="정답 공개 시 모두 표시" data-testid="mask-revealMetaOnAnswer" disabled={n === 0} />
          </div>
          <div className="flex items-center gap-1.5 border-t border-line pt-2">
            <Button size="sm" variant={all ? 'ghost' : 'primary'} onClick={() => onSetAll(true)} disabled={all} data-testid="mask-all-on"><EyeOff className="h-3.5 w-3.5" /> 모두 가리기</Button>
            <Button size="sm" variant="ghost" onClick={() => onSetAll(false)} disabled={n === 0} data-testid="mask-all-off"><Eye className="h-3.5 w-3.5" /> 모두 보이기</Button>
            <Tooltip content="설정 페이지에서도 바꿀 수 있습니다">
              <Link href="/settings#study-meta-mask" className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-muted hover:text-ink" aria-label="설정에서 보기"><Settings2 className="h-3.5 w-3.5" /></Link>
            </Tooltip>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
