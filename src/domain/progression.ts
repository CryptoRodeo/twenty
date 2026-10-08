import {
  GRADUATION_ORDER,
  GRADUATION_VALID_DAYS,
  LANDMARK_DURATION_SEC,
  LEVELS,
  MOVEMENTS,
  ZERO_REPS,
  levelByOrder,
  nextLevelAfter,
  type Level,
} from './levels';
import { addDays, diffDays, parseIsoDate, weekStartIso } from './time';
import type { Baseline, LevelEvent, Movement, MovementMap, Session } from './types';

export interface ProgressionInput {
  sessions: Session[];
  baseline: Baseline | null;
  now: Date;
}

export interface MovementProgress {
  movement: Movement;
  best: number;
  target: number;
  met: boolean;
  remaining: number;
  ratio: number; // 0..1, clamped
}

export interface GraduationWeek {
  weekStart: string;
  confirmedAt: string; // ISO timestamp of the later qualifying session
}

export interface ProgressionState {
  currentLevelOrder: number | null;
  currentLevel: Level | null;
  nextLevel: Level | null;
  best: MovementMap<number>;
  nextTargets: MovementMap<MovementProgress>;
  graduated: boolean;
  graduationWeekStart: string | null;
  graduationExpiresAt: string | null;
  daysUntilGraduationExpiry: number | null;
  /** levelOrder → ISO timestamp it was first reached. */
  reachedAt: Record<number, string>;
}

/** Only an exactly-20-minute session can unlock a landmark. `kind` is informational. */
export function isLandmarkEligible(s: Session): boolean {
  return s.durationSec === LANDMARK_DURATION_SEC;
}

export function bestLandmark(sessions: Session[], baseline: Baseline | null): MovementMap<number> {
  const best: MovementMap<number> = { ...(baseline?.bestLandmark ?? ZERO_REPS) };
  for (const s of sessions) {
    if (!isLandmarkEligible(s)) continue;
    if (s.completedReps > best[s.movement]) best[s.movement] = s.completedReps;
  }
  return best;
}

function meetsLevel(best: MovementMap<number>, level: Level): boolean {
  return MOVEMENTS.every((m) => best[m] >= level.targets[m]);
}

/** Highest level order met in both movements, or null if not even 1A is met. */
export function highestOrderMetByReps(best: MovementMap<number>): number | null {
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    if (meetsLevel(best, LEVELS[i]!)) return LEVELS[i]!.order;
  }
  return null;
}

/** The most recent Mon–Sun week containing both graduation landmarks. */
export function findGraduationWeek(
  sessions: Session[],
  baseline: Baseline | null,
): GraduationWeek | null {
  const grad = levelByOrder(GRADUATION_ORDER);
  const byWeek = new Map<string, MovementMap<string | null>>();

  for (const s of sessions) {
    if (!isLandmarkEligible(s)) continue;
    if (s.completedReps < grad.targets[s.movement]) continue;
    const week = weekStartIso(new Date(s.startedAt));
    const slot = byWeek.get(week) ?? { SIX_COUNT: null, NAVY_SEAL: null };
    const existing = slot[s.movement];
    if (existing === null || s.startedAt > existing) slot[s.movement] = s.startedAt;
    byWeek.set(week, slot);
  }

  const qualifying: GraduationWeek[] = [];
  for (const [weekStart, slot] of byWeek) {
    if (slot.SIX_COUNT && slot.NAVY_SEAL) {
      const confirmedAt = slot.SIX_COUNT > slot.NAVY_SEAL ? slot.SIX_COUNT : slot.NAVY_SEAL;
      qualifying.push({ weekStart, confirmedAt });
    }
  }

  // A baseline week has no timestamps; treat it as confirmed at the end of its Sunday.
  if (baseline?.graduationWeekStart) {
    const sunday = addDays(parseIsoDate(baseline.graduationWeekStart), 6);
    sunday.setHours(23, 59, 59, 0);
    qualifying.push({
      weekStart: baseline.graduationWeekStart,
      confirmedAt: sunday.toISOString(),
    });
  }

  if (qualifying.length === 0) return null;
  return qualifying.reduce((a, b) => (b.confirmedAt > a.confirmedAt ? b : a));
}

function progressFor(best: MovementMap<number>, level: Level | null): MovementMap<MovementProgress> {
  const grad = levelByOrder(GRADUATION_ORDER);
  const target = level ?? grad;
  const out = {} as MovementMap<MovementProgress>;
  for (const m of MOVEMENTS) {
    const t = target.targets[m];
    const b = best[m];
    const met = level === null || b >= t;
    out[m] = {
      movement: m,
      best: b,
      target: t,
      met,
      remaining: met ? 0 : t - b,
      ratio: met ? 1 : Math.max(0, Math.min(1, b / t)),
    };
  }
  return out;
}

