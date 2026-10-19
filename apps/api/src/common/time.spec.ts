import { describe, expect, it } from 'vitest';
import { dayKey, dayKeyOffset, endOfDayInTz, startOfDayInTz } from './time';

describe('timezone day boundaries', () => {
  it('computes Seoul midnight in UTC', () => {
    const now = new Date('2026-10-19T03:30:00Z'); // 12:30 KST
    expect(startOfDayInTz(now, 'Asia/Seoul').toISOString()).toBe('2026-10-18T15:00:00.000Z');
    expect(endOfDayInTz(now, 'Asia/Seoul').toISOString()).toBe('2026-10-19T15:00:00.000Z');
    expect(dayKey(now, 'Asia/Seoul')).toBe('2026-10-19');
  });
  it('late UTC evening is already the next day in Seoul', () => {
    const now = new Date('2026-10-19T16:10:00Z'); // 01:10 KST Oct 20
    expect(dayKey(now, 'Asia/Seoul')).toBe('2026-10-20');
    expect(startOfDayInTz(now, 'Asia/Seoul').toISOString()).toBe('2026-10-19T15:00:00.000Z');
  });
  it('handles a DST timezone', () => {
    const now = new Date('2026-03-08T12:00:00Z');
    expect(dayKey(now, 'America/New_York')).toBe('2026-03-08');
    expect(startOfDayInTz(now, 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });
  it('offsets day keys', () => {
    expect(dayKeyOffset('2026-03-01', -1)).toBe('2026-02-28');
  });
});
