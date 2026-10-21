'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, NotebookPen, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, type Note, type NotesResponse } from '@/lib/api';
import { Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatDateTime } from '@/lib/utils';
import { RATINGS } from './rating-bar';
import { Markdown } from '@/components/questions/markdown';
import { isComposing } from '@/lib/shortcuts/manager';

const AUTOSAVE_MS = 900;

/**
 * Per-question notes, one per review round. The current round's note is editable;
 * earlier rounds are listed with the review they were written during.
 */
export function NotesPanel({ questionId, round, hideRound, focusSignal, className, defaultOpen = true }: { questionId: string; round: number; hideRound?: boolean; focusSignal?: number; className?: string; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notes', questionId], queryFn: () => api<NotesResponse>(`/questions/${questionId}/notes`) });
  const current = q.data?.notes.find((n) => n.reviewRound === round) ?? null;
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [showHistory, setShowHistory] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledSignal = useRef(focusSignal);
  // Refs mirror the latest text so a debounced/blur save never sends a stale closure value.
  const draftRef = useRef('');
  const dirtyRef = useRef(false);
  const savedRef = useRef(''); // last body the server is known to hold
  // IME (Korean/Japanese/Chinese) composition in progress: the textarea holds a half-built syllable, so
  // nothing is saved and no server echo may overwrite the text until compositionend.
  const composingRef = useRef(false);
  const syncedKey = useRef<string | null>(null);
  const key = `${questionId}:${round}`;

  const setDirtyBoth = (v: boolean) => { dirtyRef.current = v; setDirty(v); };
  const setDraftBoth = (v: string) => { draftRef.current = v; setDraft(v); };

  useEffect(() => {
    if (!q.data) return;
    const body = current?.body ?? '';
    savedRef.current = body;
    if (syncedKey.current !== key) {
      syncedKey.current = key;
      // first load for this card/round; text typed before it arrived wins over the server copy
      if (!dirtyRef.current) setDraftBoth(body);
      return;
    }
    // A later server value (our own save's refetch, another tab) must never clobber text being edited.
    if (dirtyRef.current || composingRef.current || document.activeElement === ref.current) return;
    setDraftBoth(body);
  }, [key, q.data, current?.body]);

  useEffect(() => {
    // Only react to a *new* signal (M key); a remounted panel must not steal focus on the next card.
    if (focusSignal && focusSignal !== handledSignal.current) {
      handledSignal.current = focusSignal;
      setOpen(true);
      setTimeout(() => ref.current?.focus(), 20);
    }
  }, [focusSignal]);

  const save = useMutation({
    mutationFn: (body: string) => api<Note>(`/questions/${questionId}/notes/${round}`, { method: 'PUT', json: { body } }),
    onSuccess: (_note, body) => {
      savedRef.current = body;
      // typed more while the request was in flight → stay dirty; the pending debounce saves the rest
      if (draftRef.current === body) setDirtyBoth(false);
      void qc.invalidateQueries({ queryKey: ['notes', questionId] });
    },
    onError: (e: Error) => toast.error('메모를 저장하지 못했습니다', { description: e.message }),
  });
  const { mutate } = save;

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const flush = useCallback(() => {
    clearTimer();
    if (composingRef.current) return;
    const text = draftRef.current;
    if (text === savedRef.current) { setDirtyBoth(false); return; }
    mutate(text);
  }, [mutate]);
  const scheduleSave = () => {
    clearTimer();
    if (composingRef.current) return; // compositionend reschedules with the finished syllable
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  };
  // Leaving the card (or page) with unsaved text: send it now instead of dropping the pending debounce.
  useEffect(() => () => {
    clearTimer();
    if (dirtyRef.current && draftRef.current !== savedRef.current) {
      dirtyRef.current = false;
      void api<Note>(`/questions/${questionId}/notes/${round}`, { method: 'PUT', json: { body: draftRef.current } })
        .then(() => qc.invalidateQueries({ queryKey: ['notes', questionId] }))
        .catch((e: Error) => toast.error('메모를 저장하지 못했습니다', { description: e.message }));
    }
  }, [qc, questionId, round]);

  const history = (q.data?.notes ?? []).filter((n) => n.reviewRound !== round);

  return (
    <section className={cn('rounded-lg border border-line bg-elevated', className)} data-testid="notes-panel" aria-label="문항 메모">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <NotebookPen className="h-4 w-4 text-ink-3" />
        <span className="text-[13px] font-semibold text-ink-2">{hideRound ? '메모 · 이번 회차' : `메모 · ${round}회차`}</span>
        {dirty ? <Badge tone="warn">저장 대기</Badge> : save.isPending ? <Badge>저장 중…</Badge> : current ? <Badge tone="ok">저장됨</Badge> : null}
        {history.length ? <span className="text-[12px] text-ink-3">{hideRound ? '이전 회차 메모 있음' : `이전 회차 메모 ${history.length}개`}</span> : null}
        <kbd className="kbd ml-auto" aria-hidden>M</kbd>
        {open ? <ChevronUp className="h-4 w-4 text-ink-3" /> : <ChevronDown className="h-4 w-4 text-ink-3" />}
      </button>
      {open ? (
        <div className="space-y-3 px-4 pb-4">
          <Textarea
            ref={ref}
            value={draft}
            rows={3}
            placeholder={`${hideRound ? '이번 회차' : `${round}회차`} 복습에서 기억할 점, 헷갈린 이유, 암기 팁을 적어두세요. (자동 저장, Esc로 나가기)`}
            aria-label={hideRound ? '이번 회차 메모' : `${round}회차 메모`}
            data-testid="note-input"
            onChange={(e) => {
              setDraftBoth(e.target.value);
              setDirtyBoth(true);
              scheduleSave();
            }}
            onCompositionStart={() => { composingRef.current = true; clearTimer(); }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              setDraftBoth(e.currentTarget.value);
              setDirtyBoth(true);
              scheduleSave();
            }}
            onBlur={() => { if (dirtyRef.current) flush(); }}
            onKeyDown={(e) => {
              if (isComposing(e.nativeEvent)) return; // Esc/⌘S belong to the IME while a syllable is being built
              if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
              if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); flush(); }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-ink-3">회차마다 메모 하나가 저장되며, 평가 시 해당 복습 기록과 연결됩니다.</p>
            <Button size="sm" variant="ghost" onClick={flush} disabled={!dirty || save.isPending}><Save className="h-3.5 w-3.5" /> 저장</Button>
          </div>
          {history.length ? (
            <div>
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-[13px] font-medium text-accent underline-offset-4 hover:underline">
                {showHistory ? '이전 회차 메모 접기' : `이전 회차 메모 ${history.length}개 보기`}
              </button>
              {showHistory ? (
                <ol className="mt-2 space-y-2" data-testid="note-history">
                  {history.map((n) => <NoteHistoryItem key={n.id} note={n} />)}
                </ol>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function NoteHistoryItem({ note }: { note: Note }) {
  const r = note.review ? RATINGS.find((x) => x.value === note.review!.rating) : null;
  return (
    <li className="rounded-md border border-line bg-muted/50 px-3 py-2">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        <span className="font-semibold text-ink-2">{note.reviewRound}회차</span>
        {r ? <span className={cn('font-medium', r.cls.split(' ')[1])}>{r.ko}</span> : <span>미평가</span>}
        {note.review?.isCorrect === true ? <span className="text-ok-ink">정답</span> : note.review?.isCorrect === false ? <span className="text-bad-ink">오답</span> : null}
        <span>{formatDateTime(note.review?.reviewedAt ?? note.updatedAt)}</span>
      </div>
      <Markdown className="prose-sm">{note.body}</Markdown>
    </li>
  );
}
