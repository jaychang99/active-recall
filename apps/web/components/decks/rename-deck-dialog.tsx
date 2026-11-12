'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';

/** Rename a deck (its display title only: the batch `deck.id`/slug stays, so re-imports still match). */
export function RenameDeckDialog({ deckId, title, showLabel = false, onRenamed }: { deckId: string; title: string; showLabel?: boolean; onRenamed?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);
  const next = name.trim();
  const mut = useMutation({
    mutationFn: () => api(`/decks/${deckId}`, { method: 'PATCH', json: { title: next } }),
    onSuccess: () => {
      onRenamed?.();
      for (const key of ['decks', 'deck', 'subjects', 'overview', 'queue']) void qc.invalidateQueries({ queryKey: [key] });
      toast.success('덱 이름을 변경했습니다', { description: `${title} → ${next}` });
      setOpen(false);
    },
    onError: (e: Error) => toast.error('덱 이름을 변경하지 못했습니다', { description: e.message }),
  });
  const openDialog = () => { setName(title); setOpen(true); };
  return (
    <>
      <Tooltip content="덱 이름 변경">
        <Button variant={showLabel ? 'secondary' : 'ghost'} size={showLabel ? 'md' : 'iconSm'} className="relative z-10 shrink-0" aria-label={`${title} 이름 변경`} onClick={openDialog} data-testid="deck-rename-btn">
          <Pencil className="h-4 w-4" />{showLabel ? '이름 변경' : null}
        </Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="덱 이름 변경" description="표시 이름만 바뀝니다. 덱 ID는 그대로라 같은 JSON을 다시 가져와도 이 덱에 합쳐집니다 (가져오기의 제목이 이름을 덮어쓸 수 있습니다).">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (next && next !== title) mut.mutate(); }}>
            <div>
              <Label htmlFor="deck-rename-input">덱 이름</Label>
              <Input id="deck-rename-input" className="mt-1" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} data-testid="deck-rename-input" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={mut.isPending} disabled={!next || next === title || mut.isPending} data-testid="deck-rename-save">저장</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
