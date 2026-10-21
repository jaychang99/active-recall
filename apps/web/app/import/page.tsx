'use client';
import { FileJson } from 'lucide-react';
import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { Tabs, tabPanelProps } from '@/components/ui/tabs';
import { MultiImport } from '@/components/import/multi-import';
import { SingleImport } from '@/components/import/single-import';

type Tab = 'single' | 'multi';
const TABS = [
  { key: 'single' as const, label: '개별', hint: 'JSON 하나를 붙여넣거나 파일 하나를 열어 가져옵니다' },
  { key: 'multi' as const, label: '다중', hint: '여러 JSON 파일을 한 번에 올려 파일별 덱·과목을 정한 뒤 가져옵니다' },
];

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>('single');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="JSON 가져오기"
        description={tab === 'single'
          ? 'JSON을 붙여넣거나 파일로 올리고, 덱·과목을 확인한 뒤 검증 + 가져오기를 누르세요. 문항 하나라도 검증에 실패하면 전체가 저장되지 않습니다.'
          : '여러 JSON 파일을 추가하고 덱·과목을 확인한 뒤 검증 + 가져오기를 누르세요. 일괄 설정은 파일별로 바꿀 수 있고, 검증 후 파일마다 저장됩니다.'}
        actions={<a href={`${API_URL}/schemas/question-batch.schema.json`} target="_blank" rel="noreferrer"><Button variant="ghost"><FileJson className="h-4 w-4" /> 스키마 열기</Button></a>}
      />
      <Tabs items={TABS} value={tab} onChange={setTab} idPrefix="import" className="mb-5" />
      {/* Both panels stay mounted so switching tabs does not lose pasted JSON or an uploaded file list. */}
      <div {...tabPanelProps('import', 'single')} hidden={tab !== 'single'}><SingleImport /></div>
      <div {...tabPanelProps('import', 'multi')} hidden={tab !== 'multi'}><MultiImport /></div>
    </div>
  );
}
