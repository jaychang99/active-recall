'use client';
import { ClipboardCopy, FileJson, FileText, SlidersHorizontal, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/tooltip';
import { buildPromptBundle, promptText, schemaText } from '@/lib/prompt-bundle';
import { resolvePromptOptions } from '@/lib/prompt-options';
import { copyToClipboard } from '@/lib/utils';
import { useSettings } from './settings-context';

async function copy(label: string, text: string) {
  const ok = await copyToClipboard(text);
  if (ok) toast.success(`${label} 복사됨`, { description: `${(text.length / 1024).toFixed(1)} KB · LLM 대화창에 붙여넣으세요.` });
  else toast.error('클립보드에 복사하지 못했습니다', { description: '브라우저 권한을 확인하세요.' });
}

/** Available on every page: one click copies the generator prompt + schema for an external LLM. */
export function CopyPromptButton({ compact }: { compact?: boolean }) {
  const { settings } = useSettings();
  const opts = resolvePromptOptions(settings.promptDefaults);
  const n = settings.promptDefaults ? Object.keys(settings.promptDefaults).length : 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size={compact ? 'icon' : 'md'} aria-label="LLM 문제 생성 프롬프트 복사" data-testid="copy-prompt-trigger">
          <Sparkles className="h-4 w-4 text-accent" />
          {compact ? null : <span>LLM 프롬프트</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[280px]">
        <DropdownMenuLabel>클립보드로 복사{n ? ` · 저장된 기본값 ${n}개 적용` : ''}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void copy('프롬프트 + 스키마', buildPromptBundle(opts))} data-testid="copy-prompt-bundle">
          <ClipboardCopy className="h-4 w-4 text-ink-3" /> 프롬프트 + 스키마 (추천)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copy('프롬프트', promptText(opts))}>
          <FileText className="h-4 w-4 text-ink-3" /> 프롬프트만
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copy('JSON 스키마', schemaText())}>
          <FileJson className="h-4 w-4 text-ink-3" /> JSON 스키마만
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/prompt" data-testid="copy-prompt-options"><SlidersHorizontal className="h-4 w-4 text-ink-3" /> 옵션 조정해서 복사… <span className="ml-auto text-[11px] text-ink-3">문항 수·언어·유형 비율</span></Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] leading-relaxed text-ink-3">PDF·교안·주제를 함께 첨부하면 LLM이 Import 가능한 JSON을 만듭니다.</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
