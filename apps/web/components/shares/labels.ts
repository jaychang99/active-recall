import type { ShareKind, ShareStatus } from '@/lib/api';

export const KIND_LABEL: Record<ShareKind, string> = { deck: '덱', subject: '과목', questions: '문항' };
export const SHARE_STATUS: Record<ShareStatus, { label: string; tone: 'accent' | 'ok' | 'neutral' | 'outline' | 'bad' }> = {
  pending: { label: '대기 중', tone: 'accent' },
  accepted: { label: '수락함', tone: 'ok' },
  declined: { label: '거절함', tone: 'bad' },
  canceled: { label: '취소함', tone: 'outline' },
  expired: { label: '만료됨', tone: 'outline' },
};
