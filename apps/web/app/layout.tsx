import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/providers';
import { Shell } from '@/components/layout/shell';
import { THEME_COLORS } from '@/lib/theme-colors';

export const metadata: Metadata = {
  title: { default: 'Recall Studio', template: '%s · Recall Studio' },
  description: 'Keyboard-first active recall workstation with FSRS spaced repetition.',
  applicationName: 'Recall Studio',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Recall Studio' },
  icons: { icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
};

// Local-first app: every page reads live API data / search params, so nothing is statically prerendered.
export const dynamic = 'force-dynamic';

// SSR matches the app's default (light); BrowserTheme updates this to the saved/selected theme.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: THEME_COLORS.light, colorScheme: 'light' };

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
