'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Filter, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { adminApi, type EntityMeta, type FieldMeta, type FilterValue, type Row } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Markdown } from '@/components/questions/markdown';
import { cn, formatDateTime } from '@/lib/utils';

const PAGE_SIZES = [25, 50, 100, 200];

function cell(f: FieldMeta, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-ink-3">—</span>;
  switch (f.type) {
    case 'boolean': return v ? <Badge tone="ok">예</Badge> : <Badge>아니오</Badge>;
    case 'datetime': return <span className="tabular whitespace-nowrap">{formatDateTime(String(v))}</span>;
    case 'number': return <span className="tabular">{typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v)}</span>;
    case 'json': return <code className="line-clamp-1 max-w-[260px] text-[11px] text-ink-3">{JSON.stringify(v).slice(0, 120)}</code>;
    case 'text': return <Markdown inline className="line-clamp-2 max-w-[360px] text-[13px] [&_p]:inline">{String(v)}</Markdown>;
    default: return <span className="line-clamp-1 max-w-[260px]">{String(v)}</span>;
  }
}

function toInput(f: FieldMeta, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'json') return JSON.stringify(v, null, 2);
  if (f.type === 'datetime') { const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  return String(v);
}

function fromInput(f: FieldMeta, s: string | boolean): unknown {
  if (f.type === 'boolean') return s === true || s === 'true';
  if (s === '') return f.type === 'string' || f.type === 'text' ? '' : null;
  if (f.type === 'number') return Number(s);
  if (f.type === 'datetime') return new Date(String(s)).toISOString();
  if (f.type === 'json') return JSON.parse(String(s));
  return s;
}

