'use client';
import Link from '@/components/ui/navigation-link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Database, FolderTree, GraduationCap, Home, Inbox, Keyboard, Layers, Menu, Search, Settings, Share2, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { ThemeToggle } from './theme-toggle';
import { InstallAppButton } from './pwa';
import { CopyPromptButton } from './copy-prompt-button';
import { CommandPalette } from './command-palette';
import { CollectionMenu } from './collection-menu';
import { ShortcutHelp } from './shortcut-help';
import { Button } from '@/components/ui/button';
import { useSettings } from './settings-context';
import { UserMenu } from './user-menu';
import { isBarePage } from '@/lib/public-pages';
import { api } from '@/lib/api';

export const NAV = [
  { href: '/', label: '대시보드', icon: Home, key: 'g d' },
  { href: '/decks', label: '덱', icon: Layers, key: 'g k' },
  { href: '/subjects', label: '과목', icon: FolderTree, key: 'g s' },
  { href: '/shares', label: '공유', icon: Share2, key: 'g h' },
  { href: '/exam', label: '시험', icon: GraduationCap, key: 'g e' },
  { href: '/import', label: '가져오기', icon: Upload, key: 'g i' },
  { href: '/prompt', label: '프롬프트', icon: Sparkles, key: 'g p' },
  { href: '/insights', label: '통계', icon: BarChart3, key: 'g n' },
  { href: '/data', label: '데이터', icon: Database, key: 'g t' },
  { href: '/settings', label: '설정', icon: Settings, key: 'g ,' },
] as const;

/** Product mark: a card with a recall loop (spaced repetition), drawn in the accent. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M8.5 12a3.5 3.5 0 0 1 6.3-2.1" />
      <path d="M15.5 12a3.5 3.5 0 0 1-6.3 2.1" />
      <path d="M15.2 7.8v2.4h-2.4" />
      <path d="M8.8 16.2v-2.4h2.4" />
    </svg>
  );
}

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-ink"><Mark className="h-[18px] w-[18px]" /></span>
      {compact ? <span className="sr-only">Recall Studio</span> : 'Recall Studio'}
    </span>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const { settings } = useSettings();
  const focus = pathname.startsWith('/study') || pathname.startsWith('/exam/run');
  const bare = isBarePage(pathname);
  const sharesPending = useQuery({ queryKey: ['shares', 'count'], queryFn: () => api<{ pending: number }>('/shares/received/count'), enabled: !bare, refetchInterval: 60_000, staleTime: 30_000 }).data?.pending ?? 0;

  useShortcuts(
    'global',
    [
      { keys: 'k', mod: 'ctrlOrMeta', allowInEditable: true, description: '명령 팔레트', group: '전역', handler: () => setPaletteOpen((v) => !v) },
      { keys: '?', description: '단축키 도움말', group: '전역', handler: () => setHelpOpen((v) => !v) },
      { keys: '/', description: '검색 / 명령 팔레트', group: '전역', handler: () => (focus ? false : (setPaletteOpen(true), undefined)) },
      { keys: 'Escape', description: '닫기', group: '전역', handler: () => (paletteOpen || helpOpen || mobileNav ? (setPaletteOpen(false), setHelpOpen(false), setMobileNav(false), undefined) : false) },
    ],
    settings.shortcutsEnabled,
  );

  if (bare) return <main className="px-4 py-6 md:px-8">{children}</main>;
  return (
    <div className="flex min-h-dvh">
      {!focus ? (
        <aside id="app-sidebar" data-testid="sidebar" className={cn('fixed inset-y-0 left-0 z-30 h-dvh w-60 shrink-0 overflow-y-auto overscroll-contain border-r border-line bg-sunken transition-transform md:translate-x-0', mobileNav ? 'translate-x-0' : '-translate-x-full')} aria-label="주 메뉴">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link href="/" className="rounded-md" onClick={() => setMobileNav(false)}><Wordmark /></Link>
          </div>
          <nav className="mt-2 flex flex-col gap-0.5 px-2">
            {NAV.map((n) => {
              if (n.href === '/decks' || n.href === '/subjects') return <CollectionMenu key={n.href} kind={n.href === '/decks' ? 'decks' : 'subjects'} onNavigate={() => setMobileNav(false)} />;
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMobileNav(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors', active ? 'bg-elevated font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-2 hover:bg-muted hover:text-ink')}
                >
                  <n.icon className="h-4 w-4 text-ink-3" />
                  {n.label}
                  {n.href === '/shares' && sharesPending ? <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] leading-[18px] font-medium text-accent-ink tabular" aria-label={`받은 공유 ${sharesPending}건`}>{sharesPending}</span> : null}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 px-4 lg:hidden"><InstallAppButton size="sm" /></div>
          <div className="mt-6 px-4 text-[11px] leading-relaxed text-ink-3">
            <p><kbd className="kbd">⌘K</kbd> 명령 팔레트 · <kbd className="kbd">?</kbd> 단축키</p>
            <p className="mt-2"><Link href="/terms" className="hover:text-ink-2 hover:underline">이용약관</Link> · <Link href="/privacy" className="hover:text-ink-2 hover:underline">개인정보처리방침</Link></p>
          </div>
        </aside>
      ) : null}
      {mobileNav ? <button aria-label="메뉴 닫기" className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setMobileNav(false)} /> : null}

      <div className={cn('flex min-w-0 flex-1 flex-col', !focus && 'md:pl-60')}>
        <header className={cn('sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-line bg-bg px-2 sm:gap-2 md:px-6', focus && 'h-12')}>
          {!focus ? (
            <>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="메뉴 열기" aria-expanded={mobileNav} aria-controls="app-sidebar" onClick={() => setMobileNav(true)}>
                <Menu className="h-4 w-4" />
              </Button>
              <Link href="/" className="rounded-md md:hidden"><Wordmark compact /></Link>
              <Button variant="ghost" className="hidden text-ink-2 lg:inline-flex" onClick={() => setPaletteOpen(true)} aria-label="명령 팔레트 열기">
                <Search className="h-4 w-4 text-ink-3" /> 덱·페이지 이동 <kbd className="kbd ml-1" aria-hidden>⌘K</kbd>
              </Button>
            </>
          ) : (
            <Link href="/" className="flex items-center gap-2 rounded-md text-sm font-semibold"><Mark className="h-5 w-5 text-accent" /> Recall Studio</Link>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            {sharesPending && !focus ? (
              <Link href="/shares" aria-label={`받은 공유 ${sharesPending}건`} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-muted hover:text-ink" data-testid="shares-inbox">
                <Inbox className="h-4 w-4" />
                <span className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-accent-ink tabular">{sharesPending}</span>
              </Link>
            ) : null}
            <CopyPromptButton compact={focus} />
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label="단축키 도움말" onClick={() => setHelpOpen(true)}>
              <Keyboard className="h-4 w-4" />
            </Button>
            <span className="hidden lg:contents"><InstallAppButton size="sm" /></span>
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className={cn('flex-1', focus ? 'px-3 py-4 md:px-6' : 'px-4 py-6 md:px-8')}>{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={(href) => { setPaletteOpen(false); router.push(href); }} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
