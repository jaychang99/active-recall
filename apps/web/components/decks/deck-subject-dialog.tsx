'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, type SubjectSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Change a whole deck's subject: replace the primary subject (moves every question) or add an extra subject to all questions. */
export function DeckSubjectDialog({ deckId, currentSubject, questionCount, onChanged }: { deckId: string; currentSubject: string; questionCount: number; onChanged: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'replace' | 'add'>('replace');
  const [name, setName] = useState('');
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<SubjectSummary[]>('/subjects'), enabled: open });
  const chosen = name.trim();
  const existing = subjects.data?.find((s) => s.name === chosen);
  const mut = useMutation({
    mutationFn: () => (mode === 'replace' ? api(`/decks/${deckId}`, { method: 'PATCH', json: { subject: chosen } }) : api(`/decks/${deckId}/subjects`, { method: 'POST', json: { name: chosen } })),
    onSuccess: () => {
      onChanged();
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      void qc.invalidateQueries({ queryKey: ['decks'] });
      toast.success(mode === 'replace' ? `덱의 과목을 "${chosen}"(으)로 변경했습니다` : `모든 문항에 "${chosen}" 과목을 추가했습니다`, { description: `${questionCount}개 문항에 반영` });
      setOpen(false);
      setName('');
    },
    onError: (e: Error) => toast.error('과목을 변경하지 못했습니다', { description: e.message }),
  });
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="deck-subject-btn"><FolderTree className="h-4 w-4" /> 과목: {currentSubject}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="덱 과목 변경" description={`현재 과목: ${currentSubject} · ${questionCount}개 문항에 적용됩니다.`}>
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {([['replace', '주 과목 교체', '덱의 과목을 바꾸고 모든 문항의 덱 과목 연결을 새 과목으로 옮깁니다. 수동으로 붙인 과목은 유지됩니다.'], ['add', '과목 추가', '주 과목은 그대로 두고, 모든 문항에 과목을 하나 더 붙입니다 (태그처럼).']] as const).map(([m, t, d]) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={cn('rounded-md border p-3 text-left', mode === m ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong')}>
                  <div className="text-sm font-medium">{t}</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">{d}</div>
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="deck-subject-name">과목 이름</Label>
              <Input id="deck-subject-name" list="deck-subject-options" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="기존 과목을 고르거나 새 이름 입력" autoFocus />
              <datalist id="deck-subject-options">{subjects.data?.map((s) => <option key={s.id} value={s.name}>{`${s.questionCount}문항`}</option>)}</datalist>
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="deck-subject-options">
                {subjects.data?.filter((s) => s.name !== currentSubject || mode === 'add').map((s) => (
                  <button key={s.id} type="button" onClick={() => setName(s.name)} className={cn('rounded-full border px-2.5 py-0.5 text-[12px]', chosen === s.name ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line text-ink-2 hover:border-line-strong')}>
                    {s.name} <span className="text-ink-3">{s.questionCount}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-3">{chosen ? (existing ? `기존 과목 "${chosen}"에 연결합니다.` : `"${chosen}" 과목을 새로 만듭니다.`) : '과목을 선택하거나 입력하세요.'}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" disabled={!chosen || mut.isPending || (mode === 'replace' && chosen === currentSubject)} onClick={() => mut.mutate()} data-testid="deck-subject-apply">{mode === 'replace' ? '과목 교체' : '과목 추가'}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
