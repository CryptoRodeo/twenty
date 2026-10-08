import { createTimerRuntime, MAX_CATCH_UP_SEC } from '@/timer/runtime';
import type { PacingConfig } from '@/domain/pacing';

// 30 reps in 120s → one rep every 4s, with a 10s count-in.
const config: PacingConfig = { durationSec: 120, targetReps: 30, countInSec: 10 };
const T0 = 1_000_000;

describe('timer runtime', () => {
  it('starts in the count-in with a negative elapsed time', () => {
    const r = createTimerRuntime(config, T0);
    const snap = r.snapshot(T0);
    expect(snap.status).toBe('COUNT_IN');
    expect(snap.elapsedSec).toBe(-10);
    expect(snap.completedReps).toBe(0);
    expect(snap.clockLabel).toBe('02:00');
  });

  it('fires the 3-2-1 count-in cues, then rep 1 at t=0', () => {
    const r = createTimerRuntime(config, T0);
    expect(r.tick(T0 + 7_000).cues.map((c) => c.type)).toEqual(['COUNT_IN']);
    expect(r.tick(T0 + 9_000).cues).toHaveLength(2); // -2 and -1
    const start = r.tick(T0 + 10_000);
    expect(start.cues.map((c) => c.type)).toEqual(['REP']);
    expect(start.snapshot.status).toBe('RUNNING');
    expect(start.snapshot.completedReps).toBe(1);
  });

  it('counts one rep per interval without drifting on jittery ticks', () => {
    const r = createTimerRuntime(config, T0);
    for (const offset of [10_000, 14_030, 18_007, 22_480, 26_001]) {
      r.tick(T0 + offset);
    }
    const snap = r.snapshot(T0 + 26_001);
    expect(snap.completedReps).toBe(5);
    expect(snap.dueReps).toBe(5);
    expect(snap.onPaceDelta).toBe(0);
    expect(snap.elapsedSec).toBeCloseTo(16.001, 3);
  });

  it('replays skipped reps but silences stale beeps after a stall', () => {
    const r = createTimerRuntime(config, T0);
    r.tick(T0 + 10_000);                 // rep 1
    const late = r.tick(T0 + 38_500);    // t=28.5: reps 2..8 were skipped, only the newest is fresh
    expect(late.cues.filter((c) => c.type === 'REP')).toHaveLength(7);
    expect(late.snapshot.completedReps).toBe(8);
    const audibleReps = late.audibleCues.filter((c) => c.type === 'REP');
    expect(audibleReps).toHaveLength(1); // only the one inside MAX_CATCH_UP_SEC
    expect(MAX_CATCH_UP_SEC).toBe(1);
  });

  it('freezes while paused and resumes without losing position', () => {
    const r = createTimerRuntime(config, T0);
    r.tick(T0 + 14_000);                 // reps 1 and 2
    r.pause(T0 + 15_000);
    expect(r.snapshot(T0 + 60_000).status).toBe('PAUSED');
    expect(r.snapshot(T0 + 60_000).elapsedSec).toBeCloseTo(5, 3);
    expect(r.tick(T0 + 60_000).cues).toEqual([]);
    r.resume(T0 + 60_000);
    const after = r.tick(T0 + 64_000);
    expect(after.snapshot.elapsedSec).toBeCloseTo(9, 3);
    expect(after.snapshot.completedReps).toBe(3);
  });

  it('applies manual +1 / −1 corrections without moving the clock', () => {
    const r = createTimerRuntime(config, T0);
    r.tick(T0 + 14_000); // 2 reps due and counted
    r.adjustReps(-1);
    expect(r.snapshot(T0 + 14_000).completedReps).toBe(1);
    expect(r.snapshot(T0 + 14_000).onPaceDelta).toBe(-1);
    r.adjustReps(+3);
    expect(r.snapshot(T0 + 14_000).completedReps).toBe(4);
  });

  it('keeps a later -1 effective after over-adding past the target', () => {
    const r = createTimerRuntime(config, T0);
    r.tick(T0 + 14_000);
    r.adjustReps(+100);
    expect(r.snapshot(T0 + 14_000).completedReps).toBe(30);
    r.adjustReps(-1);
    expect(r.snapshot(T0 + 14_000).completedReps).toBe(29);
  });

  it('never drops below zero reps', () => {
    const r = createTimerRuntime(config, T0);
    r.adjustReps(-5);
    expect(r.snapshot(T0).completedReps).toBe(0);
  });

  it('marks the final minute and the end exactly once', () => {
    const r = createTimerRuntime(config, T0);
    const toEnd = r.tick(T0 + 131_000);
    expect(toEnd.cues.filter((c) => c.type === 'FINAL_MINUTE')).toHaveLength(1);
    expect(toEnd.cues.filter((c) => c.type === 'END')).toHaveLength(1);
    expect(toEnd.snapshot.status).toBe('FINISHED');
    expect(r.tick(T0 + 140_000).cues).toEqual([]);
  });

  it('clamps the remaining clock and caps reps at the target', () => {
    const r = createTimerRuntime(config, T0);
    const snap = r.tick(T0 + 200_000).snapshot;
    expect(snap.remainingSec).toBe(0);
    expect(snap.clockLabel).toBe('00:00');
    expect(snap.completedReps).toBe(30);
  });

  it('ends early and freezes the snapshot', () => {
    const r = createTimerRuntime(config, T0);
    r.tick(T0 + 22_000); // 4 reps
    const final = r.end(T0 + 22_000);
    expect(final.status).toBe('FINISHED');
    expect(final.completedReps).toBe(4);
    expect(r.tick(T0 + 30_000).cues).toEqual([]);
  });
});
