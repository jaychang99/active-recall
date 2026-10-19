'use client';
import { use } from 'react';
import { DataManager } from '@/components/data/data-manager';

export default function DataEntityPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = use(params);
  return <DataManager entity={entity} />;
}
