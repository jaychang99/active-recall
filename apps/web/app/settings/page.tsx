'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { API_URL, api, type Settings } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/checkbox';
import { ErrorState, PageHeader, Panel, Skeleton } from '@/components/ui/misc';

function Row({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="grid gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div><Label htmlFor={id}>{label}</Label>{hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}</div>
      <div className="sm:w-56">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const [form, setForm] = useState<Partial<Settings>>({});
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => api<Settings>('/settings', { method: 'PATCH', json: patch }),
    onSuccess: (s) => { qc.setQueryData(['settings'], s); setForm(s); toast.success('설정을 저장했습니다'); },
    onError: (e: Error) => toast.error('저장 실패', { description: e.message }),
  });
  const restore = useMutation({
    mutationFn: async (file: File) => api('/exports/restore?force=true', { method: 'POST', json: JSON.parse(await file.text()) }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('백업을 복원했습니다'); },
    onError: (e: Error) => toast.error('복원 실패', { description: e.message }),
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const submit = () => {
    const patch = { ...form } as Partial<Settings>;
    delete patch.updatedAt;
    save.mutate(patch);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="설정" description="로컬 단일 프로필 설정입니다. 아래 값은 저장 버튼을 눌러야 반영됩니다." actions={<Button variant="primary" onClick={submit} disabled={save.isPending} data-testid="save-settings">{save.isPending ? '저장 중…' : '저장'}</Button>} />
      <Panel className="mb-6 px-5 py-2">
        <h2 className="pt-3 text-[13px] font-semibold text-ink-2">화면</h2>
        <Row label="테마" hint="바로 적용되고 이 브라우저에 저장됩니다 (저장 버튼과 무관)." id="theme">
          <Select id="theme" className="w-full" value={mounted ? (theme ?? 'light') : 'light'} onChange={(e) => setTheme(e.target.value)} aria-label="테마"><option value="light">라이트</option><option value="dark">다크</option><option value="system">시스템</option></Select>
        </Row>
        <Row label="키보드 단축키" hint="끄면 숫자·Space·Enter 단축키가 동작하지 않습니다." id="shortcutsEnabled"><Switch id="shortcutsEnabled" checked={form.shortcutsEnabled ?? true} onCheckedChange={(v) => set('shortcutsEnabled', v)} aria-label="단축키" /></Row>
        <Row label="평가 버튼에 다음 간격 표시" hint="Anki처럼 Again/Hard/Good/Easy 아래 예상 간격을 보여줍니다." id="showIntervalPreview"><Switch id="showIntervalPreview" checked={form.showIntervalPreview ?? true} onCheckedChange={(v) => set('showIntervalPreview', v)} /></Row>
        <Row label="평가 후 자동으로 다음 문제" hint="끄면 평가 후 N 키나 버튼으로 넘어갑니다." id="autoAdvanceAfterRating"><Switch id="autoAdvanceAfterRating" checked={form.autoAdvanceAfterRating ?? true} onCheckedChange={(v) => set('autoAdvanceAfterRating', v)} /></Row>
        <Row label="보기 순서 섞기" hint="선택지 ID는 바뀌지 않습니다." id="shuffleChoices"><Switch id="shuffleChoices" checked={form.shuffleChoices ?? true} onCheckedChange={(v) => set('shuffleChoices', v)} /></Row>
      </Panel>
      <Panel className="mb-6 px-5 py-2">
        <h2 className="pt-3 text-[13px] font-semibold text-ink-2">학습량</h2>
        <Row label="하루 새 카드 상한" id="newCardsPerDay"><Input id="newCardsPerDay" type="number" min={0} max={1000} value={form.newCardsPerDay ?? 20} onChange={num('newCardsPerDay')} /></Row>
        <Row label="하루 복습 상한" id="reviewsPerDay"><Input id="reviewsPerDay" type="number" min={0} max={5000} value={form.reviewsPerDay ?? 200} onChange={num('reviewsPerDay')} /></Row>
        <Row label="하루 복습 목표" hint="대시보드 진행도에 표시됩니다." id="dailyReviewGoal"><Input id="dailyReviewGoal" type="number" min={0} value={form.dailyReviewGoal ?? 50} onChange={num('dailyReviewGoal')} /></Row>
        <Row label="새 카드 순서" id="newCardOrder"><Select id="newCardOrder" className="w-full" value={form.newCardOrder ?? 'deck'} onChange={(e) => set('newCardOrder', e.target.value)}><option value="deck">덱 순서</option><option value="random">무작위</option></Select></Row>
        <Row label="리치(leech) 기준 실패 횟수" id="leechThreshold"><Input id="leechThreshold" type="number" min={1} value={form.leechThreshold ?? 8} onChange={num('leechThreshold')} /></Row>
        <Row label="시간대" hint="하루 경계(새 카드 상한, 통계)에 사용됩니다. IANA 이름." id="timezone"><Input id="timezone" value={form.timezone ?? ''} onChange={(e) => set('timezone', e.target.value)} placeholder="Asia/Seoul" /></Row>
      </Panel>
      <Panel className="mb-6 px-5 py-2">
        <h2 className="pt-3 text-[13px] font-semibold text-ink-2">FSRS 스케줄러 (ts-fsrs)</h2>
        <Row label="목표 기억률 (request retention)" hint="0.70–0.98. 높을수록 복습이 잦아집니다." id="requestRetention"><Input id="requestRetention" type="number" step={0.01} min={0.7} max={0.98} value={form.requestRetention ?? 0.9} onChange={num('requestRetention')} /></Row>
        <Row label="최대 간격 (일)" id="maximumInterval"><Input id="maximumInterval" type="number" min={1} max={36500} value={form.maximumInterval ?? 36500} onChange={num('maximumInterval')} /></Row>
        <Row label="간격 퍼지(fuzz)" hint="같은 날 몰리지 않도록 간격을 약간 흔듭니다." id="enableFuzz"><Switch id="enableFuzz" checked={form.enableFuzz ?? false} onCheckedChange={(v) => set('enableFuzz', v)} /></Row>
      </Panel>
      <Panel className="px-5 py-4">
        <h2 className="text-[13px] font-semibold text-ink-2">데이터</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`${API_URL}/exports/backup.json`} download="recall-studio-backup.json"><Button><Download className="h-4 w-4" /> 전체 백업 (JSON)</Button></a>
          <a href={`${API_URL}/exports/reviews.csv`} download="reviews.csv"><Button><Download className="h-4 w-4" /> 복습 기록 CSV</Button></a>
          <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> 백업 복원</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && confirm('백업을 복원하면 같은 ID의 데이터가 덮어써집니다. 계속할까요?')) restore.mutate(f); e.target.value = ''; }} />
          <a href={`${API_URL}/docs`} target="_blank" rel="noreferrer"><Button variant="ghost">API 문서 (Swagger)</Button></a>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">API는 인증이 없으므로 localhost 밖으로 노출하지 마세요.</p>
      </Panel>
    </div>
  );
}
