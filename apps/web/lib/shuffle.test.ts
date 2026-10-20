import { describe, expect, it } from 'vitest';
import { seededShuffle } from './utils';

describe('seededShuffle', () => {
  it('is deterministic per seed and keeps every element', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(seededShuffle(items, 'q1:s1')).toEqual(seededShuffle(items, 'q1:s1'));
    expect([...seededShuffle(items, 'q1:s1')].sort()).toEqual(items);
  });

  it('reaches every order roughly uniformly (incl. odd permutations) and rarely keeps the source order', () => {
    for (const n of [4, 5]) {
      const base = Array.from({ length: n }, (_, i) => i);
      const counts = new Map<string, number>();
      const runs = 24_000;
      for (let t = 0; t < runs; t++) {
        const k = seededShuffle(base, `q_${t % 37}:session-${t}:${1 + (t % 3)}`).join('');
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const total = n === 4 ? 24 : 120;
      expect(counts.size).toBe(total);
      const identity = (counts.get(base.join('')) ?? 0) / runs;
      expect(identity).toBeLessThan(1.5 / total);
    }
  });
});
