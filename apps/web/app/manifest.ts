import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Recall Studio',
    short_name: 'Recall',
    description: '키보드 중심 액티브 리콜 학습 워크스테이션 (FSRS 간격 반복)',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#f7f8f7',
    theme_color: '#0f766e',
    lang: 'ko',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: '모든 덱 학습', short_name: '학습', url: '/study/all', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: '틀린 문제 다시 보기', short_name: '오답', url: '/study/all?mode=mistakes' },
      { name: 'JSON 가져오기', short_name: '가져오기', url: '/import' },
      { name: '통계', short_name: '통계', url: '/insights' },
    ],
  };
}
