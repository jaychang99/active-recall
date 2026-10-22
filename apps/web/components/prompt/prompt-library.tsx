'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PROMPT_LIBRARY_KEY, promptSnapshotName, type PromptSnapshot, type PromptSnapshotPage } from '@/lib/prompt-library';
import { renderConfigBlock, resolvePromptOptions, type PromptOptions } from '@/lib/prompt-options';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Panel } from '@/components/ui/misc';

export function PromptLibrary({ value, onLoad, loaded }: { value: PromptOptions; onLoad: (options: PromptOptions) => void; loaded: boolean }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'history' | 'preset'>('history');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ options: PromptOptions; id?: string } | null>(null);
  const [name, setName] = useState('');
  const list = useInfiniteQuery({
    queryKey: [...PROMPT_LIBRARY_KEY, kind, search], initialPageParam: 0,
    queryFn: ({ pageParam }) => api<PromptSnapshotPage>(`/prompt-library?${new URLSearchParams({ kind, search, offset: String(pageParam) })}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: PROMPT_LIBRARY_KEY });
  const save = useMutation({
    mutationFn: () => editor?.id
      ? api(`/prompt-library/${editor.id}`, { method: 'PATCH', json: { name: name.trim() } })
      : api('/prompt-library', { method: 'POST', json: { kind: 'preset', name: name.trim(), options: editor?.options } }),
    onSuccess: () => { refresh(); setEditor(null); toast.success(editor?.id ? '프리셋 이름을 변경했습니다' : '프리셋을 저장했습니다'); },
    onError: (e: Error) => toast.error('프리셋을 저장하지 못했습니다', { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/prompt-library/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refresh(); toast.success('삭제했습니다'); },
    onError: (e: Error) => toast.error('삭제하지 못했습니다', { description: e.message }),
  });
  const openSave = (options: PromptOptions, title = promptSnapshotName(options), id?: string) => {
    setName(title); setEditor({ options: resolvePromptOptions(options), id });
  };
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Panel id="prompt-library" className="scroll-mt-20 p-4" data-testid="prompt-library">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink-2">설정 보관함</h2>
        <Button size="sm" onClick={() => openSave(value)} disabled={!loaded} data-testid="prompt-save-preset">현재 설정을 프리셋으로 저장</Button>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">복사 이력과 프리셋은 전체 설정을 각각 보관합니다. 개수 제한 없이 저장되며 직접 삭제할 수 있습니다.</p>
      <div className="my-3 flex gap-2" role="group" aria-label="설정 보관함 종류">
        <Button size="sm" variant={kind === 'history' ? 'primary' : 'secondary'} aria-pressed={kind === 'history'} onClick={() => setKind('history')}>복사 이력</Button>
        <Button size="sm" variant={kind === 'preset' ? 'primary' : 'secondary'} aria-pressed={kind === 'preset'} onClick={() => setKind('preset')}>프리셋</Button>
      </div>
      <Input aria-label="이력·프리셋 이름 검색" placeholder="이름으로 검색" maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="mt-3 max-h-[34rem] space-y-3 overflow-y-auto" aria-live="polite">
        {list.isPending ? <p className="text-sm text-ink-3">불러오는 중…</p> : null}
        {list.isError ? <div className="text-sm text-ink-3">보관함을 불러오지 못했습니다. <Button size="sm" onClick={() => void list.refetch()}>다시 시도</Button></div> : null}
        {!list.isPending && !list.isError && !items.length ? <p className="text-sm text-ink-3">{search ? '검색 결과가 없습니다.' : kind === 'history' ? '프롬프트를 복사하면 전체 설정이 여기에 저장됩니다.' : '자주 쓰는 설정을 프리셋으로 저장해 보세요.'}</p> : null}
        {items.map((item: PromptSnapshot) => (
          <article key={item.id} className="rounded-md border border-line p-3" data-testid="prompt-snapshot">
            <h3 className="break-words text-sm font-medium">{item.name}</h3>
            <p className="mt-1 text-[11px] text-ink-3">{new Date(item.createdAt).toLocaleString('ko-KR')} {item.copyKind ? `· ${item.copyKind === 'bundle' ? '프롬프트 + 스키마' : '프롬프트만'}` : ''}</p>
            <p className="mt-1 break-words text-[12px] text-ink-2">{item.optionsJson.sourceMode === 'general_knowledge' ? '일반 지식' : '제공된 자료'} · {item.optionsJson.numberOfQuestions === 'auto' ? '전체 범위' : `${item.optionsJson.numberOfQuestions}문항`} · 언어 {item.optionsJson.outputLanguage}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" onClick={() => { onLoad(resolvePromptOptions(item.optionsJson)); toast.success('전체 설정을 불러왔습니다', { description: '필요한 값을 수정한 뒤 복사하세요.' }); }} data-testid="prompt-snapshot-load">불러오기</Button>
              {kind === 'history' ? <Button size="sm" variant="ghost" onClick={() => openSave(item.optionsJson, item.name)}>프리셋으로 저장</Button> : <Button size="sm" variant="ghost" onClick={() => openSave(item.optionsJson, item.name, item.id)}>이름 변경</Button>}
              <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(item.id)} aria-label={`${item.name} 삭제`}>삭제</Button>
            </div>
            <details className="mt-2 text-[12px] text-ink-3">
              <summary className="cursor-pointer">전체 설정 보기</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre rounded bg-sunken p-2 text-[11px]">{renderConfigBlock(resolvePromptOptions(item.optionsJson))}</pre>
            </details>
          </article>
        ))}
        {list.hasNextPage ? <Button size="sm" className="w-full" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}</Button> : null}
      </div>
      <Dialog open={!!editor} onOpenChange={(open) => { if (!open && !save.isPending) setEditor(null); }}>
        <DialogContent title={editor?.id ? '프리셋 이름 변경' : '프리셋으로 저장'} description="복사 이력과 별도로 보관되며, 저장된 전체 설정을 다시 불러올 수 있습니다.">
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}>
            <Label htmlFor="prompt-preset-name">프리셋 이름</Label>
            <Input id="prompt-preset-name" className="mt-1" autoFocus required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} />
            <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={() => setEditor(null)} disabled={save.isPending}>취소</Button><Button type="submit" variant="primary" disabled={!name.trim() || save.isPending} loading={save.isPending}>저장</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
