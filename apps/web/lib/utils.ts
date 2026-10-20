import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('ko-KR', opts).format(new Date(d));
}

export function formatDateTime(d: string | Date | null | undefined): string {
  return formatDate(d, { dateStyle: 'medium', timeStyle: 'short' });
}

export function relativeDue(d: string | Date | null | undefined, now = new Date()): string {
  if (!d) return '—';
  const diff = new Date(d).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const unit = abs < 3_600_000 ? ['분', 60_000] as const : abs < 86_400_000 ? ['시간', 3_600_000] as const : ['일', 86_400_000] as const;
  const n = Math.max(1, Math.round(abs / unit[1]));
  return diff < 0 ? `${n}${unit[0]} 지남` : `${n}${unit[0]} 후`;
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

export const TYPE_LABEL: Record<string, string> = {
  single_choice: '단일선택',
  multiple_choice: '복수선택',
  true_false: 'OX',
  short_answer: '단답형',
  essay: '서술형',
  cloze: '빈칸',
  ordering: '순서배열',
  matching: '연결형',
  numeric: '숫자형',
  cloze_select: '빈칸 선택',
  statement_set: '진술 판단',
  categorize: '분류',
  two_tier: '답+근거',
  recall_card: '회상 카드',
  stepwise: '단계별',
  highlight: '구간 선택',
  cloze_bank: '단어 보기 빈칸',
  code_cloze: '코드 빈칸',
  matrix: '격자 체크',
  numeric_grid: '수치 표',
  list_answer: '목록 단답',
  image_hotspot: '이미지 위치',
  parsons: '코드 순서',
  find_and_fix: '찾아 고치기',
  coordinate_point: '좌표 점찍기',
  regex_answer: '정규식',
};

export const STATUS_LABEL: Record<string, string> = { NEW: '새 카드', LEARNING: '학습 중', REVIEW: '복습', RELEARNING: '재학습' };

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** mulberry32: small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic shuffle so choice order is stable per question per session. Fisher–Yates over mulberry32 —
 * not a bare LCG with `seed % (i + 1)`: its low bits alternate, which only ever produced even permutations
 * (half of all orders) and kept the source order 2–4× more often than chance.
 */
export function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  let seed = 2166136261;
  for (const ch of seedStr) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rand = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
