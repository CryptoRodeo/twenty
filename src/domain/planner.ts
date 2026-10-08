import { MOVEMENTS } from './levels';
import type { Movement, MovementMap, PlanDay, PlannedSession, Session } from './types';

/** Matches the owner's current habit; editable on the Edit Week screen. */
export const DEFAULT_PLAN_DAYS: PlanDay[] = [
  { dayOfWeek: 0, movement: 'SIX_COUNT' },
  { dayOfWeek: 1, movement: 'NAVY_SEAL' },
  { dayOfWeek: 2, movement: 'NAVY_SEAL' },
  { dayOfWeek: 6, movement: 'SIX_COUNT' },
];

/** 4 × 20-minute sessions, split evenly between the two movements. */
export const DEFAULT_WEEKLY_GOAL_MIN = 80;

export const FIRST_WEEK_FRACTION = 0.9;

const MISS_TOLERANCE = 0.05;
const BUMP_EASY = 0.03;
const BUMP_HARD = 0.02;
const BACK_OFF = 0.03;

export interface AdjustInput {
  previousTarget: number;
  /** `null` means the session was not completed. */
  achievedReps: number | null;
  effort: number | null;
}

/**
 * THE progression rule. Change how targets move week to week here and
 * nowhere else.
 */
export function adjustTarget(input: AdjustInput): number {
  const { previousTarget: prev, achievedReps, effort } = input;

  // Missed sessions never stack — the target simply carries over.
  if (achievedReps === null) return prev;

  if (achievedReps >= prev) {
    if (effort !== null && effort >= 10) return prev;
    if (effort !== null && effort <= 7) {
      return Math.max(Math.ceil(prev * (1 + BUMP_EASY)), prev + 2);
    }
    // effort 8–9, or not entered at all
    return Math.max(Math.ceil(prev * (1 + BUMP_HARD)), prev + 1);
  }

  const shortfall = (prev - achievedReps) / prev;
  if (shortfall <= MISS_TOLERANCE) return prev;
  return Math.max(1, Math.min(Math.floor(prev * (1 - BACK_OFF)), prev - 1));
}

/** Opening target for a movement: 90% of the next landmark, or the last best. */
export function firstWeekTarget(input: { nextLandmark: number; lastBest: number }): number {
  return Math.max(Math.ceil(input.nextLandmark * FIRST_WEEK_FRACTION), input.lastBest);
}

export function plannedSessionId(weekStart: string, dayOfWeek: number): string {
  return `${weekStart}-${dayOfWeek}`;
}

export interface BuildWeekInput {
  weekStart: string;
  planDays: PlanDay[];
  targets: MovementMap<number>;
  /** The next landmark per movement, from progression state. */
  landmarks: MovementMap<number>;
}

export function buildWeek(input: BuildWeekInput): PlannedSession[] {
  return [...input.planDays]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((day) => {
      const target = input.targets[day.movement];
      const landmark = input.landmarks[day.movement];
      const isTestDay = target >= landmark;
      return {
        id: plannedSessionId(input.weekStart, day.dayOfWeek),
        weekStart: input.weekStart,
        dayOfWeek: day.dayOfWeek,
        movement: day.movement,
        targetReps: isTestDay ? Math.max(target, landmark) : target,
        isTestDay,
      };
    });
}

export interface NextWeekInput {
  /** This week's planned sessions, with `sessionId` set where completed. */
  planned: PlannedSession[];
  /** All sessions — used to look up the linked ones. */
  sessions: Session[];
  /** This week's targets. */
  targets: MovementMap<number>;
}

/** Decision 7: the adjustment reads the LAST completed session per movement. */
export function nextWeekTargets(input: NextWeekInput): MovementMap<number> {
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  const out = {} as MovementMap<number>;

  for (const movement of MOVEMENTS) {
    const done = input.planned
      .filter((p): p is PlannedSession & { sessionId: string } =>
        p.movement === movement && typeof p.sessionId === 'string')
      .map((p) => byId.get(p.sessionId))
      .filter((s): s is Session => s !== undefined)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    const last = done.at(-1);
    out[movement] = adjustTarget({
      previousTarget: input.targets[movement],
      achievedReps: last ? last.completedReps : null,
      effort: last ? last.effort : null,
    });
  }
  return out;
}

/** Which movement, if any, is planned for a given day index. */
export function movementForDay(planDays: PlanDay[], dayOfWeek: number): Movement | null {
  return planDays.find((d) => d.dayOfWeek === dayOfWeek)?.movement ?? null;
}

export interface PlanWeekInput {
  weekStart: string;
  planDays: PlanDay[];
  /** Last week's planned rows; empty when last week was never planned. */
  previousWeek: PlannedSession[];
  sessions: Session[];
  /** The next landmark per movement, from progression state. */
  landmarks: MovementMap<number>;
  /**
   * The next landmark per movement as it stood when last week was planned.
   * A movement whose landmark has risen since (a level-up) opens again with
   * the first-week rule instead of adjusting last week's target.
   */
  previousLandmarks: MovementMap<number>;
  /** Current best landmark reps per movement — the first-week floor. */
  best: MovementMap<number>;
}

/**
 * Decides a whole week: adjust last week's targets when it was planned,
 * otherwise open with the first-week fraction of the next landmark. After a
 * level-up (the next landmark rose) that movement opens with the first-week
 * rule for the new level; weekly adjustment continues from there.
 */
export function planWeek(input: PlanWeekInput): PlannedSession[] {
  const { previousWeek, landmarks, best } = input;
  const opening = {} as MovementMap<number>;
  for (const m of MOVEMENTS) {
    opening[m] = firstWeekTarget({ nextLandmark: landmarks[m], lastBest: best[m] });
  }

  let targets = opening;
  if (previousWeek.length > 0) {
    const previousTargets = {} as MovementMap<number>;
    for (const m of MOVEMENTS) {
      previousTargets[m] = previousWeek.find((p) => p.movement === m)?.targetReps ?? opening[m];
    }
    const adjusted = nextWeekTargets({
      planned: previousWeek,
      sessions: input.sessions,
      targets: previousTargets,
    });
    targets = {} as MovementMap<number>;
    for (const m of MOVEMENTS) {
      targets[m] = landmarks[m] > input.previousLandmarks[m] ? opening[m] : adjusted[m];
    }
  }

  return buildWeek({ weekStart: input.weekStart, planDays: input.planDays, targets, landmarks });
}
