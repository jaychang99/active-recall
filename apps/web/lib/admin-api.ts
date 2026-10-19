import { api } from '@/lib/api';

export type FieldType = 'string' | 'text' | 'number' | 'boolean' | 'datetime' | 'json' | 'enum';
export interface FieldMeta { name: string; label: string; type: FieldType; editable?: boolean; required?: boolean; filterable?: boolean; searchable?: boolean; sortable?: boolean; enumValues?: string[]; ref?: string; wide?: boolean }
export interface EntityMeta { key: string; model: string; label: string; pk: string; softDelete: boolean; creatable: boolean; defaultSort: { field: string; dir: 'asc' | 'desc' }; fields: FieldMeta[] }
export type Row = Record<string, unknown> & { _id: string; _label: string };
export interface ListResult { entity: string; page: number; pageSize: number; total: number; sort: string; dir: 'asc' | 'desc'; items: Row[] }
export type FilterValue = string | number | boolean | { min?: string; max?: string; from?: string; to?: string; contains?: string; isNull?: boolean };

export const adminApi = {
  entities: () => api<EntityMeta[]>('/admin/entities'),
  counts: () => api<Record<string, { live: number; deleted: number }>>('/admin/counts'),
  list: (entity: string, q: { page: number; pageSize: number; sort?: string; dir?: 'asc' | 'desc'; search?: string; filters?: Record<string, FilterValue>; deleted: 'live' | 'deleted' | 'all' }) => {
    const u = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize), deleted: q.deleted });
    if (q.sort) u.set('sort', q.sort);
    if (q.dir) u.set('dir', q.dir);
    if (q.search) u.set('search', q.search);
    const f = Object.fromEntries(Object.entries(q.filters ?? {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
    if (Object.keys(f).length) u.set('filters', JSON.stringify(f));
    return api<ListResult>(`/admin/${entity}?${u.toString()}`);
  },
  get: (entity: string, id: string) => api<Row>(`/admin/${entity}/${encodeURIComponent(id)}`),
  create: (entity: string, data: Record<string, unknown>) => api<Row>(`/admin/${entity}`, { method: 'POST', json: data }),
  update: (entity: string, id: string, data: Record<string, unknown>) => api<Row & { resetSchedule?: boolean }>(`/admin/${entity}/${encodeURIComponent(id)}`, { method: 'PATCH', json: data }),
  remove: (entity: string, id: string, permanent = false) => api(`/admin/${entity}/${encodeURIComponent(id)}${permanent ? '?permanent=true' : ''}`, { method: 'DELETE' }),
  restore: (entity: string, id: string) => api<Row>(`/admin/${entity}/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  bulk: (entity: string, ids: string[], action: 'delete' | 'restore' | 'permanent' | 'patch', data?: Record<string, unknown>) => api<{ ok: number; failed: number; results: { id: string; ok: boolean; error?: string }[] }>(`/admin/${entity}/bulk`, { method: 'POST', json: { ids, action, data } }),
  options: (entity: string, search?: string) => api<{ id: string; label: string }[]>(`/admin/${entity}/options${search ? `?search=${encodeURIComponent(search)}` : ''}`),
};
