'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, BookOpen, FolderTree, GraduationCap, Home, Keyboard, Layers, Menu, Settings, Upload } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/lib/shortcuts/provider';
import { ThemeToggle } from './theme-toggle';
import { CopyPromptButton } from './copy-prompt-button';
import { CommandPalette } from './command-palette';
import { ShortcutHelp } from './shortcut-help';
import { Button } from '@/components/ui/button';
import { useSettings } from './settings-context';

export const NAV = [
  { href: '/', label: '대시보드', icon: Home, key: 'g d' },
  { href: '/decks', label: '덱', icon: Layers, key: 'g k' },
  { href: '/subjects', label: '과목', icon: FolderTree, key: 'g s' },
  { href: '/exam', label: '시험', icon: GraduationCap, key: 'g e' },
  { href: '/import', label: '가져오기', icon: Upload, key: 'g i' },
  { href: '/insights', label: '통계', icon: BarChart3, key: 'g n' },
  { href: '/settings', label: '설정', icon: Settings, key: 'g ,' },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const { settings } = useSettings();
  const focus = pathname.startsWith('/study') || pathname.startsWith('/exam/run');

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

  return (
    <div className="flex min-h-dvh">
      {!focus ? (
        <aside className={cn('fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-line bg-sunken/60 transition-transform md:static md:translate-x-0', mobileNav ? 'translate-x-0' : '-translate-x-full')} aria-label="주 메뉴">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" onClick={() => setMobileNav(false)}>
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-ink"><BookOpen className="h-4 w-4" /></span>
              Recall Studio
            </Link>
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
        <header className={cn('sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur md:px-6', focus && 'h-12')}>
          {!focus ? (
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="메뉴 열기" onClick={() => setMobileNav(true)}>
              <Menu className="h-4 w-4" />
            </Button>
          ) : (
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-accent" /> Recall Studio</Link>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <CopyPromptButton compact={focus} />
            <Button variant="ghost" size="icon" aria-label="단축키 도움말" onClick={() => setHelpOpen(true)}>
              <Keyboard className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className={cn('flex-1', focus ? 'px-3 py-4 md:px-6' : 'px-4 py-6 md:px-8')}>{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={(href) => { setPaletteOpen(false); router.push(href); }} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
