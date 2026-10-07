/**
 * Pure pacing math. Workout time `t` is in seconds, where t = 0 is the moment
 * rep 1 should start; the count-in occupies negative t.
 *
 * ACCURACY RULE: elapsed time is always derived as
 * `now - startedAt - pausedTotal`. Never sum up tick deltas — that drifts.
 */

export interface PacingConfig {
  durationSec: number;
  targetReps: number;
  countInSec: number;
}

export function intervalSec(c: PacingConfig): number {
  if (c.targetReps < 1) throw new Error('targetReps must be at least 1');
  return c.durationSec / c.targetReps;
}

/** `repNumber` is 1-based. */
export function repStartSec(c: PacingConfig, repNumber: number): number {
  return (repNumber - 1) * intervalSec(c);
}

/** How many reps should have started by `elapsedSec`, clamped to [0, target]. */
export function repsDueAt(c: PacingConfig, elapsedSec: number): number {
  if (elapsedSec < 0) return 0;
  const due = Math.floor(elapsedSec / intervalSec(c)) + 1;
  return Math.min(c.targetReps, due);
}

/** Progress 0..1 through the current rep's interval — drives the pace ring. */
export function repProgress(c: PacingConfig, elapsedSec: number): number {
  if (elapsedSec < 0) return 0;
  const i = intervalSec(c);
  return (elapsedSec % i) / i;
}

/** Positive = ahead of pace, negative = behind. */
export function onPaceDelta(c: PacingConfig, elapsedSec: number, completedReps: number): number {
  return completedReps - repsDueAt(c, elapsedSec);
}

export function remainingSec(c: PacingConfig, elapsedSec: number): number {
  return Math.max(0, c.durationSec - elapsedSec);
}

/** `mm:ss`, rounding up so the display only reads 00:00 when truly done. */
export function formatClock(sec: number): string {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export interface ClockState {
  startedAtMs: number;
  pausedTotalMs: number;
  pausedAtMs: number | null;
}

export function createClock(nowMs: number): ClockState {
  return { startedAtMs: nowMs, pausedTotalMs: 0, pausedAtMs: null };
}

export function isPaused(clock: ClockState): boolean {
  return clock.pausedAtMs !== null;
}

export function elapsedMs(clock: ClockState, nowMs: number): number {
  const reference = clock.pausedAtMs ?? nowMs;
  return Math.max(0, reference - clock.startedAtMs - clock.pausedTotalMs);
}

export function pauseClock(clock: ClockState, nowMs: number): ClockState {
  if (isPaused(clock)) return clock;
  return { ...clock, pausedAtMs: nowMs };
}

export function resumeClock(clock: ClockState, nowMs: number): ClockState {
  if (clock.pausedAtMs === null) return clock;
  return {
    startedAtMs: clock.startedAtMs,
    pausedTotalMs: clock.pausedTotalMs + (nowMs - clock.pausedAtMs),
    pausedAtMs: null,
  };
}

export type CueType = 'COUNT_IN' | 'REP' | 'FINAL_MINUTE' | 'END';

export interface Cue {
  type: CueType;
  atSec: number;
  repNumber?: number;
}

const FINAL_MINUTE_SEC = 60;

export function buildCueSchedule(c: PacingConfig): Cue[] {
  const cues: Cue[] = [];
  for (const n of [3, 2, 1]) {
    if (n <= c.countInSec) cues.push({ type: 'COUNT_IN', atSec: -n });
  }
  for (let rep = 1; rep <= c.targetReps; rep += 1) {
    cues.push({ type: 'REP', atSec: repStartSec(c, rep), repNumber: rep });
  }
  if (c.durationSec > FINAL_MINUTE_SEC) {
    cues.push({ type: 'FINAL_MINUTE', atSec: c.durationSec - FINAL_MINUTE_SEC });
  }
  cues.push({ type: 'END', atSec: c.durationSec });
  return cues.sort((a, b) => a.atSec - b.atSec);
}

/**
 * Cues in the half-open window (fromSec, toSec]. The engine passes the
 * previous and current tick times, so a late tick replays every cue it
 * skipped and no cue can fire twice.
 */
export function cuesBetween(schedule: Cue[], fromSec: number, toSec: number): Cue[] {
  return schedule.filter((q) => q.atSec > fromSec && q.atSec <= toSec);
}
