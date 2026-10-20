/** Pages that render without a session (no API calls, no app shell). Policies must be readable signed out — Google's OAuth review checks them. */
export const LEGAL_PAGES = ['/privacy', '/terms'] as const;

export function isLegalPage(pathname: string): boolean {
  return (LEGAL_PAGES as readonly string[]).includes(pathname);
}

/** Login + legal pages: rendered bare, without settings/API queries. */
export function isBarePage(pathname: string): boolean {
  return pathname === '/login' || isLegalPage(pathname);
}
