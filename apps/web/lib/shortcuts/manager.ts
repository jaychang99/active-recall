/**
 * Shortcut scope manager.
 * - One keydown listener for the whole app (registered by ShortcutProvider).
 * - Handlers register into named scopes; the top-most active scope wins ("modal" above "study" above "global").
 * - Keys are ignored while typing in inputs/textareas/contenteditable, during IME composition inside them
 *   (isComposing / keyCode 229), on key repeat, and when modifier keys are held unless the binding asks for them.
 * - Outside editable elements shortcuts work whatever the input source is: a non-Latin layout (Korean 2-set gives
 *   'ㄷ' for E) or an IME that reports 'Process' falls back to the physical key (KeyboardEvent.code).
 */
export type KeyBinding = {
  /** KeyboardEvent.key value(s), case-insensitive for letters. e.g. '1', 'Enter', ' ', '?', 'Escape' */
  keys: string | string[];
  /** Required modifier (default: none; bindings with none are skipped when ctrl/meta/alt is held). */
  mod?: 'ctrl' | 'meta' | 'ctrlOrMeta' | 'shift' | 'alt';
  /** Allow firing while an editable element is focused (e.g. Ctrl/Cmd+Enter in a textarea). */
  allowInEditable?: boolean;
  /** Fire on auto-repeat (default false). */
  allowRepeat?: boolean;
  /** Return false to let the event continue (not consumed). */
  handler: (e: KeyboardEvent) => void | boolean;
  description?: string;
  group?: string;
};

export interface Scope {
  name: string;
  priority: number;
  bindings: Map<symbol, KeyBinding>;
  /** When true, lower scopes never receive keys while this scope is active (modals). */
  exclusive: boolean;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(type);
  }
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return !!target.closest('[data-shortcuts="off"]');
}

export function isComposing(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229 || e.key === 'Process';
}

function normalizeKey(k: string): string {
  if (k === 'Spacebar') return ' ';
  return k.length === 1 ? k.toLowerCase() : k;
}

const CODE_KEY: Record<string, string> = { Space: ' ', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab' };

/**
 * The binding key for an event. Latin characters and named keys come from `e.key` (so Dvorak/AZERTY users keep
 * their own letters); anything else (Hangul jamo, kana, 'Process', 'Unidentified') maps through `e.code` to the
 * US-QWERTY character of that physical key.
 */
export function eventKey(e: KeyboardEvent): string {
  const k = e.key ?? '';
  const latin = k.length === 1 && k.charCodeAt(0) < 128;
  const named = k.length > 1 && k !== 'Process' && k !== 'Unidentified' && k !== 'Dead';
  if (latin || named) return normalizeKey(k);
  const code = e.code ?? '';
  const m = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(code);
  if (m) {
    if (m[2] && e.shiftKey) return normalizeKey(k);
    return (m[1] ?? m[2] ?? m[3])!.toLowerCase();
  }
  if (code === 'Slash') return e.shiftKey ? '?' : '/';
  return CODE_KEY[code] ?? normalizeKey(k);
}

export class ShortcutManager {
  private scopes = new Map<string, Scope>();
  private enabled = true;
  private listeners = new Set<() => void>();
  private snapshot: { scope: string; binding: KeyBinding }[] = [];

  setEnabled(v: boolean) {
    this.enabled = v;
    this.emit();
  }
  isEnabled() {
    return this.enabled;
  }

  ensureScope(name: string, priority: number, exclusive = false): Scope {
    let s = this.scopes.get(name);
    if (!s) {
      s = { name, priority, bindings: new Map(), exclusive };
      this.scopes.set(name, s);
    }
    return s;
  }

  register(scopeName: string, binding: KeyBinding, priority = 0, exclusive = false): () => void {
    const scope = this.ensureScope(scopeName, priority, exclusive);
    const id = Symbol(binding.description ?? 'binding');
    scope.bindings.set(id, binding);
    this.emit();
    return () => {
      scope.bindings.delete(id);
      this.emit();
    };
  }

  /** Active scopes, highest priority first. A scope is active when it has bindings. */
  activeScopes(): Scope[] {
    return [...this.scopes.values()].filter((s) => s.bindings.size > 0).sort((a, b) => b.priority - a.priority);
  }

  bindings(): { scope: string; binding: KeyBinding }[] {
    return this.snapshot;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    const out: { scope: string; binding: KeyBinding }[] = [];
    for (const s of this.activeScopes()) for (const b of s.bindings.values()) out.push({ scope: s.name, binding: b });
    this.snapshot = out;
    for (const l of this.listeners) l();
  }

  /** Returns true when the event was consumed. */
  handle(e: KeyboardEvent): boolean {
    if (!this.enabled) return false;
    const editable = isEditableTarget(e.target);
    // Composition only exists inside a text field; outside one, keyCode 229 is just the IME being active.
    if (editable && isComposing(e)) return false;
    const key = eventKey(e);
    for (const scope of this.activeScopes()) {
      for (const b of scope.bindings.values()) {
        if (!b.allowRepeat && e.repeat) continue;
        if (editable && !b.allowInEditable) continue;
        if (!modMatches(e, b.mod)) continue;
        const keys = Array.isArray(b.keys) ? b.keys : [b.keys];
        if (!keys.map(normalizeKey).includes(key)) continue;
        const r = b.handler(e);
        if (r !== false) {
          e.preventDefault();
          e.stopPropagation();
          return true;
        }
      }
      if (scope.exclusive) return false;
    }
    return false;
  }
}

function modMatches(e: KeyboardEvent, mod: KeyBinding['mod']): boolean {
  const ctrl = e.ctrlKey;
  const meta = e.metaKey;
  const alt = e.altKey;
  switch (mod) {
    case 'ctrl':
      return ctrl && !meta && !alt;
    case 'meta':
      return meta && !ctrl && !alt;
    case 'ctrlOrMeta':
      return (ctrl || meta) && !alt;
    case 'alt':
      return alt && !ctrl && !meta;
    case 'shift':
      return e.shiftKey && !ctrl && !meta && !alt;
    default:
      return !ctrl && !meta && !alt;
  }
}
