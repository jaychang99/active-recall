import { describe, expect, it } from 'vitest';
import { activitySnapshot, startActivity, withActivity } from './request-activity';

describe('request activity', () => {
  it('keeps overlapping work busy until each operation completes and ignores duplicate completion', () => {
    const read = startActivity('read');
    const write = startActivity('write');
    expect(activitySnapshot()).toMatchObject({ read: 1, write: 1 });
    read(); read();
    expect(activitySnapshot()).toMatchObject({ read: 0, write: 1 });
    write();
    expect(Object.values(activitySnapshot()).every((count) => count === 0)).toBe(true);
  });

  it('clears activity after failures as well as successful responses', async () => {
    await expect(withActivity('download', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(activitySnapshot().download).toBe(0);
    await expect(withActivity('write', async () => 'saved')).resolves.toBe('saved');
    expect(activitySnapshot().write).toBe(0);
  });
});
