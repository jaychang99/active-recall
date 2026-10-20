import type { Metadata } from 'next';
import { devLoginEnabled, googleEnabled } from '@/auth';
import { LoginForm } from '@/components/layout/login-form';

export const metadata: Metadata = { title: '로그인' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  return <LoginForm google={googleEnabled} dev={devLoginEnabled} next={next} error={sp.error ?? null} />;
}
