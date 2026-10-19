'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ShortcutManager, type KeyBinding } from './manager';

const Ctx = createContext<ShortcutManager | null>(null);

export function ShortcutProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const manager = useMemo(() => new ShortcutManager(), []);
  useEffect(() => {
    manager.setEnabled(enabled);
  }, [manager, enabled]);
  useEffect(() => {
    // Single app-level listener (capture phase so portal/menu handlers do not swallow keys first).
    const onKey = (e: KeyboardEvent) => {
      manager.handle(e);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [manager]);
  return <Ctx.Provider value={manager}>{children}</Ctx.Provider>;
}

export function useShortcutManager(): ShortcutManager {
  const m = useContext(Ctx);
  if (!m) throw new Error('ShortcutProvider missing');
  return m;
}

export const SCOPE_PRIORITY: Record<string, number> = { global: 0, page: 5, study: 10, modal: 100 };

/** Register bindings for a scope; handlers always see the latest closure. */
export function useShortcuts(scope: string, bindings: KeyBinding[], active = true, exclusive = false) {
  const manager = useShortcutManager();
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });
  const signature = bindings
    .map((b) => `${Array.isArray(b.keys) ? b.keys.join('|') : b.keys}:${b.mod ?? ''}:${b.allowInEditable ? 1 : 0}:${b.description ?? ''}:${b.group ?? ''}`)
    .join(';');
  useEffect(() => {
    if (!active) return;
    const priority = SCOPE_PRIORITY[scope] ?? 1;
    const offs = latest.current.map((b, i) => manager.register(scope, { ...b, handler: (e) => latest.current[i]?.handler(e) }, priority, exclusive));
    return () => offs.forEach((off) => off());
  }, [manager, scope, signature, active, exclusive]);
}

const EMPTY: { scope: string; binding: KeyBinding }[] = [];
export function useActiveBindings() {
  const manager = useShortcutManager();
  return useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.bindings(),
    () => EMPTY,
  );
}
