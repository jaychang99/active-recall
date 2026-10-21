'use client';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { THEME_COLORS } from '@/lib/theme-colors';

/** Browser/PWA chrome follows the app's chosen theme, even when it differs from the OS theme. */
export function BrowserTheme() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const scheme = resolvedTheme === 'dark' ? 'dark' : 'light';
    const update = () => {
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        if (meta.content !== THEME_COLORS[scheme]) meta.content = THEME_COLORS[scheme];
        // An OS media query must not override a theme selected inside the app.
        if (meta.hasAttribute('media')) meta.removeAttribute('media');
      }
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="color-scheme"]')) {
        if (meta.content !== scheme) meta.content = scheme;
      }
    };
    update();
    // Next may refresh head metadata during navigation; keep newly rendered tags in sync too.
    const observer = new MutationObserver(update);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'media', 'name'] });
    return () => observer.disconnect();
  }, [resolvedTheme]);
  return null;
}
