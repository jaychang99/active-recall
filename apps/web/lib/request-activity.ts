export type ActivityKind = 'read' | 'write' | 'download' | 'navigation';
const idle = { read: 0, write: 0, download: 0, navigation: 0 };
let snapshot = idle;
const listeners = new Set<() => void>();

export const activitySnapshot = () => snapshot;
export const idleActivitySnapshot = () => idle;
export const subscribeActivity = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Count overlapping operations, including authentication and response parsing. Completion is idempotent. */
export function startActivity(kind: ActivityKind) {
  if (typeof window === 'undefined') return () => {};
  const update = (delta: number) => {
    snapshot = { ...snapshot, [kind]: snapshot[kind] + delta };
    listeners.forEach((listener) => listener());
  };
  update(1);
  let finished = false;
  return () => { if (!finished) { finished = true; update(-1); } };
}

export async function withActivity<T>(kind: ActivityKind, operation: () => Promise<T>): Promise<T> {
  const finish = startActivity(kind);
  try { return await operation(); } finally { finish(); }
}
