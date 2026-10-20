'use client';
import { LogOut, UserRound } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/tooltip';
import { clearApiToken } from '@/lib/auth-token';

function initials(name: string | null | undefined, email: string | null | undefined) {
  const src = (name?.trim() || email || '?').trim();
  return src.slice(0, 1).toUpperCase();
}

export function UserMenu() {
  const { data, status } = useSession();
  const qc = useQueryClient();
  if (status !== 'authenticated' || !data?.user) return null;
  const { user } = data;
  const logout = async () => {
    clearApiToken();
    qc.clear();
    try { window.sessionStorage.clear(); } catch { /* storage unavailable */ }
    await signOut({ redirectTo: '/login' });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`계정: ${user.email ?? ''}`} data-testid="user-menu">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- external avatar, no optimisation needed
            <img src={user.image} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
          ) : (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-soft-ink">{initials(user.name, user.email)}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <span className="flex items-center gap-2 text-ink"><UserRound className="h-3.5 w-3.5 text-ink-3" /> {user.name ?? user.email}</span>
          <span className="block truncate font-normal text-ink-3">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()} data-testid="logout"><LogOut className="h-4 w-4 text-ink-3" /> 로그아웃</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
