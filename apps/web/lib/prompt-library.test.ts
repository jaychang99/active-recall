import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/utils';
import { copyPromptWithHistory } from './prompt-library';
import { resolvePromptOptions } from './prompt-options';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/lib/utils', () => ({ copyToClipboard: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); });

describe('copying prompts into history', () => {
  it.each(['bundle', 'prompt'] as const)('records all settings for %s, even when equal to defaults', async (kind) => {
    vi.mocked(copyToClipboard).mockResolvedValue(true);
    vi.mocked(api).mockResolvedValue({});
    const options = resolvePromptOptions(null);
    expect(await copyPromptWithHistory(options, kind)).toBe('saved');
    expect(api).toHaveBeenCalledWith('/prompt-library', { method: 'POST', json: { kind: 'history', name: '문제 생성', copyKind: kind, options } });
    const copied = vi.mocked(copyToClipboard).mock.calls[0]![0];
    expect(copied.includes('ATTACHED SCHEMA')).toBe(kind === 'bundle');
  });

  it('does not record failed clipboard writes', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    expect(await copyPromptWithHistory(resolvePromptOptions(null), 'bundle')).toBe('failed');
    expect(api).not.toHaveBeenCalled();
  });

  it('captures nested values before clipboard resolves, and retries storage without copying again', async () => {
    let finish!: (ok: boolean) => void;
    vi.mocked(copyToClipboard).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    vi.mocked(api).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    const options = resolvePromptOptions({ sourceMode: 'general_knowledge', mainTopic: '네트워크', subtopics: ['TCP'], difficulty: { easy: 20, medium: 30, hard: 50 } });
    const original = resolvePromptOptions(options);
    const copying = copyPromptWithHistory(options, 'bundle');
    options.mainTopic = '다른 주제'; options.subtopics.push('UDP'); options.difficulty.easy = 80;
    finish(true);
    const result = await copying;
    expect(typeof result).toBe('object');
    if (typeof result === 'string') throw new Error('Expected storage failure');
    await result.retry();
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    for (const [, request] of vi.mocked(api).mock.calls) expect(request?.json).toEqual({ kind: 'history', name: '네트워크', copyKind: 'bundle', options: original });
  });
});
