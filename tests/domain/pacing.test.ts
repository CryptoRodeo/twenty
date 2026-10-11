import {
  buildCueSchedule,
  createClock,
  cuesBetween,
  elapsedMs,
  formatClock,
  intervalSec,
  isPaused,
  pauseClock,
  remainingSec,
  repProgress,
  repStartSec,
  resumeClock,
  type PacingConfig,
} from '@/domain/pacing';

const c20 = (targetReps: number): PacingConfig => ({ durationSec: 1200, targetReps, countInSec: 10 });

describe('interval math', () => {
  it('splits the window evenly across reps', () => {
    expect(intervalSec(c20(292))).toBeCloseTo(4.1096, 4);
    expect(intervalSec(c20(300))).toBe(4);
    expect(intervalSec({ durationSec: 120, targetReps: 30, countInSec: 10 })).toBe(4);
  });

  it('refuses a target below 1 rep', () => {
    expect(() => intervalSec(c20(0))).toThrow('targetReps must be at least 1');
  });

  it('starts rep 1 at t=0 and rep n at (n-1) intervals', () => {
    const c = c20(300);
    expect(repStartSec(c, 1)).toBe(0);
    expect(repStartSec(c, 2)).toBe(4);
    expect(repStartSec(c, 300)).toBe(1196);
  });
});

describe('repProgress', () => {
  const c = c20(300);

  it('fills 0→1 across one interval', () => {
    expect(repProgress(c, 0)).toBe(0);
    expect(repProgress(c, 2)).toBeCloseTo(0.5, 5);
    expect(repProgress(c, 3.999)).toBeCloseTo(0.99975, 5);
    expect(repProgress(c, 4)).toBe(0);
  });

  it('stays 0 during the count-in', () => {
    expect(repProgress(c, -2)).toBe(0);
  });
});

describe('remainingSec and formatClock', () => {
  it('counts down and never goes negative', () => {
    expect(remainingSec(c20(300), 0)).toBe(1200);
    expect(remainingSec(c20(300), 1199.2)).toBeCloseTo(0.8, 5);
    expect(remainingSec(c20(300), 1300)).toBe(0);
  });

  it('formats mm:ss, rounding up so 0 appears only at the end', () => {
    expect(formatClock(1200)).toBe('20:00');
    expect(formatClock(59.2)).toBe('01:00');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
  });
});

describe('ClockState', () => {
  it('computes elapsed from timestamps, so irregular ticks never drift', () => {
    const clock = createClock(1_000_000);
    // Deliberately jittery tick times.
    for (const now of [1_000_050, 1_000_900, 1_002_400, 1_003_001]) {
      expect(elapsedMs(clock, now)).toBe(now - 1_000_000);
    }
  });

  it('freezes while paused and excludes paused time after resume', () => {
    let clock = createClock(0);
    clock = pauseClock(clock, 5_000);
    expect(isPaused(clock)).toBe(true);
    expect(elapsedMs(clock, 5_000)).toBe(5_000);
    expect(elapsedMs(clock, 60_000)).toBe(5_000); // frozen
    clock = resumeClock(clock, 65_000);
    expect(isPaused(clock)).toBe(false);
    expect(elapsedMs(clock, 66_000)).toBe(6_000); // 5s before + 1s after
  });

  it('accumulates multiple pauses', () => {
    let clock = createClock(0);
    clock = resumeClock(pauseClock(clock, 1_000), 3_000); // 2s paused
    clock = resumeClock(pauseClock(clock, 4_000), 9_000); // 5s paused
    expect(elapsedMs(clock, 10_000)).toBe(3_000);
  });

  it('ignores a redundant pause or resume', () => {
    let clock = createClock(0);
    clock = pauseClock(clock, 1_000);
    clock = pauseClock(clock, 2_000);
    expect(elapsedMs(clock, 9_000)).toBe(1_000);
    clock = resumeClock(clock, 3_000);
    clock = resumeClock(clock, 4_000);
    expect(elapsedMs(clock, 5_000)).toBe(3_000);
  });

  it('never reports negative elapsed time', () => {
    expect(elapsedMs(createClock(1_000), 500)).toBe(0);
  });
});

describe('cue schedule', () => {
  const c: PacingConfig = { durationSec: 120, targetReps: 30, countInSec: 10 };

  it('beeps 3-2-1 before the start', () => {
    const countIn = buildCueSchedule(c).filter((q) => q.type === 'COUNT_IN');
    expect(countIn.map((q) => q.atSec)).toEqual([-3, -2, -1]);
  });

  it('schedules one REP cue per rep, rep 1 at t=0', () => {
    const reps = buildCueSchedule(c).filter((q) => q.type === 'REP');
    expect(reps).toHaveLength(30);
    expect(reps[0]).toMatchObject({ atSec: 0, repNumber: 1 });
    expect(reps[29]).toMatchObject({ atSec: 116, repNumber: 30 });
  });

  it('marks the final minute and the end', () => {
    const schedule = buildCueSchedule(c);
    expect(schedule.find((q) => q.type === 'FINAL_MINUTE')!.atSec).toBe(60);
    expect(schedule.find((q) => q.type === 'END')!.atSec).toBe(120);
  });

  it('omits FINAL_MINUTE for windows of a minute or less', () => {
    const short = buildCueSchedule({ durationSec: 60, targetReps: 10, countInSec: 10 });
    expect(short.some((q) => q.type === 'FINAL_MINUTE')).toBe(false);
  });

  it('is sorted by time', () => {
    const times = buildCueSchedule(c).map((q) => q.atSec);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('cuesBetween', () => {
  const schedule = buildCueSchedule({ durationSec: 120, targetReps: 30, countInSec: 10 });

  it('is half-open (from, to] so no cue fires twice across ticks', () => {
    const first = cuesBetween(schedule, -0.1, 0);
    expect(first.map((q) => q.repNumber)).toEqual([1]);
    expect(cuesBetween(schedule, 0, 0)).toEqual([]);
  });

  it('returns every cue a late tick skipped over', () => {
    const skipped = cuesBetween(schedule, 0, 12.5).filter((q) => q.type === 'REP');
    expect(skipped.map((q) => q.repNumber)).toEqual([2, 3, 4]);
  });
});
