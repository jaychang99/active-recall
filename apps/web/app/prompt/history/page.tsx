'use client';
import Link from '@/components/ui/navigation-link';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { PromptLibrary } from '@/components/prompt/prompt-library';

export default function PromptHistoryPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="프롬프트 복사 이력·프리셋" description="복사할 때의 전체 설정을 목록에서 확인하고 불러올 수 있습니다. 이력과 프리셋은 개수 제한 없이 보관되며, 검색하거나 개별 삭제할 수 있습니다." actions={<Link href="/prompt" className={buttonVariants()}>프롬프트 작성</Link>} />
      <PromptLibrary />
    </div>
  );
}
