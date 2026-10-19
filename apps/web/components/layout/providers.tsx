'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ShortcutProvider } from '@/lib/shortcuts/provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsProvider } from '@/components/layout/settings-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <SettingsProvider>
          <ShortcutGate>
            <TooltipProvider>{children}</TooltipProvider>
          </ShortcutGate>
        </SettingsProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ShortcutGate({ children }: { children: React.ReactNode }) {
  // Settings are read lazily; shortcuts stay enabled until settings say otherwise.
  return <ShortcutProvider>{children}</ShortcutProvider>;
}
