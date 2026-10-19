'use client';
import { Download } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Ctx = createContext<{ canInstall: boolean; installed: boolean; install: () => Promise<void> }>({ canInstall: false, installed: false, install: async () => {} });

/** Registers the service worker (production only) and exposes the browser's install prompt. */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); toast.success('Recall Studio가 앱으로 설치되었습니다'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              toast('새 버전이 준비되었습니다', { action: { label: '새로고침', onClick: () => { sw.postMessage('SKIP_WAITING'); window.location.reload(); } } });
            }
          });
        });
      }).catch(() => undefined);
    }
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setDeferred(null);
  };
  return <Ctx.Provider value={{ canInstall: !!deferred && !installed, installed, install }}>{children}</Ctx.Provider>;
}

export function usePwa() {
  return useContext(Ctx);
}

export function InstallAppButton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { canInstall, installed, install } = usePwa();
  if (installed) return <span className="text-[12px] text-ink-3">앱으로 실행 중</span>;
  if (!canInstall) return null;
  return <Button size={size} variant="soft" onClick={() => void install()} data-testid="install-app"><Download className="h-4 w-4" /> 앱으로 설치</Button>;
}
