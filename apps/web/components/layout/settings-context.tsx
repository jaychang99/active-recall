'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { createContext, useContext } from 'react';
import { api, type Settings } from '@/lib/api';

const DEFAULTS: Settings = {
  newCardsPerDay: 20, reviewsPerDay: 200, timezone: 'Asia/Seoul', shortcutsEnabled: true, showIntervalPreview: true, autoAdvanceAfterRating: true,
  requestRetention: 0.9, maximumInterval: 36500, enableFuzz: false, shuffleChoices: true, newCardOrder: 'deck', dailyReviewGoal: 50, leechThreshold: 8, promptDefaults: null, updatedAt: '',
};

const Ctx = createContext<{ settings: Settings; loaded: boolean; refresh: () => void }>({ settings: DEFAULTS, loaded: false, refresh: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const pathname = usePathname();
  // The login page has no session yet: asking the API there would only bounce back to /login.
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings'), staleTime: 60_000, enabled: pathname !== '/login' });
  return <Ctx.Provider value={{ settings: q.data ?? DEFAULTS, loaded: !!q.data, refresh: () => void qc.invalidateQueries({ queryKey: ['settings'] }) }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}
