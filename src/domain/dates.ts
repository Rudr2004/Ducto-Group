// All business dates are ISO calendar dates (YYYY-MM-DD) in Asia/Dubai (UTC+4, no DST).
export type ISODate = string;
const DAY = 86_400_000;
const DUBAI_OFFSET_MIN = 240;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const fromMs = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: ISODate, n: number) => fromMs(toMs(d) + n * DAY);
export const diffDays = (a: ISODate, b: ISODate) => Math.round((toMs(a) - toMs(b)) / DAY);
export const isISODate = (s: unknown): s is ISODate => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Convert a UTC timestamp (ISO) to the Asia/Dubai business date. E18: 23:30Z → next day. */
export function dubaiDate(utcIso: string): ISODate {
  const ms = Date.parse(utcIso);
  return fromMs(ms + DUBAI_OFFSET_MIN * 60_000);
}
export function dubaiTime(utcIso: string): string {
  const d = new Date(Date.parse(utcIso) + DUBAI_OFFSET_MIN * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function fmt(d: ISODate | null | undefined, compact = false): string {
  if (!d) return '—';
  const day = d.slice(8, 10), mon = MON[+d.slice(5, 7) - 1];
  return compact ? `${day} ${mon}` : `${day} ${mon} ${d.slice(0, 4)}`;
}

export interface DayCounting { mode: 'calendar' | 'working'; weekend: number[]; holidays: ISODate[] }
export const isWorkingDay = (d: ISODate, c: DayCounting) =>
  !c.weekend.includes(new Date(toMs(d)).getUTCDay()) && !c.holidays.includes(d);

/** Shift a date by n business days (calendar or working). n may be negative. */
export function shift(d: ISODate, n: number, c: DayCounting): ISODate {
  if (c.mode === 'calendar') return addDays(d, n);
  let cur = d; const step = n >= 0 ? 1 : -1; let left = Math.abs(n);
  // D15: a planned date that lands on a non-working day moves to the nearest working day in the direction of travel
  while (left > 0) { cur = addDays(cur, step); if (isWorkingDay(cur, c)) left--; }
  while (!isWorkingDay(cur, c)) cur = addDays(cur, step);
  return cur;
}

/** dd/mm/yyyy (UAE default) parse. Returns ambiguity flag when both parts ≤ 12 (E19). */
export function parseUaeDate(s: string): { date: ISODate; ambiguous: boolean } | null {
  const m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (!m) return null;
  const a = +m[1], b = +m[2], y = +m[3];
  let day = a, mon = b;
  if (b > 12 && a <= 12) { day = b; mon = a; }
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return { date: `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`, ambiguous: a <= 12 && b <= 12 && a !== b };
}
