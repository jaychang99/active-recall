import { NextResponse, type NextRequest } from 'next/server';
import { isLegalPage } from '@/lib/public-pages';

/**
 * UX guard only: send signed-out visitors straight to /login instead of letting pages render and then
 * bounce on the first 401. The real enforcement is the API's bearer-token guard.
 */
const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isLegalPage(pathname)) return NextResponse.next();
  const signedIn = SESSION_COOKIES.some((c) => req.cookies.has(c));
  if (pathname === '/login') {
    if (signedIn) return NextResponse.redirect(new URL(req.nextUrl.searchParams.get('next') || '/', req.url));
    return NextResponse.next();
  }
  if (!signedIn) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // everything except Auth.js / token routes, Next internals, the service worker, manifest and static files
  matcher: ['/((?!api/|_next/|sw\\.js|manifest\\.webmanifest|offline|icons/|favicon\\.ico|.*\\.(?:png|svg|ico|txt|json)$).*)'],
};