/**
 * Resolves the level the user is actually on right now, applying the
 * same-week graduation gate, the 30-day graduation expiry, and the imported
 * baseline floor.
 */
export function computeProgression(input: ProgressionInput): ProgressionState {
  const { sessions, baseline, now } = input;
  const best = bestLandmark(sessions, baseline);
  const gradWeek = findGraduationWeek(sessions, baseline);

  let expiresAtIso: string | null = null;
  let daysLeft: number | null = null;
  let graduationHeld = false;

  if (gradWeek) {
    const expires = addDays(new Date(gradWeek.confirmedAt), GRADUATION_VALID_DAYS);
    expiresAtIso = expires.toISOString();
    daysLeft = diffDays(now, expires);
    graduationHeld = daysLeft >= 0;
  }

  let order: number | null = highestOrderMetByReps(best);

  // The imported baseline is a floor. A manually entered level can only reach
  // Graduation when the baseline also names the qualifying week.
  const floorRaw = baseline?.startLevelOrder ?? null;
  if (floorRaw !== null) {
    const floor = baseline?.graduationWeekStart
      ? floorRaw
      : Math.min(floorRaw, GRADUATION_ORDER - 1);
    if (order === null || floor > order) order = floor;
  }

  // An expired graduation always drops the user to 4B, whatever the source.
  if (order === GRADUATION_ORDER && !graduationHeld) order = GRADUATION_ORDER - 1;

  const graduated = order === GRADUATION_ORDER;
  const currentLevel = order === null ? null : levelByOrder(order);
  const nextLevel = nextLevelAfter(order);

  return {
    currentLevelOrder: order,
    currentLevel,
    nextLevel,
    best,
    nextTargets: progressFor(best, nextLevel),
    graduated,
    graduationWeekStart: graduationHeld ? gradWeek!.weekStart : null,
    graduationExpiresAt: expiresAtIso,
    daysUntilGraduationExpiry: daysLeft,
    reachedAt: reachedAtMap(sessions, baseline),
  };
}

/**
 * Level order first reached at each timestamp. Rep-based orders stop at 4B:
 * Graduation (order 10) is stamped only from a qualifying graduation week,
 * at that week's confirmedAt, so landmarks in different weeks never unlock it.
 */
function reachedAtMap(sessions: Session[], baseline: Baseline | null): Record<number, string> {
  const out: Record<number, string> = {};
  const running: MovementMap<number> = { ...(baseline?.bestLandmark ?? ZERO_REPS) };
  const repOrder = (b: MovementMap<number>): number =>
    Math.min(highestOrderMetByReps(b) ?? -1, GRADUATION_ORDER - 1);
  let reached = repOrder(running);

  const ordered = [...sessions]
    .filter(isLandmarkEligible)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  for (const s of ordered) {
    if (s.completedReps > running[s.movement]) running[s.movement] = s.completedReps;
    const now = repOrder(running);
    for (let o = reached + 1; o <= now; o += 1) out[o] = s.startedAt;
    if (now > reached) reached = now;
  }

  const gradWeek = findGraduationWeek(sessions, baseline);
  if (gradWeek) out[GRADUATION_ORDER] = gradWeek.confirmedAt;
  return out;
}

/**
 * Derives the level-change history. Ids are deterministic so the store can
 * upsert these into SQLite repeatedly without creating duplicates.
 */
export function computeLevelEvents(input: ProgressionInput): LevelEvent[] {
  const reachedAt = reachedAtMap(input.sessions, input.baseline);
  const events: LevelEvent[] = Object.entries(reachedAt)
    .map(([order, at]) => ({
      id: `level-${order}-REACHED`,
      levelOrder: Number(order),
      type: 'REACHED' as const,
      at,
    }))
    .sort((a, b) => a.levelOrder - b.levelOrder);

  const state = computeProgression(input);
  if (reachedAt[GRADUATION_ORDER] !== undefined && !state.graduated && state.graduationExpiresAt) {
    events.push({
      id: `level-${GRADUATION_ORDER}-EXPIRED`,
      levelOrder: GRADUATION_ORDER,
      type: 'EXPIRED',
      at: state.graduationExpiresAt,
    });
  }
  return events;
}

/** Formatted expiry warning for the Levels screen, or null when not graduated. */
export function graduationWarning(state: ProgressionState): string | null {
  if (!state.graduated || state.daysUntilGraduationExpiry === null) return null;
  const d = state.daysUntilGraduationExpiry;
  return d === 1 ? 'Graduation expires in 1 day' : `Graduation expires in ${d} days`;
}

/** All-zeros baseline. Saving this is how "skip the import" is recorded. */
export const ZERO_BASELINE: Baseline = {
  startLevelOrder: null,
  bestLandmark: { ...ZERO_REPS },
  totalReps: { ...ZERO_REPS },
  workouts: 0,
  streakWeeks: 0,
  graduationWeekStart: null,
};
