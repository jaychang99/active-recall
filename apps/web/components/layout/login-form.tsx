'use client';
import { signIn } from 'next-auth/react';
import Link from '@/components/ui/navigation-link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Panel } from '@/components/ui/misc';
import { Wordmark } from './shell';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.5-1.5-.5-3.1 0-4.6V6.6H1.3c-1.7 3.4-1.7 7.4 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: '같은 이메일이 다른 방식으로 이미 가입되어 있습니다.',
  AccessDenied: '접근이 거부되었습니다.',
  CredentialsSignin: '이메일 형식을 확인하세요.',
  Configuration: '로그인 설정 오류입니다. 서버 환경변수를 확인하세요.',
};

export function LoginForm({ google, dev, next, error }: { google: boolean; dev: boolean; next: string; error: string | null }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'dev' | null>(null);
  const message = error ? (ERRORS[error] ?? '로그인에 실패했습니다. 다시 시도하세요.') : null;
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center py-12" data-testid="login">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Wordmark />
        <p className="text-sm text-ink-3">문제 묶음을 가져와 간격 반복으로 복습하는 학습 도구</p>
      </div>
      <Panel className="p-6">
        <h1 className="text-lg font-semibold">로그인</h1>
        <p className="mt-1 text-sm text-ink-3">덱, 복습 기록, 메모는 로그인한 계정에만 저장됩니다.</p>
        {message ? <p className="mt-3 rounded-md bg-bad-soft px-3 py-2 text-[13px] text-bad-ink" role="alert">{message}</p> : null}
        <div className="mt-5 space-y-3">
          {google ? (
            <Button className="w-full" size="lg" loading={busy === 'google'} disabled={busy !== null} data-testid="google-login" onClick={() => { setBusy('google'); void signIn('google', { redirectTo: next }); }}>
              <GoogleMark /> {busy === 'google' ? 'Google로 이동 중…' : 'Google로 계속하기'}
            </Button>
          ) : null}
          {dev ? (
            <form
              className="space-y-2 rounded-md border border-dashed border-line p-3"
              onSubmit={(e) => { e.preventDefault(); setBusy('dev'); void signIn('dev', { email, redirectTo: next }); }}
            >
              <Label htmlFor="dev-email">개발용 로그인 (로컬 전용)</Label>
              <Input id="dev-email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="dev-email" autoComplete="email" />
              <Button type="submit" variant="soft" className="w-full" loading={busy === 'dev'} disabled={busy !== null} data-testid="dev-login">{busy === 'dev' ? '로그인 중…' : '이 이메일로 로그인'}</Button>
              <p className="text-[11px] text-ink-3">비밀번호 없이 아무 이메일로 들어갑니다. 프로덕션에서는 꺼져 있습니다.</p>
            </form>
          ) : null}
          {!google && !dev ? <p className="text-sm text-warn-ink">로그인 방법이 설정되지 않았습니다. <code>AUTH_GOOGLE_ID</code>/<code>AUTH_GOOGLE_SECRET</code> 또는 <code>AUTH_DEV_LOGIN=1</code>을 설정하세요.</p> : null}
        </div>
      </Panel>
      <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">
        로그인하면 <Link href="/terms" className="underline underline-offset-4 hover:text-ink">이용약관</Link>과{' '}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">개인정보처리방침</Link>에 동의하는 것으로 봅니다.
      </p>
    </div>
  );
}
