import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/providers';
import { Shell } from '@/components/layout/shell';

export const metadata: Metadata = {
  title: { default: 'Recall Studio', template: '%s · Recall Studio' },
  description: 'Keyboard-first active recall workstation with FSRS spaced repetition.',
};

// Local-first app: every page reads live API data / search params, so nothing is statically prerendered.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f7f8f7' }, { media: '(prefers-color-scheme: dark)', color: '#121716' }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
