import { describe, expect, it } from 'vitest';
import { seededShuffle } from './study.service';

describe('study queue seededShuffle', () => {
  it('reaches every order of 4 items across consecutive minute seeds', () => {
    const seen = new Set<string>();
    for (let seed = 29_000_000; seed < 29_002_000; seed++) seen.add(seededShuffle([0, 1, 2, 3], seed).join(''));
    expect(seen.size).toBe(24);
  });

  it('is deterministic and keeps every element', () => {
    expect(seededShuffle(['a', 'b', 'c'], 7)).toEqual(seededShuffle(['a', 'b', 'c'], 7));
    expect([...seededShuffle(['a', 'b', 'c'], 7)].sort()).toEqual(['a', 'b', 'c']);
  });
});
