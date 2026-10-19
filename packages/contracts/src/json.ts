/** Safe JSON parsing for untrusted import payloads. */
export const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const IMPORT_LIMITS = { maxBytes: 5 * 1024 * 1024, maxQuestions: 1000 } as const;

export interface ParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

/** Parse JSON text, rejecting prototype-polluting keys and oversize documents. */
export function parseBatchJson(text: string): ParseResult {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > IMPORT_LIMITS.maxBytes)
    return { ok: false, error: `document is ${(bytes / 1024 / 1024).toFixed(2)} MB; limit is ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB` };
  let value: unknown;
  try {
    let unsafeKey: string | undefined;
    value = JSON.parse(text, function reviver(key, v) {
      if (UNSAFE_KEYS.has(key)) unsafeKey = key;
      return v;
    });
    if (unsafeKey) return { ok: false, error: `unsafe key "${unsafeKey}" is not allowed` };
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'document must be a JSON object' };
  return { ok: true, value };
}
