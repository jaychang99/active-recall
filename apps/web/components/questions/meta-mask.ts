import type { Settings } from '@/lib/api';

/**
 * Question metadata the learner can hide during study because it can hint at the answer
 * (a "hard" tag narrows the options, the source names the chapter, the subject names the topic…).
 * Each key maps to one boolean on the user's settings row so the choice follows them across devices.
 */
export const META_KEYS = ['difficulty', 'tags', 'subject', 'source'] as const;
export type MetaKey = (typeof META_KEYS)[number];

export const META_SETTING: Record<MetaKey, 'hideDifficulty' | 'hideTags' | 'hideSubject' | 'hideSource'> = {
  difficulty: 'hideDifficulty', tags: 'hideTags', subject: 'hideSubject', source: 'hideSource',
};

export const META_LABEL: Record<MetaKey, { label: string; hint: string }> = {
  difficulty: { label: '난이도 · 예상 시간', hint: '"5/5"나 "약 10초"만으로 쉬운 답을 걸러낼 수 있습니다.' },
  tags: { label: '태그(소재)', hint: '#태그가 주제를 그대로 알려줍니다.' },
  subject: { label: '과목 · 덱 이름', hint: '"모든 덱" 학습에서 어느 과목인지 숨깁니다.' },
  source: { label: '출처', hint: '해설의 출처 문서·위치(장·절)를 숨깁니다.' },
};

export type MetaMask = Record<MetaKey, boolean>;

export function maskFromSettings(s: Pick<Settings, 'hideDifficulty' | 'hideTags' | 'hideSubject' | 'hideSource'>): MetaMask {
  return { difficulty: s.hideDifficulty, tags: s.hideTags, subject: s.hideSubject, source: s.hideSource };
}

export function hiddenCount(mask: MetaMask) {
  return META_KEYS.filter((k) => mask[k]).length;
}

export function isAllHidden(mask: MetaMask) {
  return META_KEYS.every((k) => mask[k]);
}

/** Settings patch that sets every key to `hidden`. */
export function allPatch(hidden: boolean): Pick<Settings, 'hideDifficulty' | 'hideTags' | 'hideSubject' | 'hideSource'> {
  return { hideDifficulty: hidden, hideTags: hidden, hideSubject: hidden, hideSource: hidden };
}

/** Settings patch for the "toggle all" shortcut: hide everything unless everything is already hidden. */
export function toggleAllPatch(mask: MetaMask) {
  return allPatch(!isAllHidden(mask));
}

/** Settings patch that flips one key. */
export function togglePatch(mask: MetaMask, key: MetaKey) {
  return { [META_SETTING[key]]: !mask[key] } as Partial<Settings>;
}
