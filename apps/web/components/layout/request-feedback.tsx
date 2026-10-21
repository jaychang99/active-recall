'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { activitySnapshot, idleActivitySnapshot, subscribeActivity } from '@/lib/request-activity';
import { ProgressBar, Spinner } from '@/components/ui/loading';

export function RequestFeedback() {
  const activity = useSyncExternalStore(subscribeActivity, activitySnapshot, idleActivitySnapshot);
  const busy = Object.values(activity).some(Boolean);
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { setVisible(false); setSlow(false); return; }
    const show = setTimeout(() => setVisible(true), 300);
    const longer = setTimeout(() => setSlow(true), 6_000);
    return () => { clearTimeout(show); clearTimeout(longer); };
  }, [busy]);
  if (!busy || !visible) return null;
  const label = activity.write ? '서버에서 처리 중…' : activity.download ? '다운로드 파일 준비 중…' : activity.navigation ? '페이지 여는 중…' : '데이터 불러오는 중…';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100]" data-testid="request-feedback">
      <ProgressBar label={label} className="h-0.5 rounded-none" />
      <div role="status" aria-live="polite" className="absolute top-16 right-3 max-w-[calc(100vw-1.5rem)] rounded-lg border border-line bg-elevated px-3 py-2 text-[12px] text-ink-2 shadow-card">
        <div className="flex items-center gap-2"><Spinner className="h-3.5 w-3.5 text-accent" /><span>{label}</span></div>
        {slow ? <p className="mt-1 text-ink-3">서버 응답을 기다리고 있습니다. 잠시만 기다려 주세요.</p> : null}
      </div>
    </div>
  );
}