export function DataManager({ entity }: { entity: string }) {
  const qc = useQueryClient();
  const metas = useQuery({ queryKey: ['admin-entities'], queryFn: adminApi.entities });
  const meta = metas.data?.find((m) => m.key === entity);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<string | undefined>(undefined);
  const [dir, setDir] = useState<'asc' | 'desc' | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [deleted, setDeleted] = useState<'live' | 'deleted' | 'all'>('live');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null | 'new'>(null);
  const [bulkPatch, setBulkPatch] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, filters, deleted, pageSize, entity]);

  const list = useQuery({ queryKey: ['admin-list', entity, page, pageSize, sort, dir, debounced, filters, deleted], queryFn: () => adminApi.list(entity, { page, pageSize, sort, dir, search: debounced, filters, deleted }), enabled: !!meta, placeholderData: (prev) => prev });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['admin-list', entity] }); void qc.invalidateQueries({ queryKey: ['admin-counts'] }); };
  const bulk = useMutation({
    mutationFn: ({ action, data }: { action: 'delete' | 'restore' | 'permanent' | 'patch'; data?: Record<string, unknown> }) => adminApi.bulk(entity, [...selected], action, data),
    onSuccess: (r, v) => { invalidate(); setSelected(new Set()); setBulkPatch(false); toast[r.failed ? 'warning' : 'success'](`${v.action}: ${r.ok}건 성공${r.failed ? `, ${r.failed}건 실패` : ''}`, { description: r.results.filter((x) => !x.ok).slice(0, 3).map((x) => `${x.id}: ${x.error}`).join('\n') || undefined }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (metas.isLoading) return <Skeleton className="h-64" />;
  if (metas.isError) return <ErrorState message={(metas.error as Error).message} onRetry={() => metas.refetch()} />;
  if (!meta) return <ErrorState title="알 수 없는 엔티티" message={entity} />;

  const columns = meta.fields.filter((f) => !f.wide);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = items.length > 0 && items.every((i) => selected.has(i._id));
  const toggleSort = (f: FieldMeta) => {
    if (!f.sortable) return;
    if (sort !== f.name) { setSort(f.name); setDir('asc'); } else if (dir === 'asc') setDir('desc'); else { setSort(undefined); setDir(undefined); }
  };
  const activeFilterCount = Object.values(filters).filter((v) => v !== '' && v !== undefined && !(typeof v === 'object' && Object.values(v).every((x) => x === '' || x === undefined))).length;

  return (
    <div className="mx-auto max-w-[1400px]" data-testid="data-manager" data-entity={entity}>
      <PageHeader
        title={<span className="flex items-center gap-2"><Link href="/data" className="text-ink-3 hover:underline">데이터</Link><span className="text-ink-3">/</span>{meta.label}</span>}
        description={`${meta.model} · ${total}건${meta.softDelete ? ' · 삭제는 소프트 삭제(복구 가능)' : ''}`}
        actions={meta.creatable ? <Button variant="primary" onClick={() => setEditing('new')} data-testid="create-btn"><Plus className="h-4 w-4" /> 새 {meta.label}</Button> : null}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`검색 (${meta.fields.filter((f) => f.searchable).map((f) => f.label).join(', ') || '없음'})`} aria-label="검색" className="max-w-xs" data-testid="search" />
        <Button variant={showFilters ? 'soft' : 'secondary'} onClick={() => setShowFilters((v) => !v)}><Filter className="h-4 w-4" /> 필터{activeFilterCount ? ` (${activeFilterCount})` : ''}</Button>
        {meta.softDelete ? (
          <Select value={deleted} onChange={(e) => setDeleted(e.target.value as 'live')} aria-label="삭제 상태"><option value="live">살아있는 항목</option><option value="deleted">삭제된 항목</option><option value="all">전체</option></Select>
        ) : null}
        <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="페이지 크기">{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}개씩</option>)}</Select>
        {activeFilterCount ? <Button variant="ghost" size="sm" onClick={() => setFilters({})}><X className="h-3.5 w-3.5" /> 필터 초기화</Button> : null}
      </div>
      {showFilters ? (
        <div className="mb-3 grid gap-2 rounded-lg border border-line bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="filters">
          {meta.fields.filter((f) => f.filterable).map((f) => <FilterInput key={f.name} f={f} value={filters[f.name]} onChange={(v) => setFilters((x) => ({ ...x, [f.name]: v }))} />)}
        </div>
      ) : null}

      {selected.size ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft/40 px-3 py-2 text-[13px]" data-testid="bulk-bar">
          <span className="font-medium">{selected.size}개 선택</span>
          {meta.softDelete ? <Button size="sm" onClick={() => { if (confirm(`${selected.size}건을 삭제할까요? (복구 가능)`)) bulk.mutate({ action: 'delete' }); }} data-testid="bulk-delete"><Trash2 className="h-3.5 w-3.5" /> 삭제</Button> : null}
          {meta.softDelete ? <Button size="sm" onClick={() => bulk.mutate({ action: 'restore' })}><RotateCcw className="h-3.5 w-3.5" /> 복구</Button> : null}
          {meta.fields.some((f) => f.editable) ? <Button size="sm" onClick={() => setBulkPatch(true)}>필드 일괄 변경</Button> : null}
          <Button size="sm" variant="danger" onClick={() => { if (confirm(`${selected.size}건을 영구 삭제할까요? 되돌릴 수 없습니다.`)) bulk.mutate({ action: 'permanent' }); }}>영구 삭제</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>선택 해제</Button>
        </div>
      ) : null}

      {list.isLoading ? <Skeleton className="h-64" /> : null}
      {list.isError ? <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /> : null}
      {list.data && items.length === 0 ? <EmptyState title="항목이 없습니다" body={activeFilterCount || debounced ? '필터나 검색어를 바꿔보세요.' : undefined} /> : null}
      {items.length ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[13px]" data-testid="data-table">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="w-8 px-2 py-2"><input type="checkbox" aria-label="전체 선택" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i._id)))} /></th>
                {columns.map((f) => (
                  <th key={f.name} className={cn('px-2 py-2 font-medium whitespace-nowrap', f.sortable && 'cursor-pointer select-none hover:text-ink')} onClick={() => toggleSort(f)} aria-sort={sort === f.name ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <span className="inline-flex items-center gap-1">{f.label}{sort === f.name ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}</span>
                  </th>
                ))}
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id} className={cn('border-b border-line last:border-0 hover:bg-muted/50', row.deletedAt ? 'opacity-60' : '')} data-row-id={row._id}>
                  <td className="px-2 py-1.5"><input type="checkbox" aria-label={`${row._label} 선택`} checked={selected.has(row._id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(row._id); else n.delete(row._id); return n; })} /></td>
                  {columns.map((f) => <td key={f.name} className="px-2 py-1.5 align-top"><button type="button" className="text-left" onClick={() => setEditing(row)}>{cell(f, row[f.name])}</button></td>)}
                  <td className="px-2 py-1.5 whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => setEditing(row)}>열기</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3">
        <span className="tabular">{total}건 중 {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} · {page}/{pages} 페이지</span>
        <div className="flex gap-1"><Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="이전 페이지"><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="다음 페이지"><ChevronRight className="h-4 w-4" /></Button></div>
      </div>

      {editing ? <RecordDialog meta={meta} row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onChanged={invalidate} /> : null}
      {bulkPatch ? <BulkPatchDialog meta={meta} count={selected.size} onClose={() => setBulkPatch(false)} onApply={(data) => bulk.mutate({ action: 'patch', data })} /> : null}
    </div>
  );
}

