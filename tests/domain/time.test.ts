import {
  addDays,
  dayIndex,
  diffDays,
  monthKey,
  parseIsoDate,
  toIsoDate,
  weekStartIso,
} from '@/domain/time';

// 2026-10-07 is a Wednesday.
const wed = new Date(2026, 9, 7, 18, 30);

describe('time helpers', () => {
  it('formats and reparses local date-only strings', () => {
    expect(toIsoDate(wed)).toBe('2026-10-07');
    expect(toIsoDate(parseIsoDate('2026-10-07'))).toBe('2026-10-07');
  });

  it('indexes days Monday-first', () => {
    expect(dayIndex(new Date(2026, 9, 5))).toBe(0); // Monday
    expect(dayIndex(wed)).toBe(2);                  // Wednesday
    expect(dayIndex(new Date(2026, 9, 11))).toBe(6); // Sunday
  });

  it('snaps any day to its Monday', () => {
    expect(weekStartIso(wed)).toBe('2026-10-05');
    expect(weekStartIso(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(weekStartIso(new Date(2026, 9, 11))).toBe('2026-10-05');
    expect(weekStartIso(new Date(2026, 9, 12))).toBe('2026-10-12');
  });

  it('adds days across a month boundary without mutating the input', () => {
    const base = new Date(2026, 9, 30);
    expect(toIsoDate(addDays(base, 3))).toBe('2026-11-02');
    expect(toIsoDate(base)).toBe('2026-10-30');
    expect(toIsoDate(addDays(base, -30))).toBe('2026-09-30');
  });

  it('counts whole calendar days between dates, ignoring time of day', () => {
    expect(diffDays(new Date(2026, 9, 1, 23, 59), new Date(2026, 9, 31, 0, 1))).toBe(30);
    expect(diffDays(wed, wed)).toBe(0);
    expect(diffDays(new Date(2026, 9, 8), wed)).toBe(-1);
  });

  it('buckets by month', () => {
    expect(monthKey(wed)).toBe('2026-10');
  });
});
