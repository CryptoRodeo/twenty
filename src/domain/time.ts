/**
 * All helpers are local-time and Monday-first (dayIndex 0 = Monday).
 * Date-only strings are always `YYYY-MM-DD`.
 */

const MS_PER_DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export const DAY_LETTERS: readonly string[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

/** The Monday of the Mon–Sun week containing `d`. */
export function weekStartIso(d: Date): string {
  return toIsoDate(addDays(d, -dayIndex(d)));
}

/** Whole calendar days from `from` to `to`; negative if `to` is earlier. */
export function diffDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const DAY_NAMES: readonly string[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
