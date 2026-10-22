'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import Link from '@/components/ui/navigation-link';
import { api } from '@/lib/api';
import { PROMPT_LIBRARY_KEY, type PromptSnapshotPage } from '@/lib/prompt-library';
import { renderConfigBlock, resolvePromptOptions } from '@/lib/prompt-options';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/ui/misc';
import { PromptPresetDialog, type PresetEditor } from './prompt-preset-dialog';

/** A document-scrolling list. No nested vertical scroll area or sticky container. */
export function PromptLibrary() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<'history' | 'preset'>('history');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  const list = useInfiniteQuery({
    queryKey: [...PROMPT_LIBRARY_KEY, kind, search], initialPageParam: 0,
    queryFn: ({ pageParam }) => api<PromptSnapshotPage>(`/prompt-library?${new URLSearchParams({ kind, search, offset: String(pageParam) })}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/prompt-library/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: PROMPT_LIBRARY_KEY }); toast.success('삭제했습니다'); },
    onError: (e: Error) => toast.error('삭제하지 못했습니다', { description: e.message }),
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Panel className="p-4 sm:p-5" data-testid="prompt-library">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="설정 보관함 종류">
          <Button size="sm" variant={kind === 'history' ? 'primary' : 'secondary'} aria-pressed={kind === 'history'} onClick={() => setKind('history')}>복사 이력</Button>
          <Button size="sm" variant={kind === 'preset' ? 'primary' : 'secondary'} aria-pressed={kind === 'preset'} onClick={() => setKind('preset')}>프리셋</Button>
        </div>
        <Input className="sm:w-72" aria-label="이력·프리셋 이름 검색" placeholder="이름으로 검색" maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div aria-live="polite">
        {list.isPending ? <p className="py-6 text-sm text-ink-3">불러오는 중…</p> : null}
        {list.isError ? <div className="py-6 text-sm text-ink-3">보관함을 불러오지 못했습니다. <Button size="sm" onClick={() => void list.refetch()}>다시 시도</Button></div> : null}
        {!list.isPending && !list.isError && !items.length ? <p className="py-6 text-sm text-ink-3">{search ? '검색 결과가 없습니다.' : kind === 'history' ? '프롬프트를 복사하면 전체 설정이 여기에 저장됩니다.' : '프롬프트 화면에서 자주 쓰는 설정을 프리셋으로 저장해 보세요.'}</p> : null}
        <ol className="divide-y divide-line" aria-label={kind === 'history' ? '복사 이력 목록' : '프리셋 목록'}>
          {items.map((item) => (
            <li key={item.id} className="py-4" data-testid="prompt-snapshot">
              <article>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-medium">{item.name}</h2>
                    <p className="mt-1 text-[12px] text-ink-3">{new Date(item.createdAt).toLocaleString('ko-KR')}{item.copyKind ? ` · ${item.copyKind === 'bundle' ? '프롬프트 + 스키마' : '프롬프트만'}` : ''}</p>
                    <p className="mt-1 break-words text-[12px] text-ink-2">{item.optionsJson.sourceMode === 'general_knowledge' ? '일반 지식' : '제공된 자료'} · {item.optionsJson.numberOfQuestions === 'auto' ? '전체 범위' : `${item.optionsJson.numberOfQuestions}문항`} · 언어 {item.optionsJson.outputLanguage}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Link href={`/prompt?from=${encodeURIComponent(item.id)}`} className={buttonVariants({ size: 'sm' })} data-testid="prompt-snapshot-load">불러오기</Link>
                    <Button size="sm" variant="ghost" onClick={() => setEditor({ options: resolvePromptOptions(item.optionsJson), name: item.name, ...(kind === 'preset' ? { id: item.id } : {}) })}>{kind === 'history' ? '프리셋으로 저장' : '이름 변경'}</Button>
                    <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(item.id)} aria-label={`${item.name} 삭제`}>삭제</Button>
                  </div>
                </div>
                <details className="mt-2 text-[12px] text-ink-3">
                  <summary className="cursor-pointer">전체 설정 보기</summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre rounded bg-sunken p-3 text-[11px]">{renderConfigBlock(resolvePromptOptions(item.optionsJson))}</pre>
                </details>
              </article>
            </li>
          ))}
        </ol>
        {list.hasNextPage ? <Button className="mt-4 w-full" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}</Button> : null}
      </div>
      {editor ? <PromptPresetDialog editor={editor} onClose={() => setEditor(null)} /> : null}
    </Panel>
  );
}
