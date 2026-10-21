import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusAnswerInput } from './answer-focus';

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('answer autofocus', () => {
  it('leaves focus alone on touch devices so new questions do not open the keyboard', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const input = document.createElement('input');
    document.body.append(input);
    focusAnswerInput(input);
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps desktop autofocus without a programmatic scroll jump', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const input = document.createElement('input');
    const focus = vi.spyOn(input, 'focus');
    document.body.append(input);
    focusAnswerInput(input);
    expect(document.activeElement).toBe(input);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
