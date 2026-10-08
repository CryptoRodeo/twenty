import {
  buildCueSchedule, createClock, cuesBetween, elapsedMs, formatClock, isPaused,
  onPaceDelta, pauseClock, remainingSec, repProgress, repsDueAt, resumeClock,
  type Cue, type ClockState, type PacingConfig,
} from '@/domain/pacing';

/** Beeps older than this are swallowed, so returning from the background
 *  replays rep counts without firing a burst of sound. */
export const MAX_CATCH_UP_SEC = 1;

export type TimerStatus = 'COUNT_IN' | 'RUNNING' | 'PAUSED' | 'FINISHED';

export interface TimerSnapshot {
  status: TimerStatus;
  /** Workout seconds; negative during the count-in. */
  elapsedSec: number;
  remainingSec: number;
  clockLabel: string;
  dueReps: number;
  completedReps: number;
  repProgress: number;
  onPaceDelta: number;
}

export interface TickResult {
  snapshot: TimerSnapshot;
  /** Every cue crossed since the last tick — drives rep counting. */
  cues: Cue[];
  /** The subset worth playing out loud. */
  audibleCues: Cue[];
}

export interface TimerRuntime {
  tick(nowMs: number): TickResult;
  pause(nowMs: number): void;
  resume(nowMs: number): void;
  adjustReps(delta: number): void;
  end(nowMs: number): TimerSnapshot;
  snapshot(nowMs: number): TimerSnapshot;
}

export function createTimerRuntime(config: PacingConfig, startedAtMs: number): TimerRuntime {
  const schedule = buildCueSchedule(config);
  let clock: ClockState = createClock(startedAtMs);
  let lastSeenSec = -config.countInSec - 1;
  let manualAdjustment = 0;
  let autoReps = 0;
  let finished = false;

  /** Workout time: t = 0 is when rep 1 starts, so the count-in is negative. */
  const workoutSec = (nowMs: number): number =>
    elapsedMs(clock, nowMs) / 1000 - config.countInSec;

  const completed = (): number =>
    Math.max(0, Math.min(config.targetReps, autoReps + manualAdjustment));

  function snapshot(nowMs: number): TimerSnapshot {
    const t = workoutSec(nowMs);
    const status: TimerStatus =
      finished ? 'FINISHED'
      : isPaused(clock) ? 'PAUSED'
      : t < 0 ? 'COUNT_IN'
      : 'RUNNING';

    return {
      status,
      elapsedSec: t,
      remainingSec: remainingSec(config, Math.max(0, t)),
      clockLabel: formatClock(remainingSec(config, Math.max(0, t))),
      dueReps: repsDueAt(config, t),
      completedReps: completed(),
      repProgress: repProgress(config, t),
      onPaceDelta: onPaceDelta(config, t, completed()),
    };
  }

  return {
    snapshot,

    tick(nowMs) {
      if (finished || isPaused(clock)) {
        return { snapshot: snapshot(nowMs), cues: [], audibleCues: [] };
      }

      const t = workoutSec(nowMs);
      const cues = cuesBetween(schedule, lastSeenSec, t);
      lastSeenSec = t;

      for (const cue of cues) {
        if (cue.type === 'REP') autoReps += 1;
        if (cue.type === 'END') finished = true;
      }

      const audibleCues = cues.filter(
        (c) => c.type !== 'REP' || t - c.atSec <= MAX_CATCH_UP_SEC,
      );
      return { snapshot: snapshot(nowMs), cues, audibleCues };
    },

    pause(nowMs) {
      if (!finished) clock = pauseClock(clock, nowMs);
    },

    resume(nowMs) {
      clock = resumeClock(clock, nowMs);
    },

    adjustReps(delta) {
      // Clamp so the total stays within [0, targetReps]; otherwise a stored
      // out-of-range correction would swallow later presses of the opposite sign.
      manualAdjustment = Math.max(
        -autoReps,
        Math.min(config.targetReps - autoReps, manualAdjustment + delta),
      );
    },

    end(nowMs) {
      finished = true;
      return snapshot(nowMs);
    },
  };
}
