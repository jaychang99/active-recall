'use client';
import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { ErrorState, PageHeader, Panel, Skeleton } from '@/components/ui/misc';

export default function DataIndexPage() {
  const ents = useQuery({ queryKey: ['admin-entities'], queryFn: adminApi.entities });
  const counts = useQuery({ queryKey: ['admin-counts'], queryFn: adminApi.counts });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="데이터" description="모든 엔티티를 표로 조회·필터·정렬·페이징하고, 단일/복수 선택으로 생성·수정·삭제(소프트)·복구·영구 삭제할 수 있습니다." />
      {ents.isLoading ? <Skeleton className="h-40" /> : null}
      {ents.isError ? <ErrorState message={(ents.error as Error).message} onRetry={() => ents.refetch()} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ents.data?.map((e) => (
          <Link key={e.key} href={`/data/${e.key}`} className="block">
            <Panel className="flex items-start gap-3 p-4 hover:border-line-strong">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />
              <div className="min-w-0">
                <div className="font-medium">{e.label}</div>
                <div className="text-[12px] text-ink-3">{e.model} · {e.fields.length}개 필드{e.creatable ? ' · 생성 가능' : ''}</div>
                <div className="mt-1 text-[12px] tabular text-ink-2">{counts.data ? `${counts.data[e.key]?.live ?? 0}개` : '…'}{counts.data?.[e.key]?.deleted ? <span className="text-ink-3"> · 삭제됨 {counts.data[e.key]!.deleted}</span> : null}</div>
              </div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
