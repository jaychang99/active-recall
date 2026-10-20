import { describe, expect, it } from 'vitest';
import { allPatch, hiddenCount, isAllHidden, maskFromSettings, toggleAllPatch, togglePatch } from './meta-mask';

const none = { hideDifficulty: false, hideTags: false, hideSubject: false, hideSource: false };

describe('study metadata mask', () => {
  it('maps settings booleans to mask keys', () => {
    const m = maskFromSettings({ ...none, hideTags: true });
    expect(m).toEqual({ difficulty: false, tags: true, subject: false, source: false });
    expect(hiddenCount(m)).toBe(1);
    expect(isAllHidden(m)).toBe(false);
    expect(isAllHidden(maskFromSettings(allPatch(true)))).toBe(true);
  });

  it('toggle-all hides everything unless everything is hidden already', () => {
    expect(toggleAllPatch(maskFromSettings(none))).toEqual(allPatch(true));
    expect(toggleAllPatch(maskFromSettings({ ...none, hideSource: true }))).toEqual(allPatch(true));
    expect(toggleAllPatch(maskFromSettings(allPatch(true)))).toEqual(allPatch(false));
  });

  it('toggle-one patches only that setting', () => {
    expect(togglePatch(maskFromSettings(none), 'subject')).toEqual({ hideSubject: true });
    expect(togglePatch(maskFromSettings({ ...none, hideDifficulty: true }), 'difficulty')).toEqual({ hideDifficulty: false });
  });
});
