'use client';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Clock, Mail, Send, Share2, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, type RecipientInfo } from '@/lib/api';
import { KIND_LABEL } from './labels';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type ShareTarget = { kind: 'deck'; deckId: string } | { kind: 'subject'; subjectId: string } | { kind: 'questions'; questionIds: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 20;
const SELF_NOTICE = '본인에게는 공유할 수 없습니다.';

/** Split pasted / typed text into addresses (comma, semicolon, whitespace). */
export function parseEmails(text: string): string[] {
  return text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

const lookupKey = (email: string) => ['share-recipient', email] as const;

/** Send a copy of a deck / subject / question selection to people by e-mail. They accept it from their inbox. */
export function ShareDialog({ target, name, count, size, variant, label = '공유', onSent }: { target: ShareTarget; name: string; count: number; size?: ButtonProps['size']; variant?: ButtonProps['variant']; label?: string; onSent?: () => void }) {
  const qc = useQueryClient();
  const selfEmail = useSession().data?.user?.email?.trim().toLowerCase() ?? null;
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const q = draft.trim().toLowerCase();
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const recent = useQuery({ queryKey: ['share-recipients', 'recent'], queryFn: () => api<RecipientInfo[]>('/shares/recipients/recent'), enabled: open, staleTime: 60_000 });
  // Seed the per-address cache so recent people show their name and photo without another request.
  useEffect(() => { for (const r of recent.data ?? []) qc.setQueryData(lookupKey(r.email), r); }, [recent.data, qc]);
  const candidate = EMAIL_RE.test(debounced) && !emails.includes(debounced) ? debounced : null;
  const lookupEmails = [...emails.filter((e) => EMAIL_RE.test(e)), ...(candidate ? [candidate] : [])];
  const lookups = useQueries({
    queries: lookupEmails.map((email) => ({
      queryKey: lookupKey(email),
      queryFn: async () => (await api<RecipientInfo[]>('/shares/recipients/lookup', { method: 'POST', json: { emails: [email] } }))[0]!,
      staleTime: 5 * 60_000,
      enabled: open,
    })),
  });
  const info = new Map(lookupEmails.map((e, i) => [e, lookups[i]?.data] as const));
  const isSelf = (e: string) => e === selfEmail || info.get(e)?.self === true;

  const add = (list: string[]) => {
    const fresh = list.map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (fresh.some(isSelf)) setNotice(SELF_NOTICE);
    else setNotice(null);
    setEmails((prev) => [...new Set([...prev, ...fresh.filter((e) => !isSelf(e))])].slice(0, MAX_RECIPIENTS));
    setDraft('');
    setActive(0);
  };
  const reset = () => { setEmails([]); setDraft(''); setMessage(''); setNotice(null); };

  // Suggestions: people shared with before that match what is typed, plus the typed address itself.
  const recentMatches = (recent.data ?? []).filter((r) => !r.self && !emails.includes(r.email) && (!q || r.email.includes(q) || (r.name?.toLowerCase().includes(q) ?? false))).slice(0, 5);
  const typed = EMAIL_RE.test(q) && !emails.includes(q) && !recentMatches.some((r) => r.email === q) ? q : null;
  const suggestions: { email: string; recent: boolean }[] = [...(typed ? [{ email: typed, recent: false }] : []), ...recentMatches.map((r) => ({ email: r.email, recent: true }))];
  const showSuggestions = focused && suggestions.length > 0;
  const infoFor = (email: string): RecipientInfo | undefined => info.get(email) ?? recent.data?.find((r) => r.email === email);

  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  const blocked = emails.some(isSelf);
  const send = useMutation({
    mutationFn: () => api<{ sent: number; recipients: string[]; questionCount: number }>('/shares', { method: 'POST', json: { ...target, emails, message: message.trim() || undefined } }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['shares', 'sent'] });
      void qc.invalidateQueries({ queryKey: ['share-recipients', 'recent'] });
      toast.success(`${r.sent}명에게 공유했습니다`, { description: `문항 ${r.questionCount}개. 상대가 수락하면 복사본이 생깁니다. 아직 가입하지 않은 사람은 가입한 뒤 받은 공유함에서 볼 수 있습니다.` });
      setOpen(false);
      reset();
      onSent?.();
    },
    onError: (e: Error) => toast.error('공유하지 못했습니다', { description: e.message }),
  });
  const canSend = emails.length > 0 && !invalid.length && !blocked && !send.isPending;

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} data-testid={`share-${target.kind}-btn`}><Share2 className="h-4 w-4" /> {label}</Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent title={`${KIND_LABEL[target.kind]} 공유`} description={`${name} · 문항 ${count}개`}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSend) send.mutate(); }}>
            <div>
              <Label htmlFor="share-emails" className="block">받는 사람</Label>
              <Input
                id="share-emails"
                className="mt-1"
                value={draft}
                role="combobox"
                aria-expanded={showSuggestions}
                aria-controls="share-suggestions"
                aria-activedescendant={showSuggestions ? `share-suggestion-${active}` : undefined}
                onChange={(e) => {
                  const v = e.target.value;
                  setNotice(null);
                  setActive(0);
                  // A trailing separator (typed or pasted) adds what is before it.
                  if (/[\s,;]$/.test(v)) add(parseEmails(v));
                  else setDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'ArrowDown' && showSuggestions) { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
                  else if (e.key === 'ArrowUp' && showSuggestions) { e.preventDefault(); setActive((i) => (i - 1 + suggestions.length) % suggestions.length); }
                  else if (e.key === 'Enter' || e.key === ',') {
                    const pick = showSuggestions ? suggestions[active] : undefined;
                    if (pick) { e.preventDefault(); add([pick.email]); }
                    else if (q) { e.preventDefault(); add(parseEmails(draft)); }
                  } else if (e.key === 'Backspace' && !draft && emails.length) setEmails((p) => p.slice(0, -1));
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => { setFocused(false); if (q) add(parseEmails(draft)); }}
                placeholder="이메일 입력 (쉼표나 Enter로 여러 명)"
                autoFocus
                autoComplete="off"
                data-testid="share-emails"
              />
              {showSuggestions ? (
                <ul id="share-suggestions" role="listbox" className="mt-1 overflow-hidden rounded-md border border-line bg-elevated shadow-sm" data-testid="share-suggestions">
                  {suggestions.map((s, i) => {
                    const r = infoFor(s.email);
                    const self = isSelf(s.email);
                    return (
                      <li key={s.email} id={`share-suggestion-${i}`} role="option" aria-selected={i === active} aria-disabled={self}>
                        <button
                          type="button"
                          disabled={self}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => add([s.email])}
                          className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === active && !self && 'bg-muted', self && 'cursor-not-allowed opacity-70')}
                        >
                          <Avatar info={r} email={s.email} loading={!r && !s.recent} />
                          <PersonText info={r} email={s.email} />
                          <span className="ml-auto shrink-0 text-[12px] text-ink-3">
                            {self ? <span className="text-bad-ink">본인</span> : !r ? '확인 중…' : r.registered ? (s.recent ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> 최근</span> : '가입한 사용자') : '아직 가입 전'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {notice ? <p className="mt-1.5 flex items-center gap-1 text-[12px] text-bad-ink" role="alert" data-testid="share-notice"><AlertCircle className="h-3.5 w-3.5" /> {notice}</p> : null}

              {emails.length ? (
                <ul className="mt-2 divide-y divide-line rounded-md border border-line" data-testid="share-recipients">
                  {emails.map((e) => {
                    const r = infoFor(e);
                    const bad = !EMAIL_RE.test(e);
                    const self = isSelf(e);
                    return (
                      <li key={e} className="flex items-center gap-3 px-3 py-2" data-registered={r?.registered ? 'true' : 'false'}>
                        <Avatar info={r} email={e} bad={bad || self} loading={!bad && !r} />
                        <PersonText info={r} email={e} />
                        <span className={cn('ml-auto shrink-0 text-[12px]', bad || self ? 'text-bad-ink' : 'text-ink-3')}>
                          {bad ? '이메일 형식 아님' : self ? '본인 · 보낼 수 없음' : !r ? '확인 중…' : r.registered ? '가입한 사용자' : '가입 전 · 가입하면 받아요'}
                        </span>
                        <Button variant="ghost" size="iconSm" aria-label={`${e} 빼기`} onClick={() => setEmails((p) => p.filter((x) => x !== e))}><X className="h-3.5 w-3.5" /></Button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <div>
              <Label htmlFor="share-message" className="block">메시지 (선택)</Label>
              <Textarea id="share-message" className="mt-1" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="함께 보낼 말" />
            </div>
            <ul className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-[12px] text-ink-2">
              <li>· 지금 내용 그대로 복사해서 보냅니다. 보낸 뒤에 고쳐도 상대에게는 반영되지 않습니다.</li>
              <li>· 내 학습 기록(복습, 메모, 표시, 보류)은 보내지 않습니다. 상대는 처음부터 학습합니다.</li>
              <li>· 상대가 30일 안에 수락하면 상대 계정에 복사됩니다. 가입하지 않은 주소라면 가입한 뒤에 받습니다.</li>
            </ul>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!canSend} data-testid="share-send"><Send className="h-4 w-4" /> {emails.length ? `${emails.length}명에게 보내기` : '보내기'}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Avatar({ info, email, bad, loading }: { info?: RecipientInfo; email: string; bad?: boolean; loading?: boolean }) {
  const base = 'grid h-8 w-8 shrink-0 place-items-center rounded-full';
  if (bad) return <span className={cn(base, 'bg-bad-soft text-bad-ink')}><AlertCircle className="h-4 w-4" /></span>;
  if (loading) return <span className={cn(base, 'animate-pulse bg-muted')} />;
  if (info?.registered && info.image) {
    // eslint-disable-next-line @next/next/no-img-element -- external avatar, no optimisation needed
    return <img src={info.image} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full" />;
  }
  if (info?.registered) return <span className={cn(base, 'bg-accent-soft text-[13px] font-semibold text-accent-soft-ink')}>{(info.name?.trim() || email).slice(0, 1).toUpperCase()}</span>;
  return <span className={cn(base, 'bg-muted text-ink-3')}><Mail className="h-4 w-4" /></span>;
}

function PersonText({ info, email }: { info?: RecipientInfo; email: string }) {
  const name = info?.registered ? info.name : null;
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium">{name ?? email}</span>
      {name ? <span className="block truncate text-[12px] text-ink-3">{email}</span> : null}
    </span>
  );
}
