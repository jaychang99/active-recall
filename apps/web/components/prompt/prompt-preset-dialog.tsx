'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PROMPT_LIBRARY_KEY, promptSnapshotName } from '@/lib/prompt-library';
import { resolvePromptOptions, type PromptOptions } from '@/lib/prompt-options';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';

export interface PresetEditor { options: PromptOptions; name: string; id?: string }

export function PromptPresetDialog({ editor, onClose }: { editor: PresetEditor; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(editor.name);
  const save = useMutation({
    mutationFn: () => editor.id
      ? api(`/prompt-library/${editor.id}`, { method: 'PATCH', json: { name: name.trim() } })
      : api('/prompt-library', { method: 'POST', json: { kind: 'preset', name: name.trim(), options: editor.options } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: PROMPT_LIBRARY_KEY }); onClose(); toast.success(editor.id ? '프리셋 이름을 변경했습니다' : '프리셋을 저장했습니다'); },
    onError: (e: Error) => toast.error('프리셋을 저장하지 못했습니다', { description: e.message }),
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent title={editor.id ? '프리셋 이름 변경' : '프리셋으로 저장'} description="복사 이력과 별도로 보관되며, 저장된 전체 설정을 다시 불러올 수 있습니다.">
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}>
          <Label htmlFor="prompt-preset-name">프리셋 이름</Label>
          <Input id="prompt-preset-name" className="mt-1" autoFocus required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} disabled={save.isPending} />
          <div className="mt-4 flex justify-end gap-2"><Button type="button" onClick={onClose} disabled={save.isPending}>취소</Button><Button type="submit" variant="primary" disabled={!name.trim() || save.isPending} loading={save.isPending}>저장</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SavePromptPresetButton({ value, disabled }: { value: PromptOptions; disabled?: boolean }) {
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  return <>
    <Button size="sm" disabled={disabled} onClick={() => setEditor({ options: resolvePromptOptions(value), name: promptSnapshotName(value) })} data-testid="prompt-save-preset">프리셋으로 저장</Button>
    {editor ? <PromptPresetDialog editor={editor} onClose={() => setEditor(null)} /> : null}
  </>;
}
