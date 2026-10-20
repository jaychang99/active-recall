'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Database, FolderTree, GraduationCap, Home, Keyboard, Layers, Menu, Search, Settings, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { ThemeToggle } from './theme-toggle';
import { InstallAppButton } from './pwa';
import { CopyPromptButton } from './copy-prompt-button';
import { CommandPalette } from './command-palette';
import { ShortcutHelp } from './shortcut-help';
import { Button } from '@/components/ui/button';
import { useSettings } from './settings-context';
import { UserMenu } from './user-menu';

export const NAV = [
  { href: '/', label: '대시보드', icon: Home, key: 'g d' },
  { href: '/decks', label: '덱', icon: Layers, key: 'g k' },
  { href: '/subjects', label: '과목', icon: FolderTree, key: 'g s' },
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
  const bare = pathname === '/login';

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
        <aside className={cn('fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-line bg-sunken/60 transition-transform md:static md:translate-x-0', mobileNav ? 'translate-x-0' : '-translate-x-full')} aria-label="주 메뉴">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link href="/" className="rounded-md" onClick={() => setMobileNav(false)}><Wordmark /></Link>
          </div>
          <nav className="mt-2 flex flex-col gap-0.5 px-2">
            {NAV.map((n) => {
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
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 px-4 text-[11px] leading-relaxed text-ink-3">
            <p><kbd className="kbd">⌘K</kbd> 명령 팔레트 · <kbd className="kbd">?</kbd> 단축키</p>
          </div>
        </aside>
      ) : null}
      {mobileNav ? <button aria-label="메뉴 닫기" className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setMobileNav(false)} /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn('sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-bg px-3 md:px-6', focus && 'h-12')}>
          {!focus ? (
            <>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="메뉴 열기" onClick={() => setMobileNav(true)}>
                <Menu className="h-4 w-4" />
              </Button>
              <Link href="/" className="rounded-md md:hidden"><Wordmark /></Link>
              <Button variant="ghost" className="hidden text-ink-2 md:inline-flex" onClick={() => setPaletteOpen(true)} aria-label="명령 팔레트 열기">
                <Search className="h-4 w-4 text-ink-3" /> 덱·페이지 이동 <kbd className="kbd ml-1" aria-hidden>⌘K</kbd>
              </Button>
            </>
          ) : (
            <Link href="/" className="flex items-center gap-2 rounded-md text-sm font-semibold"><Mark className="h-5 w-5 text-accent" /> Recall Studio</Link>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <CopyPromptButton compact={focus} />
            <Button variant="ghost" size="icon" aria-label="단축키 도움말" onClick={() => setHelpOpen(true)}>
              <Keyboard className="h-4 w-4" />
            </Button>
            <InstallAppButton size="sm" />
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
