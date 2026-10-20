import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { mintApiToken } from '@/lib/server/api-token';

export const dynamic = 'force-dynamic';

/** Exchanges the Auth.js session cookie for a short-lived API bearer token. */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!session || !email || !session.provider || !session.providerSub) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign in first' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const minted = await mintApiToken({ provider: session.provider, providerSub: session.providerSub, email, name: session.user?.name ?? null, picture: session.user?.image ?? null });
  return NextResponse.json(minted, { headers: { 'Cache-Control': 'no-store' } });
}
