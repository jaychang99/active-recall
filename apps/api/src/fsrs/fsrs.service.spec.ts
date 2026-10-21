import { describe, expect, it } from 'vitest';
import { Rating, State, fsrs, generatorParameters } from 'ts-fsrs';
import { FsrsService, deserializeCard, formatInterval, serializeCard, serializeLog, deserializeLog } from './fsrs.service';

const params = { requestRetention: 0.9, maximumInterval: 36500, enableFuzz: false };

describe('FsrsService', () => {
  const svc = new FsrsService();

  it('round-trips card state through JSON without loss', () => {
    const now = new Date('2026-10-19T03:00:00Z');
    const card = svc.emptyCard(now);
    const good = svc.next(params, card, now, Rating.Good).card;
    const again = JSON.parse(JSON.stringify(serializeCard(good)));
    const restored = deserializeCard(again);
    expect(restored).toEqual(good);
    // scheduling from the restored card must match scheduling from the original
    const later = new Date(now.getTime() + 86_400_000);
    expect(svc.next(params, restored, later, Rating.Good).card).toEqual(svc.next(params, good, later, Rating.Good).card);
  });

  it('Again/Hard/Good/Easy produce the library-defined ordering of due dates', () => {
    const now = new Date('2026-10-19T03:00:00Z');
    const card = svc.emptyCard(now);
    const p = svc.preview(params, card, now);
    const d = (k: keyof typeof p) => new Date(p[k].due).getTime();
    expect(d('again')).toBeLessThanOrEqual(d('hard'));
    expect(d('hard')).toBeLessThanOrEqual(d('good'));
    expect(d('good')).toBeLessThan(d('easy'));
    // equals ts-fsrs directly
    const ref = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: false })).repeat(card, now);
    expect(p.good.due).toBe(ref[Rating.Good].card.due.toISOString());
  });

  it('rollback restores the exact previous card', () => {
    const now = new Date('2026-10-19T03:00:00Z');
    const card = svc.emptyCard(now);
    const r = svc.next(params, card, now, Rating.Easy);
    const prev = svc.scheduler(params).rollback(r.card, deserializeLog(JSON.parse(JSON.stringify(serializeLog(r.log)))));
    expect(prev.state).toBe(State.New);
    expect(prev.reps).toBe(0);
  });

  it('formats intervals compactly', () => {
    const a = new Date('2026-01-01T00:00:00Z');
    expect(formatInterval(a, new Date(a.getTime() + 10 * 60_000))).toBe('10m');
    expect(formatInterval(a, new Date(a.getTime() + 4 * 86_400_000))).toBe('4d');
    expect(formatInterval(a, new Date(a.getTime() + 400 * 86_400_000))).toBe('1.1y');
  });

  it('supports a configured maximum interval of 100,000 days', () => {
    const now = new Date('2026-10-21T03:00:00Z');
    const highLimit = { ...params, maximumInterval: 100_000 };
    const scheduler = svc.scheduler(highLimit);
    expect(scheduler.parameters.maximum_interval).toBe(100_000);
    const card = { ...svc.emptyCard(now), state: State.Review, stability: 100_000, difficulty: 5, reps: 10, last_review: now };
    const result = svc.next(highLimit, card, now, Rating.Easy);
    expect(result.card.scheduled_days).toBeGreaterThan(0);
    expect(result.card.scheduled_days).toBeLessThanOrEqual(100_000);
    expect(Number.isFinite(result.card.due.getTime())).toBe(true);
  });
});