function FilterInput({ f, value, onChange }: { f: FieldMeta; value: FilterValue | undefined; onChange: (v: FilterValue) => void }) {
  const obj = typeof value === 'object' && value ? value : {};
  const id = `flt-${f.name}`;
  switch (f.type) {
    case 'boolean':
      return <div><Label htmlFor={id}>{f.label}</Label><Select id={id} className="mt-1 w-full" value={value === undefined || value === '' ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value === 'true')}><option value="">전체</option><option value="true">예</option><option value="false">아니오</option></Select></div>;
    case 'enum':
      return <div><Label htmlFor={id}>{f.label}</Label><Select id={id} className="mt-1 w-full" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}><option value="">전체</option>{f.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}</Select></div>;
    case 'number':
      return <div><Label htmlFor={id}>{f.label}</Label><div className="mt-1 flex gap-1"><Input id={id} type="number" placeholder="최소" value={obj.min ?? ''} onChange={(e) => onChange({ ...obj, min: e.target.value })} /><Input type="number" placeholder="최대" aria-label={`${f.label} 최대`} value={obj.max ?? ''} onChange={(e) => onChange({ ...obj, max: e.target.value })} /></div></div>;
    case 'datetime':
      return <div><Label htmlFor={id}>{f.label}</Label><div className="mt-1 flex gap-1"><Input id={id} type="datetime-local" value={obj.from ?? ''} onChange={(e) => onChange({ ...obj, from: e.target.value ? new Date(e.target.value).toISOString() : '' })} /><Input type="datetime-local" value={obj.to ?? ''} onChange={(e) => onChange({ ...obj, to: e.target.value ? new Date(e.target.value).toISOString() : '' })} aria-label={`${f.label} 까지`} /></div></div>;
    default:
      return f.ref ? <RefPicker f={f} value={typeof value === 'string' ? value : ''} onChange={onChange} /> : <div><Label htmlFor={id}>{f.label}</Label><Input id={id} className="mt-1" placeholder="포함하는 문자열" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} /></div>;
  }
}

