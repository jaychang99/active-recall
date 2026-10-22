'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { buildPromptBundle, promptText } from '@/lib/prompt-bundle';
import { resolvePromptOptions, type PromptOptions } from '@/lib/prompt-options';
import { copyToClipboard } from '@/lib/utils';

export type PromptCopyKind = 'bundle' | 'prompt';
export interface PromptSnapshot {
  id: string;
  kind: 'history' | 'preset';
  name: string;
  copyKind: PromptCopyKind | null;
  optionsJson: PromptOptions;
  createdAt: string;
}
export interface PromptSnapshotPage { items: PromptSnapshot[]; nextOffset: number | null }
export const PROMPT_LIBRARY_KEY = ['prompt-library'];

export function promptSnapshotName(options: PromptOptions): string {
  return [options.sourceMode === 'general_knowledge' ? options.mainTopic : '', options.deckTitle, options.subject, options.deckId].find((v) => v.trim() && v.trim() !== 'auto')?.trim().slice(0, 200) || '문제 생성';
}

/** Capture before awaiting clipboard access so edits during a request cannot change the history. */
export async function copyPromptWithHistory(value: PromptOptions, kind: PromptCopyKind): Promise<'failed' | 'saved' | { retry: () => Promise<PromptSnapshot>; error: unknown }> {
  const options = resolvePromptOptions(value);
  const text = kind === 'bundle' ? buildPromptBundle(options) : promptText(options);
  const copied = await copyToClipboard(text);
  if (!copied) return 'failed';
  const json = { kind: 'history', name: promptSnapshotName(options), copyKind: kind, options };
  const retry = () => api<PromptSnapshot>('/prompt-library', { method: 'POST', json });
  try { await retry(); return 'saved'; }
  catch (error) { return { retry, error }; }
}

export function useCopyPrompt() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: PROMPT_LIBRARY_KEY });
  const copy = async (value: PromptOptions, kind: PromptCopyKind) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await copyPromptWithHistory(value, kind);
      if (result === 'failed') toast.error('클립보드에 복사하지 못했습니다', { description: '브라우저 권한을 확인하세요. 복사 이력은 추가되지 않았습니다.' });
      else if (result === 'saved') {
        refresh();
        toast.success(`${kind === 'bundle' ? '프롬프트 + 스키마' : '프롬프트'} 복사됨`, { description: '전체 설정을 복사 이력에 저장했습니다.' });
      } else {
        toast.error('복사는 완료했지만 이력을 저장하지 못했습니다', {
          description: result.error instanceof Error ? result.error.message : '다시 저장을 눌러 이력을 보관하세요.', duration: Infinity,
          action: { label: '이력 다시 저장', onClick: () => {
            toast.promise(result.retry().then(() => { refresh(); }), { loading: '이력 저장 중…', success: '복사 이력을 저장했습니다', error: '이력을 저장하지 못했습니다' });
          } },
        });
      }
    } catch (error) {
      toast.error('프롬프트를 복사하지 못했습니다', { description: error instanceof Error ? error.message : undefined });
    } finally { pending.current = false; setBusy(false); }
  };
  return { copy, busy };
}
