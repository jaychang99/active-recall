'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AnswerPayload, GradeResult, Question } from '@recall/contracts';
import { api, type CardInfo, type NotesResponse, type QueueItem } from '@/lib/api';
import { buildQuestionExport, explainPrompt, exportJson } from '@/lib/question-export';
import { copyToClipboard } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

type FullQuestion = { question: Question; card: CardInfo; revision?: number; type: string };
type SubjectRow = { id: string; name: string; source: string };

/**
 * Two copy buttons for the result view: the whole question (answer key, explanations, source, my attempt, every
 * round's note) as JSON, and the same JSON wrapped in a prompt asking another LLM for a deeper explanation.
 * Only rendered after submit/reveal, so it never leaks the answer key while answering.
 */
export function CopyQuestionButtons({ item, answer, grade, revealedBeforeAnswer, hintUsed }: { item: QueueItem; answer: AnswerPayload | null; grade: GradeResult | null; revealedBeforeAnswer: boolean; hintUsed: boolean }) {
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
  const [busy, setBusy] = useState<'json' | 'prompt' | null>(null);

  const copy = async (kind: 'json' | 'prompt') => {
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
      const ok = await copyToClipboard(kind === 'json' ? exportJson(doc) : explainPrompt(doc));
      if (ok) toast.success(kind === 'json' ? '문제 데이터를 JSON으로 복사했습니다' : '해설 요청 프롬프트를 복사했습니다', { description: kind === 'prompt' ? '다른 LLM 대화창에 붙여넣으세요.' : undefined });
      else toast.error('클립보드에 복사하지 못했습니다');
    } catch (e) {
      toast.error('문제 데이터를 불러오지 못했습니다', { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1" data-testid="copy-question">
      <Tooltip content="문제·보기·그래픽·정답·해설·출처·내 답안·회차별 메모 전체를 JSON으로 복사">
        <Button size="sm" variant="ghost" onClick={() => void copy('json')} disabled={busy !== null} data-testid="copy-json-btn"><Braces className="h-4 w-4" /> JSON 복사</Button>
      </Tooltip>
      <Tooltip content="같은 JSON에 ‘더 자세히 해설해 달라’는 프롬프트를 붙여 복사 — 다른 LLM에 그대로 붙여넣기">
        <Button size="sm" variant="ghost" onClick={() => void copy('prompt')} disabled={busy !== null} data-testid="copy-prompt-btn"><Sparkles className="h-4 w-4" /> 해설 요청 프롬프트 복사</Button>
      </Tooltip>
    </div>
  );
}
