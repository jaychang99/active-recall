/**
 * Auth.js (next-auth v5) — session lives in an encrypted JWT cookie on the web origin; no database.
 * Identity = provider + providerSub ("google" + Google `sub`, or "dev" + e-mail for the local dev login).
 * The API never sees this cookie: `GET /api/token` turns the session into a short-lived bearer token.
 */
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

export const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
/** Local development / e2e only: any e-mail signs in as a "dev" user. Never enable this in production. */
export const devLoginEnabled = process.env.AUTH_DEV_LOGIN === '1';
if (devLoginEnabled && process.env.VERCEL_ENV === 'production') throw new Error('AUTH_DEV_LOGIN must not be set in production');

const providers: NextAuthConfig['providers'] = [];
if (googleEnabled) providers.push(Google({ allowDangerousEmailAccountLinking: false }));
if (devLoginEnabled)
  providers.push(
    Credentials({
      id: 'dev',
      name: '개발용 로그인',
      credentials: { email: { label: 'E-mail', type: 'email' } },
      authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
        return { id: `dev:${email}`, email, name: email.split('@')[0] ?? email };
      },
    }),
  );

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login' },
  trustHost: true,
  callbacks: {
    jwt({ token, account, user, profile }) {
      if (account) {
        token.provider = account.provider === 'google' ? 'google' : 'dev';
        token.providerSub = account.provider === 'google' ? account.providerAccountId : String(user?.email ?? token.email ?? '');
        const picture = (profile as { picture?: string } | undefined)?.picture ?? user?.image ?? null;
        if (picture) token.picture = picture;
      }
      return token;
    },
    session({ session, token }) {
      session.provider = typeof token.provider === 'string' ? token.provider : '';
      session.providerSub = typeof token.providerSub === 'string' ? token.providerSub : '';
      return session;
    },
  },
});
