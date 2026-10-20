'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { KIND_LABEL } from './labels';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';

export type ShareTarget = { kind: 'deck'; deckId: string } | { kind: 'subject'; subjectId: string } | { kind: 'questions'; questionIds: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 20;

/** Split pasted / typed text into addresses (comma, semicolon, whitespace). */
export function parseEmails(text: string): string[] {
  return text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Send a copy of a deck / subject / question selection to people by e-mail. They accept it from their inbox. */
export function ShareDialog({ target, name, count, size, variant, label = '공유', onSent }: { target: ShareTarget; name: string; count: number; size?: ButtonProps['size']; variant?: ButtonProps['variant']; label?: string; onSent?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const pending = parseEmails(draft);
  const all = [...new Set([...emails, ...pending])];
  const invalid = all.filter((e) => !EMAIL_RE.test(e));

  const commitDraft = () => {
    if (!pending.length) return;
    setEmails((prev) => [...new Set([...prev, ...pending])].slice(0, MAX_RECIPIENTS));
    setDraft('');
  };
  const reset = () => { setEmails([]); setDraft(''); setMessage(''); };

  const send = useMutation({
    mutationFn: () => api<{ sent: number; recipients: string[]; questionCount: number }>('/shares', { method: 'POST', json: { ...target, emails: all, message: message.trim() || undefined } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['shares', 'sent'] });
      toast.success(`${r.sent}명에게 공유했습니다`, { description: `문항 ${r.questionCount}개. 상대가 수락하면 복사본이 생깁니다. 아직 가입하지 않은 사람은 가입한 뒤 받은 공유함에서 볼 수 있습니다.` });
      setOpen(false);
      reset();
      onSent?.();
    },
    onError: (e: Error) => toast.error('공유하지 못했습니다', { description: e.message }),
  });

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} data-testid={`share-${target.kind}-btn`}><Share2 className="h-4 w-4" /> {label}</Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent title={`${KIND_LABEL[target.kind]} 공유`} description={`${name} · 문항 ${count}개`}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (all.length && !invalid.length) send.mutate(); }}>
            <div>
              <Label htmlFor="share-emails">받는 사람 이메일</Label>
              <div className="mt-1 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line bg-elevated px-2 py-1.5 focus-within:border-accent">
                {emails.map((e) => (
                  <span key={e} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ${EMAIL_RE.test(e) ? 'bg-accent-soft text-accent-soft-ink' : 'bg-bad-soft text-bad-ink'}`}>
                    {e}
                    <button type="button" aria-label={`${e} 빼기`} onClick={() => setEmails((p) => p.filter((x) => x !== e))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <Input
                  id="share-emails"
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    // A trailing separator (typed or pasted) turns the text into chips.
                    if (/[\s,;]$/.test(v)) { setEmails((prev) => [...new Set([...prev, ...parseEmails(v)])].slice(0, MAX_RECIPIENTS)); setDraft(''); } else setDraft(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) { e.preventDefault(); commitDraft(); }
                    else if (e.key === 'Backspace' && !draft && emails.length) setEmails((p) => p.slice(0, -1));
                  }}
                  onBlur={commitDraft}
                  placeholder={emails.length ? '' : 'name@example.com (쉼표나 Enter로 여러 명)'}
                  className="h-7 min-w-[12rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                  autoFocus
                  autoComplete="email"
                  data-testid="share-emails"
                />
              </div>
              {invalid.length ? <p className="mt-1 text-[12px] text-bad-ink">이메일 형식이 아닙니다: {invalid.join(', ')}</p> : null}
            </div>
            <div>
              <Label htmlFor="share-message">메시지 (선택)</Label>
              <Textarea id="share-message" className="mt-1" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="함께 보낼 말" />
            </div>
            <ul className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-[12px] text-ink-2">
              <li>· 지금 내용 그대로 복사해서 보냅니다. 보낸 뒤에 고쳐도 상대에게는 반영되지 않습니다.</li>
              <li>· 내 학습 기록(복습, 메모, 표시, 보류)은 보내지 않습니다. 상대는 처음부터 학습합니다.</li>
              <li>· 상대가 30일 안에 수락하면 상대 계정에 복사됩니다. 가입하지 않은 주소라면 가입한 뒤에 받습니다.</li>
            </ul>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!all.length || invalid.length > 0 || send.isPending} data-testid="share-send"><Send className="h-4 w-4" /> {all.length ? `${all.length}명에게 보내기` : '보내기'}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
