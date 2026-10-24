import { describe, expect, it, vi } from 'vitest';
import { ShortcutManager, isEditableTarget, ownsArrowKeys } from './manager';

function key(init: Partial<KeyboardEventInit> & { key: string; target?: EventTarget; keyCode?: number }) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (init.target) Object.defineProperty(e, 'target', { value: init.target });
  if (init.keyCode !== undefined) Object.defineProperty(e, 'keyCode', { value: init.keyCode });
  return e;
}

describe('ShortcutManager', () => {
  it('routes digits by scope state (choose before submit, grade after reveal)', () => {
    const m = new ShortcutManager();
    const choose = vi.fn();
    const grade = vi.fn();
    const off = m.register('study', { keys: ['1', '2', '3', '4'], handler: choose }, 10);
    m.handle(key({ key: '1' }));
    expect(choose).toHaveBeenCalledTimes(1);
    off();
    m.register('study', { keys: ['1', '2', '3', '4'], handler: grade }, 10);
    m.handle(key({ key: '1' }));
    expect(grade).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('does not fire while typing in a textarea unless allowed', () => {
    const m = new ShortcutManager();
    const h = vi.fn();
    const submit = vi.fn();
    m.register('study', { keys: '1', handler: h }, 10);
    m.register('study', { keys: 'Enter', mod: 'ctrlOrMeta', allowInEditable: true, handler: submit }, 10);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(m.handle(key({ key: '1', target: ta }))).toBe(false);
    expect(h).not.toHaveBeenCalled();
    expect(m.handle(key({ key: 'Enter', metaKey: true, target: ta }))).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(isEditableTarget(ta)).toBe(true);
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    expect(isEditableTarget(cb)).toBe(false);
  });

  it('leaves arrow keys to radios, ranges and [data-arrow-keys] widgets', () => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    const range = document.createElement('input');
    range.type = 'range';
    const list = document.createElement('ol');
    list.setAttribute('data-arrow-keys', '');
    const line = document.createElement('button');
    list.appendChild(line);
    expect(ownsArrowKeys(radio)).toBe(true);
    expect(ownsArrowKeys(range)).toBe(true);
    expect(ownsArrowKeys(line)).toBe(true);
    expect(ownsArrowKeys(document.createElement('button'))).toBe(false);
    expect(ownsArrowKeys(document.body)).toBe(false);
  });

  it('ignores IME composition inside a text field and key repeat', () => {
    const m = new ShortcutManager();
    const h = vi.fn();
    m.register('study', { keys: 'Enter', mod: 'ctrlOrMeta', allowInEditable: true, handler: h }, 10);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(m.handle(key({ key: 'Enter', metaKey: true, isComposing: true, target: ta }))).toBe(false);
    expect(m.handle(key({ key: 'Process', code: 'Enter', metaKey: true, keyCode: 229, target: ta }))).toBe(false);
    expect(m.handle(key({ key: 'Enter', metaKey: true, repeat: true }))).toBe(false);
    expect(h).not.toHaveBeenCalled();
    expect(m.handle(key({ key: 'Enter', metaKey: true, target: ta }))).toBe(true);
  });

  it('fires by physical key outside text fields whatever the input source (Korean 2-set, IME Process)', () => {
    const m = new ShortcutManager();
    const e = vi.fn();
    const digit = vi.fn();
    const space = vi.fn();
    const help = vi.fn();
    m.register('study', { keys: 'e', handler: e }, 10);
    m.register('study', { keys: ['1', '2'], handler: digit }, 10);
    m.register('study', { keys: ' ', handler: space }, 10);
    m.register('study', { keys: '?', handler: help }, 10);
    expect(m.handle(key({ key: 'ㄷ', code: 'KeyE' }))).toBe(true);
    expect(m.handle(key({ key: 'Process', code: 'KeyE', keyCode: 229 }))).toBe(true);
    expect(m.handle(key({ key: 'ㄸ', code: 'KeyE', shiftKey: true }))).toBe(true);
    expect(e).toHaveBeenCalledTimes(3);
    expect(m.handle(key({ key: 'Process', code: 'Digit2', keyCode: 229 }))).toBe(true);
    expect(m.handle(key({ key: 'Process', code: 'Space', keyCode: 229 }))).toBe(true);
    expect(m.handle(key({ key: 'Process', code: 'Slash', shiftKey: true, keyCode: 229 }))).toBe(true);
    expect(digit).toHaveBeenCalledTimes(1);
    expect(space).toHaveBeenCalledTimes(1);
    expect(help).toHaveBeenCalledTimes(1);
    // inside a text field the Hangul key is just typing
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(m.handle(key({ key: 'ㄷ', code: 'KeyE', target: input }))).toBe(false);
    // a Latin layout keeps its own letters (Dvorak: physical KeyE types '.')
    expect(m.handle(key({ key: '.', code: 'KeyE' }))).toBe(false);
    expect(e).toHaveBeenCalledTimes(3);
  });

  it('modal scope is exclusive and wins over study', () => {
    const m = new ShortcutManager();
    const study = vi.fn();
    const modal = vi.fn();
    m.register('study', { keys: 'Escape', handler: study }, 10);
    const off = m.register('modal', { keys: 'Escape', handler: modal }, 100, true);
    m.handle(key({ key: 'Escape' }));
    expect(modal).toHaveBeenCalledTimes(1);
    expect(study).not.toHaveBeenCalled();
    m.register('study', { keys: '1', handler: study }, 10);
    expect(m.handle(key({ key: '1' }))).toBe(false);
    off();
    m.handle(key({ key: 'Escape' }));
    expect(study).toHaveBeenCalledTimes(1);
  });

  it('skips bindings when modifiers are held and respects enable toggle', () => {
    const m = new ShortcutManager();
    const h = vi.fn();
    m.register('global', { keys: 'n', handler: h });
    expect(m.handle(key({ key: 'n', metaKey: true }))).toBe(false);
    expect(m.handle(key({ key: 'N' }))).toBe(true);
    m.setEnabled(false);
    expect(m.handle(key({ key: 'n' }))).toBe(false);
  });
});
