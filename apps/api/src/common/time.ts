/** Timezone-aware day boundaries. Server stores UTC; the learner's "day" is defined in `tz`. */

function partsIn(tz: string, date: Date): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') map[p.type] = Number(p.value);
  return { y: map.year!, m: map.month!, d: map.day!, hh: map.hour!, mm: map.minute!, ss: map.second! };
}

/** Offset (ms) such that wallClockUtc(date) = date + offset. */
function tzOffsetMs(tz: string, date: Date): number {
  const p = partsIn(tz, date);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** 'YYYY-MM-DD' of `date` in `tz`. */
export function dayKey(date: Date, tz: string): string {
  const p = partsIn(tz, date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** UTC instant of local midnight (start of the day containing `date`) in `tz`. */
export function startOfDayInTz(date: Date, tz: string): Date {
  const p = partsIn(tz, date);
  const guess = Date.UTC(p.y, p.m - 1, p.d, 0, 0, 0);
  // first pass with offset at the guess, second pass to settle DST edges
  let candidate = new Date(guess - tzOffsetMs(tz, new Date(guess)));
  candidate = new Date(guess - tzOffsetMs(tz, candidate));
  return candidate;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Start of the next local day in `tz` (exclusive end of today). */
export function endOfDayInTz(date: Date, tz: string): Date {
  const start = startOfDayInTz(date, tz);
  return startOfDayInTz(addDays(start, 1.5), tz);
}

export function dayKeyOffset(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
