'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCopy, FileText, RotateCcw, Save } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type Deck, type Settings, type SubjectSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, PageHeader, Panel } from '@/components/ui/misc';
import { useSettings } from '@/components/layout/settings-context';
import { PromptOptionsForm, PromptOptionsWarnings } from '@/components/prompt/prompt-options-form';
import { SavePromptPresetButton } from '@/components/prompt/prompt-preset-dialog';
import { PROMPT_LIBRARY_KEY, useCopyPrompt, type PromptSnapshot } from '@/lib/prompt-library';
import { PROMPT_DEFAULTS, changedKeys, renderConfigBlock, resolvePromptOptions, toSavedDefaults, type PromptOptions } from '@/lib/prompt-options';

/** Copies save complete history snapshots; named presets are stored independently. */
export default function PromptPage() {
  const qc = useQueryClient();
  const { settings, loaded } = useSettings();
  const sourceId = useSearchParams().get('from');
  const snapshot = useQuery({ queryKey: [...PROMPT_LIBRARY_KEY, 'snapshot', sourceId], queryFn: () => api<PromptSnapshot>(`/prompt-library/${encodeURIComponent(sourceId!)}`), enabled: !!sourceId });
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects') });
  const saved = useMemo(() => resolvePromptOptions(settings.promptDefaults), [settings.promptDefaults]);
  const [value, setValue] = useState<PromptOptions>(saved);
  const [touched, setTouched] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [appliedSource, setAppliedSource] = useState<string | null>(null);
  const ready = !sourceId || appliedSource === sourceId;
  const { copy, busy } = useCopyPrompt();
  // Seed the one-off form from the saved defaults once they arrive (and whenever they change, if untouched).
  useEffect(() => { if (!touched && !sourceId) setValue(saved); }, [saved, touched, sourceId]);
  useEffect(() => {
    if (sourceId && snapshot.data && appliedSource !== sourceId) {
      setValue(resolvePromptOptions(snapshot.data.optionsJson)); setTouched(true); setFormVersion((v) => v + 1); setAppliedSource(sourceId);
      toast.success('전체 설정을 불러왔습니다', { description: '필요한 값을 수정한 뒤 복사하세요.' });
    }
  }, [sourceId, snapshot.data, appliedSource]);

  const changed = useMemo(() => new Set(changedKeys(value, saved)), [value, saved]);
  const config = useMemo(() => renderConfigBlock(value), [value]);

  const saveDefaults = useMutation({
    mutationFn: () => api<Settings>('/settings', { method: 'PATCH', json: { promptDefaults: toSavedDefaults(value) } }),
    onSuccess: (s) => { qc.setQueryData(['settings'], s); setTouched(false); toast.success('프롬프트 기본값을 저장했습니다', { description: '설정 > LLM 프롬프트 기본값에서도 바꿀 수 있습니다.' }); },
    onError: (e: Error) => toast.error('기본값을 저장하지 못했습니다', { description: e.message }),
  });

  const update = (next: PromptOptions) => { setValue(next); setTouched(true); };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="LLM 프롬프트"
        description="문제 생성 프롬프트의 CONFIG 값을 이 자리에서 조정해 복사합니다. 제공된 자료 모드는 자료와 함께, 일반 지식 모드는 대주제·소주제로 출제합니다. 복사한 설정은 이력에 자동 저장됩니다."
        actions={<div className="flex flex-wrap items-center gap-3 text-sm text-accent"><SavePromptPresetButton value={value} disabled={!loaded || !ready} /><Link href="/prompt/history" className="underline-offset-4 hover:underline" data-testid="prompt-history-link">복사 이력·프리셋</Link><Link href="/settings#prompt-defaults" className="underline-offset-4 hover:underline">기본값은 설정에서</Link></div>}
      />
      {sourceId && !ready && !snapshot.isError ? <p role="status" className="mb-4 text-sm text-ink-3">저장된 설정을 불러오는 중…</p> : null}
      {snapshot.isError ? <div className="mb-4"><ErrorState title="설정을 불러오지 못했습니다" message={snapshot.error.message} onRetry={() => void snapshot.refetch()} /><Link href="/prompt/history" className="mt-2 inline-block text-sm text-accent">복사 이력으로 돌아가기</Link></div> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:items-start">
        <Panel id="prompt-options" className="min-w-0 scroll-mt-20 px-3 py-2 sm:px-5">
          <fieldset disabled={!ready} className="min-w-0"><PromptOptionsForm key={formVersion} value={value} onChange={update} base={saved} decks={decks.data} subjects={subjects.data} /></fieldset>
        </Panel>

        <div className="min-w-0 space-y-4" data-testid="prompt-actions">
          <Panel className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-ink-2">복사될 CONFIG</h2>
              {changed.size ? <Badge tone="accent">기본값과 {changed.size}곳 다름</Badge> : <Badge>기본값과 같음</Badge>}
            </div>
            <pre className="max-h-72 overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-[12px] leading-relaxed text-ink-2" data-testid="prompt-config-preview">{config}</pre>
            <PromptOptionsWarnings value={value} className="mt-2" />
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="primary" disabled={!loaded || !ready || busy} onClick={() => void copy(value, 'bundle')} data-testid="prompt-copy-bundle"><ClipboardCopy className="h-4 w-4" /> 프롬프트 + 스키마 복사</Button>
              <Button disabled={!loaded || !ready || busy} onClick={() => void copy(value, 'prompt')} data-testid="prompt-copy-prompt"><FileText className="h-4 w-4" /> 프롬프트만 복사</Button>
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold text-ink-2">기본값</h2>
            <p className="mb-3 text-[12px] text-ink-3">{loaded && settings.promptDefaults ? '저장된 기본값이 있습니다. 프롬프트 문서의 값과 다른 항목만 저장됩니다.' : '저장된 기본값이 없어 프롬프트 문서의 값을 씁니다.'}</p>
            <div className="flex flex-wrap gap-2">
              <Button loading={saveDefaults.isPending} size="sm" onClick={() => saveDefaults.mutate()} disabled={!ready || saveDefaults.isPending || !changed.size} data-testid="prompt-save-defaults"><Save className="h-3.5 w-3.5" /> {saveDefaults.isPending ? '저장 중…' : '현재 값을 기본값으로 저장'}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setValue(saved); setTouched(false); }} disabled={!changed.size}><RotateCcw className="h-3.5 w-3.5" /> 기본값으로 되돌리기</Button>
              <Button size="sm" variant="ghost" onClick={() => update(resolvePromptOptions(null, PROMPT_DEFAULTS))} disabled={!changedKeys(value, PROMPT_DEFAULTS).length}>문서 원본 값으로</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
