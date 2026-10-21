'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCopy, FileText, RotateCcw, Save } from 'lucide-react';
import Link from '@/components/ui/navigation-link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type Deck, type Settings, type SubjectSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Panel } from '@/components/ui/misc';
import { useSettings } from '@/components/layout/settings-context';
import { PromptOptionsForm, PromptOptionsWarnings } from '@/components/prompt/prompt-options-form';
import { buildPromptBundle, promptText } from '@/lib/prompt-bundle';
import { PROMPT_DEFAULTS, changedKeys, renderConfigBlock, resolvePromptOptions, toSavedDefaults, type PromptOptions } from '@/lib/prompt-options';
import { copyToClipboard } from '@/lib/utils';

async function copy(label: string, text: string) {
  const ok = await copyToClipboard(text);
  if (ok) toast.success(`${label} 복사됨`, { description: `${(text.length / 1024).toFixed(1)} KB · LLM 대화창에 붙여넣고 자료(PDF·교안·주제)를 첨부하세요.` });
  else toast.error('클립보드에 복사하지 못했습니다', { description: '브라우저 권한을 확인하세요.' });
}

/**
 * One-off prompt options: start from the saved defaults, adjust, copy. Nothing here is persisted unless
 * "기본값으로 저장" is pressed (which writes Settings.promptDefaults).
 */
export default function PromptPage() {
  const qc = useQueryClient();
  const { settings, loaded } = useSettings();
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api<Deck[]>('/decks') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects') });
  const saved = useMemo(() => resolvePromptOptions(settings.promptDefaults), [settings.promptDefaults]);
  const [value, setValue] = useState<PromptOptions>(saved);
  const [touched, setTouched] = useState(false);
  // Seed the one-off form from the saved defaults once they arrive (and whenever they change, if untouched).
  useEffect(() => { if (!touched) setValue(saved); }, [saved, touched]);

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
        description="문제 생성 프롬프트의 CONFIG 값을 이 자리에서 조정해 복사합니다. 제공된 자료 모드는 복사한 프롬프트와 자료를 함께 붙여넣고, 일반 지식 모드는 대주제·소주제만으로 출제합니다. 여기서 바꾼 값은 복사에만 쓰이고 저장되지 않습니다."
        actions={<Link href="/settings#prompt-defaults" className="text-sm text-accent underline-offset-4 hover:underline">기본값은 설정에서</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)] lg:items-start">
        <Panel className="min-w-0 px-3 py-2 sm:px-5">
          <PromptOptionsForm value={value} onChange={update} base={saved} decks={decks.data} subjects={subjects.data} />
        </Panel>

        <div className="min-w-0 space-y-4 lg:sticky lg:top-20">
          <Panel className="p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-ink-2">복사될 CONFIG</h2>
              {changed.size ? <Badge tone="accent">기본값과 {changed.size}곳 다름</Badge> : <Badge>기본값과 같음</Badge>}
            </div>
            <pre className="max-h-72 overflow-auto rounded-md border border-line bg-sunken p-3 font-mono text-[12px] leading-relaxed text-ink-2" data-testid="prompt-config-preview">{config}</pre>
            <PromptOptionsWarnings value={value} className="mt-2" />
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="primary" onClick={() => void copy('프롬프트 + 스키마', buildPromptBundle(value))} data-testid="prompt-copy-bundle"><ClipboardCopy className="h-4 w-4" /> 프롬프트 + 스키마 복사</Button>
              <Button onClick={() => void copy('프롬프트', promptText(value))} data-testid="prompt-copy-prompt"><FileText className="h-4 w-4" /> 프롬프트만 복사</Button>
            </div>
          </Panel>
          <Panel className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold text-ink-2">기본값</h2>
            <p className="mb-3 text-[12px] text-ink-3">{loaded && settings.promptDefaults ? '저장된 기본값이 있습니다. 프롬프트 문서의 값과 다른 항목만 저장됩니다.' : '저장된 기본값이 없어 프롬프트 문서의 값을 씁니다.'}</p>
            <div className="flex flex-wrap gap-2">
              <Button loading={saveDefaults.isPending} size="sm" onClick={() => saveDefaults.mutate()} disabled={saveDefaults.isPending || !changed.size} data-testid="prompt-save-defaults"><Save className="h-3.5 w-3.5" /> {saveDefaults.isPending ? '저장 중…' : '현재 값을 기본값으로 저장'}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setValue(saved); setTouched(false); }} disabled={!changed.size}><RotateCcw className="h-3.5 w-3.5" /> 기본값으로 되돌리기</Button>
              <Button size="sm" variant="ghost" onClick={() => update(resolvePromptOptions(null, PROMPT_DEFAULTS))} disabled={!changedKeys(value, PROMPT_DEFAULTS).length}>문서 원본 값으로</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
