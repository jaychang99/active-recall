'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, ClipboardCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AnswerPayload, GradeResult, Question } from '@recall/contracts';
import { api, type CardInfo, type NotesResponse, type QueueItem } from '@/lib/api';
import { buildQuestionExport, essayGradingPrompt, explainPrompt, exportJson } from '@/lib/question-export';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { copyToClipboard } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

type FullQuestion = { question: Question; card: CardInfo; revision?: number; type: string };
type SubjectRow = { id: string; name: string; source: string };

/**
 * Copy buttons for the result view: the whole question (answer key, explanations, source, my attempt, every
 * round's note) as JSON, the same JSON wrapped in a prompt asking another LLM for a deeper explanation, and for
 * essays a prompt asking it to grade my answer against the rubric.
 * Only rendered after submit/reveal, so it never leaks the answer key while answering (and its C / P shortcuts
 * exist only while it is mounted).
 */
export function CopyQuestionButtons({ item, answer, grade, revealedBeforeAnswer, hintUsed, shortcuts }: { item: QueueItem; answer: AnswerPayload | null; grade: GradeResult | null; revealedBeforeAnswer: boolean; hintUsed: boolean; shortcuts: boolean }) {
  const qc = useQueryClient();
  const id = item.questionId;
  const fullOpts = { queryKey: ['question', id], queryFn: () => api<FullQuestion>(`/questions/${id}?includeAnswer=true`) };
  const notesOpts = { queryKey: ['notes', id], queryFn: () => api<NotesResponse>(`/questions/${id}/notes`) };
  const subjectsOpts = { queryKey: ['question-subjects', id], queryFn: () => api<SubjectRow[]>(`/questions/${id}/subjects`) };
  // Warm the cache as soon as the result shows, so the click can write to the clipboard without awaiting the network
  // (Safari drops the user gesture across a slow await).
  const full = useQuery(fullOpts);
  const notes = useQuery(notesOpts);
  const subjects = useQuery(subjectsOpts);
  const [busy, setBusy] = useState<'json' | 'prompt' | 'grading' | null>(null);
  const essayText = answer?.type === 'essay' ? answer.text : '';

  const copy = async (kind: 'json' | 'prompt' | 'grading') => {
    if (busy) return;
    setBusy(kind);
    try {
      const [f, n, s] = await Promise.all([
        full.data ?? qc.fetchQuery(fullOpts),
        notes.data ?? qc.fetchQuery(notesOpts),
        subjects.data ?? qc.fetchQuery(subjectsOpts),
      ]);
      const doc = buildQuestionExport({
        question: { id, externalId: item.externalId, type: item.type, revision: f.revision ?? null, data: f.question },
        deck: item.deck,
        subjects: s.map((x) => x.name),
        card: item.card,
        reviewRound: item.reviewRound,
        revealedBeforeAnswer,
        hintUsed,
        answerPayload: answer,
        grade,
        notes: n.notes,
      });
      const text = kind === 'json' ? exportJson(doc) : kind === 'prompt' ? explainPrompt(doc) : essayGradingPrompt(doc, essayText, answer?.type === 'essay' ? answer.selfScores : undefined);
      const ok = await copyToClipboard(text);
      if (ok) toast.success(kind === 'json' ? '문제 데이터를 JSON으로 복사했습니다' : kind === 'prompt' ? '해설 요청 프롬프트를 복사했습니다' : '서술형 채점 프롬프트를 복사했습니다', { description: kind === 'json' ? undefined : '다른 LLM 대화창에 붙여넣으세요.' });
      else toast.error('클립보드에 복사하지 못했습니다');
    } catch (e) {
      toast.error('문제 데이터를 불러오지 못했습니다', { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  useShortcuts(
    'study',
    [
      { keys: 'c', description: '문제 데이터 JSON 복사 (채점 후)', group: '학습', handler: () => { void copy('json'); } },
      { keys: 'p', description: '해설 요청 프롬프트 복사 (채점 후)', group: '학습', handler: () => { void copy('prompt'); } },
      { keys: 'k', description: '서술형 채점을 위한 프롬프트 복사', group: '학습', handler: () => (item.type === 'essay' && essayText.trim() ? (void copy('grading'), undefined) : false) },
    ],
    shortcuts,
  );

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="copy-question">
      <Tooltip content="문제·보기·그래픽·정답·해설·출처·내 답안·회차별 메모 전체를 JSON으로 복사">
        <Button size="sm" variant="ghost" loading={busy === 'json'} loadingLabel="문제 데이터 준비 중…" onClick={() => void copy('json')} disabled={busy !== null} kbd={shortcuts ? 'C' : undefined} data-testid="copy-json-btn"><Braces className="h-4 w-4" /> JSON 복사</Button>
      </Tooltip>
      <Tooltip content="같은 JSON에 ‘더 자세히 해설해 달라’는 프롬프트를 붙여 복사 — 다른 LLM에 그대로 붙여넣기. 답변 끝에 메모란에 붙여넣을 일반 텍스트 메모도 요청합니다">
        <Button size="sm" variant="ghost" loading={busy === 'prompt'} loadingLabel="프롬프트 준비 중…" onClick={() => void copy('prompt')} disabled={busy !== null} kbd={shortcuts ? 'P' : undefined} data-testid="copy-prompt-btn"><Sparkles className="h-4 w-4" /> 해설 요청 프롬프트 복사</Button>
      </Tooltip>
      {item.type === 'essay' ? (
        <Tooltip content={essayText.trim() ? '채점 기준·모범답안·내 답안을 담아, 다른 LLM이 기준별로 채점하도록 요청하는 프롬프트를 복사' : '답안을 작성한 경우에만 사용할 수 있습니다'}>
          <Button size="sm" variant="ghost" loading={busy === 'grading'} loadingLabel="프롬프트 준비 중…" onClick={() => void copy('grading')} disabled={busy !== null || !essayText.trim()} kbd={shortcuts ? 'K' : undefined} data-testid="copy-grading-btn"><ClipboardCheck className="h-4 w-4" /> 서술형 채점을 위한 프롬프트 복사</Button>
        </Tooltip>
      ) : null}
    </div>
  );
}