function RefPicker({ f, value, onChange }: { f: FieldMeta; value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState('');
  const opts = useQuery({ queryKey: ['admin-options', f.ref, q], queryFn: () => adminApi.options(f.ref!, q), enabled: !!f.ref });
  return (
    <div>
      <Label>{f.label} <span className="text-ink-3">({f.ref})</span></Label>
      <Input className="mt-1" placeholder="검색…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`${f.label} 검색`} />
      <Select className="mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)} aria-label={f.label}>
        <option value="">{value ? `현재: ${value}` : '전체'}</option>
        {opts.data?.map((o) => <option key={o.id} value={o.id}>{o.label.slice(0, 60)}</option>)}
      </Select>
    </div>
  );
}

function FieldEditor({ f, value, onChange, disabled }: { f: FieldMeta; value: string | boolean; onChange: (v: string | boolean) => void; disabled?: boolean }) {
  const id = `fld-${f.name}`;
  if (f.type === 'boolean') return <label className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" checked={value === true || value === 'true'} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {f.label}</label>;
  if (f.type === 'enum') return <div><Label htmlFor={id}>{f.label}</Label><Select id={id} className="mt-1 w-full" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{f.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}</Select></div>;
  if (f.type === 'json' || f.type === 'text') return <div className="sm:col-span-2"><Label htmlFor={id}>{f.label}</Label><Textarea id={id} rows={f.type === 'json' ? 10 : 4} className={cn('mt-1', f.type === 'json' && 'font-mono text-[12px]')} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />{f.type === 'text' && String(value).includes('$') ? <div className="mt-1 rounded border border-line bg-muted/40 p-2 text-[13px]"><span className="text-[11px] text-ink-3">미리보기</span><Markdown className="prose-sm">{String(value)}</Markdown></div> : null}</div>;
  if (f.ref && !disabled) return <RefPicker f={f} value={String(value)} onChange={onChange} />;
  return <div><Label htmlFor={id}>{f.label}</Label><Input id={id} type={f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text'} min={f.min} max={f.max} step={f.type === 'number' ? (f.integer ? 1 : 'any') : undefined} className="mt-1" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></div>;
}

function RecordDialog({ meta, row, onClose, onChanged }: { meta: EntityMeta; row: Row | null; onClose: () => void; onChanged: () => void }) {
  const isNew = row === null;
  const fields = useMemo(() => meta.fields.filter((f) => (isNew ? f.editable || f.required || (f.name === meta.pk && meta.key === 'decks') : true)), [meta, isNew]);
  const [form, setForm] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((f) => [f.name, f.type === 'boolean' ? Boolean(row?.[f.name]) : toInput(f, row?.[f.name])])));
  const save = useMutation({
    mutationFn: async () => {
      const data: Record<string, unknown> = {};
      for (const f of fields) {
        if (!isNew && !f.editable) continue;
        if (isNew && !(f.editable || f.required || f.name === meta.pk)) continue;
        const v = form[f.name];
        if (isNew && (v === '' || v === undefined) && !f.required) continue;
        if (!isNew && toInput(f, row?.[f.name]) === v && f.type !== 'boolean') continue;
        if (!isNew && f.type === 'boolean' && Boolean(row?.[f.name]) === v) continue;
        data[f.name] = fromInput(f, v ?? '');
      }
      return isNew ? adminApi.create(meta.key, data) : adminApi.update(meta.key, row!._id, data);
    },
    onSuccess: (r) => { onChanged(); toast.success(isNew ? '생성했습니다' : '저장했습니다', { description: (r as { resetSchedule?: boolean }).resetSchedule ? '정답이 바뀌어 이 문항의 스케줄이 초기화되었습니다.' : undefined }); onClose(); },
    onError: (e: Error & { details?: { issues?: { message: string; path: string }[] } }) => toast.error(e.message, { description: e.details?.issues?.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join('\n') }),
  });
  const remove = useMutation({
    mutationFn: (permanent: boolean) => adminApi.remove(meta.key, row!._id, permanent),
    onSuccess: () => { onChanged(); toast.success('삭제했습니다'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({ mutationFn: () => adminApi.restore(meta.key, row!._id), onSuccess: () => { onChanged(); toast.success('복구했습니다'); onClose(); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title={isNew ? `새 ${meta.label}` : row!._label} description={isNew ? undefined : `${meta.model} · ${row!._id}`} wide>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} data-testid="record-form">
          {fields.map((f) => <FieldEditor key={f.name} f={f} value={form[f.name] ?? ''} disabled={!isNew && !f.editable} onChange={(v) => setForm((x) => ({ ...x, [f.name]: v }))} />)}
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={save.isPending} data-testid="save-record">{isNew ? '생성' : '저장'}</Button>
            {!isNew && meta.key !== 'settings' ? (
              row!.deletedAt ? <Button type="button" onClick={() => restore.mutate()}><RotateCcw className="h-4 w-4" /> 복구</Button> : (meta.softDelete ? <Button type="button" onClick={() => { if (confirm('삭제할까요? (복구 가능)')) remove.mutate(false); }}><Trash2 className="h-4 w-4" /> 삭제</Button> : null)
            ) : null}
            {!isNew && meta.key !== 'settings' ? <Button type="button" variant="danger" onClick={() => { if (confirm('영구 삭제할까요? 되돌릴 수 없습니다.')) remove.mutate(true); }}>영구 삭제</Button> : null}
            <Button type="button" variant="ghost" onClick={onClose} className="ml-auto">닫기</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkPatchDialog({ meta, count, onClose, onApply }: { meta: EntityMeta; count: number; onClose: () => void; onApply: (data: Record<string, unknown>) => void }) {
  const editable = meta.fields.filter((f) => f.editable && f.type !== 'json');
  const [field, setField] = useState(editable[0]?.name ?? '');
  const [value, setValue] = useState<string | boolean>('');
  const f = editable.find((x) => x.name === field);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title={`${count}건 필드 일괄 변경`} description="선택한 모든 행의 한 필드를 같은 값으로 바꿉니다.">
        <div className="space-y-3">
          <div><Label htmlFor="bulk-field">필드</Label><Select id="bulk-field" className="mt-1 w-full" value={field} onChange={(e) => { setField(e.target.value); setValue(''); }}>{editable.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}</Select></div>
          {f ? <FieldEditor f={f} value={value} onChange={setValue} /> : null}
          <div className="flex gap-2"><Button variant="primary" disabled={!f} onClick={() => f && onApply({ [f.name]: fromInput(f, value) })}>적용</Button><Button variant="ghost" onClick={onClose}>취소</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
