'use client';
import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { StudyScreen, type StudyParams } from '@/components/study/study-screen';

export default function StudyPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = use(params);
  const sp = useSearchParams();
  const mode = (sp.get('mode') ?? 'scheduled') as StudyParams['mode'];
  const p: StudyParams = {
    scope: decodeURIComponent(scope),
    mode: ['scheduled', 'cram', 'mistakes', 'flagged', 'practice', 'browse'].includes(mode) ? mode : 'scheduled',
    subject: sp.get('subject') ?? undefined,
    tags: sp.get('tags')?.split(',').filter(Boolean),
    types: sp.get('types')?.split(',').filter(Boolean),
    difficultyMin: sp.get('difficultyMin') ? Number(sp.get('difficultyMin')) : undefined,
    difficultyMax: sp.get('difficultyMax') ? Number(sp.get('difficultyMax')) : undefined,
    limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
  };
  return <StudyScreen key={JSON.stringify(p)} params={p} />;
}
