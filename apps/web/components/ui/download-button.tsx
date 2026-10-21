'use client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { downloadFromApi } from '@/lib/download';
import { Button, type ButtonProps } from './button';

export function DownloadButton({ path, filename, ...props }: Omit<ButtonProps, 'onClick' | 'loading'> & { path: string; filename: string }) {
  const download = useMutation({
    mutationFn: () => downloadFromApi(path, filename),
    onError: (error: Error) => toast.error('다운로드 실패', { description: error.message }),
  });
  return <Button {...props} loading={download.isPending} loadingLabel="파일 준비 중…" onClick={() => download.mutate()} />;
}
