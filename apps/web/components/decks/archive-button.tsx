'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export function ArchiveButton({ kind, id, name, archived, showLabel = false }: { kind: 'decks' | 'subjects'; id: string; name: string; archived: boolean; showLabel?: boolean }) {
  const qc = useQueryClient();
  const action = archived ? '아카이브 해제' : '아카이브';
  const mutation = useMutation({
    mutationFn: () => api(`/${kind}/${id}/${archived ? 'unarchive' : 'archive'}`, { method: 'POST' }),
    onSuccess: () => {
      // Saved all-decks queues must be rebuilt to respect the changed collection visibility.
      try {
        for (const key of Object.keys(window.sessionStorage)) if (key.startsWith('rs-study:')) window.sessionStorage.removeItem(key);
      } catch { /* Storage can be unavailable in private mode. */ }
      qc.removeQueries({ queryKey: ['queue'], type: 'inactive' });
      for (const key of ['decks', 'subjects', 'overview', 'deck']) void qc.invalidateQueries({ queryKey: [key] });
      toast.success(archived ? '아카이브를 해제했습니다' : '아카이브했습니다', { description: name });
    },
    onError: (error: Error) => toast.error(`${action} 실패`, { description: error.message }),
  });
  const Icon = archived ? ArchiveRestore : Archive;
  return (
    <Tooltip content={action}>
      <Button variant="ghost" size={showLabel ? 'sm' : 'iconSm'} className="relative z-10 shrink-0" aria-label={`${name} ${action}`} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <Icon className="h-4 w-4" />{showLabel ? action : null}
      </Button>
    </Tooltip>
  );
}
