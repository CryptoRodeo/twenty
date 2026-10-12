import { MOVEMENTS, ZERO_REPS } from './levels';
import { bestLandmark } from './progression';
import { MONTH_LABELS, addDays, monthKey, parseIsoDate, toIsoDate, weekStartIso } from './time';
import type { Baseline, Movement, MovementMap, Session } from './types';

export interface Totals {
  total: number;
  byMovement: MovementMap<number>;
  workouts: number;
}

/** Every session counts toward totals, whatever its duration. */
export function computeTotals(sessions: Session[], baseline: Baseline | null): Totals {
  const byMovement: MovementMap<number> = { ...(baseline?.totalReps ?? ZERO_REPS) };
  for (const s of sessions) byMovement[s.movement] += s.completedReps;
  return {
    byMovement,
    total: MOVEMENTS.reduce((sum, m) => sum + byMovement[m], 0),
    workouts: (baseline?.workouts ?? 0) + sessions.length,
  };
}

export interface PersonalRecords {
  /** Best exactly-20-minute result per movement. */
  best20Min: MovementMap<number>;
  totalByMovement: MovementMap<number>;
}

export function computeRecords(sessions: Session[], baseline: Baseline | null): PersonalRecords {
  return {
    best20Min: bestLandmark(sessions, baseline),
    totalByMovement: computeTotals(sessions, baseline).byMovement,
  };
}

/** Total planned minutes logged in the Mon–Sun week starting `weekStart`. */
export function weeklyMinutes(sessions: Session[], weekStart: string): number {
  const seconds = sessions
    .filter((s) => weekStartIso(new Date(s.startedAt)) === weekStart)
    .reduce((sum, s) => sum + s.durationSec, 0);
  return Math.round(seconds / 60);
}

export interface StreakInput {
  sessions: Session[];
  baseline: Baseline | null;
  weeklyGoalMin: number;
  now: Date;
}

/**
 * Consecutive Mon–Sun weeks meeting the weekly minute goal, counting back
 * from this week (or last week if this week has not qualified yet). If the
 * chain runs past the first recorded session, the imported streak is added.
 */
export function computeStreakWeeks(input: StreakInput): number {
  const { sessions, baseline, weeklyGoalMin, now } = input;
  const imported = baseline?.streakWeeks ?? 0;
  if (sessions.length === 0) return imported;

  const minutesByWeek = new Map<string, number>();
  for (const s of sessions) {
    const week = weekStartIso(new Date(s.startedAt));
    minutesByWeek.set(week, (minutesByWeek.get(week) ?? 0) + s.durationSec / 60);
  }
  const qualifies = (week: string): boolean =>
    Math.round(minutesByWeek.get(week) ?? 0) >= weeklyGoalMin;

  const earliestWeek = [...minutesByWeek.keys()].sort()[0]!;

  const thisWeek = weekStartIso(now);
  let cursor = qualifies(thisWeek)
    ? thisWeek
    : toIsoDate(addDays(parseIsoDate(thisWeek), -7));

  let streak = 0;
  while (qualifies(cursor)) {
    streak += 1;
    cursor = toIsoDate(addDays(parseIsoDate(cursor), -7));
    if (cursor < earliestWeek) return streak + imported;
  }
  return streak;
}

export type Bucket = 'WORKOUT' | 'WEEK' | 'MONTH';

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
}

export interface ChartInput {
  sessions: Session[];
  movement: Movement;
  bucket: Bucket;
  /** Keep only the most recent N points. */
  limit?: number;
}

function dayLabel(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function buildChartSeries(input: ChartInput): ChartPoint[] {
  const mine = input.sessions
    .filter((s) => s.movement === input.movement)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  let points: ChartPoint[];

  if (input.bucket === 'WORKOUT') {
    points = mine.map((s) => ({
      key: s.id,
      label: dayLabel(new Date(s.startedAt)),
      value: s.completedReps,
    }));
  } else {
    const grouped = new Map<string, number>();
    for (const s of mine) {
      const d = new Date(s.startedAt);
      const key = input.bucket === 'WEEK' ? weekStartIso(d) : monthKey(d);
      grouped.set(key, (grouped.get(key) ?? 0) + s.completedReps);
    }
    points = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        label:
          input.bucket === 'WEEK'
            ? dayLabel(parseIsoDate(key))
            : MONTH_LABELS[Number(key.slice(5, 7)) - 1]!,
        value,
      }));
  }

  return input.limit === undefined ? points : points.slice(-input.limit);
}

export function peakValue(points: ChartPoint[]): number {
  return points.reduce((max, p) => (p.value > max ? p.value : max), 0);
}
