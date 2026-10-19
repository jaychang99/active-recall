import { describe, expect, it, vi } from 'vitest';
import { ShortcutManager, isEditableTarget } from './manager';

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

  it('ignores IME composition (Korean) and key repeat', () => {
    const m = new ShortcutManager();
    const h = vi.fn();
    m.register('study', { keys: 'Enter', handler: h }, 10);
    expect(m.handle(key({ key: 'Enter', isComposing: true }))).toBe(false);
    expect(m.handle(key({ key: 'Process', keyCode: 229 }))).toBe(false);
    expect(m.handle(key({ key: 'Enter', repeat: true }))).toBe(false);
    expect(h).not.toHaveBeenCalled();
    expect(m.handle(key({ key: 'Enter' }))).toBe(true);
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
