import {
  DEFAULT_PLAN_DAYS,
  DEFAULT_WEEKLY_GOAL_MIN,
  adjustTarget,
  buildWeek,
  firstWeekTarget,
  nextWeekTargets,
  plannedSessionId,
} from '@/domain/planner';
import { makeSession } from '../helpers/factories';

describe('defaults', () => {
  it('plans Mon 6-count, Tue Navy, Wed Navy, Sun 6-count for 80 minutes', () => {
    expect(DEFAULT_PLAN_DAYS).toEqual([
      { dayOfWeek: 0, movement: 'SIX_COUNT' },
      { dayOfWeek: 1, movement: 'NAVY_SEAL' },
      { dayOfWeek: 2, movement: 'NAVY_SEAL' },
      { dayOfWeek: 6, movement: 'SIX_COUNT' },
    ]);
    expect(DEFAULT_WEEKLY_GOAL_MIN).toBe(80);
  });

  it('splits the 80-minute budget evenly between movements', () => {
    const sixCount = DEFAULT_PLAN_DAYS.filter((d) => d.movement === 'SIX_COUNT').length;
    const navy = DEFAULT_PLAN_DAYS.filter((d) => d.movement === 'NAVY_SEAL').length;
    expect(sixCount).toBe(2);
    expect(navy).toBe(2);
  });
});

describe('adjustTarget', () => {
  it('adds 3% (min +2) when the target was hit at effort 7 or less', () => {
    expect(adjustTarget({ previousTarget: 100, achievedReps: 100, effort: 7 })).toBe(103);
    expect(adjustTarget({ previousTarget: 20, achievedReps: 25, effort: 3 })).toBe(22); // min +2
  });

  it('adds 2% (min +1) at effort 8–9', () => {
    expect(adjustTarget({ previousTarget: 100, achievedReps: 101, effort: 8 })).toBe(102);
    expect(adjustTarget({ previousTarget: 10, achievedReps: 10, effort: 9 })).toBe(11); // min +1
  });

  it('treats a missing effort rating as the 8–9 band', () => {
    expect(adjustTarget({ previousTarget: 100, achievedReps: 100, effort: null })).toBe(102);
  });

  it('holds the target at effort 10', () => {
    expect(adjustTarget({ previousTarget: 292, achievedReps: 292, effort: 10 })).toBe(292);
  });

  it('holds the target when missed by 5% or less', () => {
    expect(adjustTarget({ previousTarget: 100, achievedReps: 96, effort: 8 })).toBe(100);
    expect(adjustTarget({ previousTarget: 100, achievedReps: 95, effort: 8 })).toBe(100);
  });

  it('drops 3% when missed by more than 5%', () => {
    expect(adjustTarget({ previousTarget: 100, achievedReps: 90, effort: 9 })).toBe(97);
    expect(adjustTarget({ previousTarget: 10, achievedReps: 1, effort: 10 })).toBe(9); // min -1
    expect(adjustTarget({ previousTarget: 1, achievedReps: 0, effort: 5 })).toBe(1);   // floor of 1
  });

  it('never stacks a missed session', () => {
    expect(adjustTarget({ previousTarget: 292, achievedReps: null, effort: null })).toBe(292);
  });
});

describe('firstWeekTarget', () => {
  it('starts at 90% of the next landmark', () => {
    expect(firstWeekTarget({ nextLandmark: 300, lastBest: 0 })).toBe(270);
    expect(firstWeekTarget({ nextLandmark: 135, lastBest: 0 })).toBe(122); // ceil(121.5)
  });

  it('uses the last best result when that is higher', () => {
    expect(firstWeekTarget({ nextLandmark: 300, lastBest: 288 })).toBe(288);
  });
});

describe('buildWeek', () => {
  const base = {
    weekStart: '2026-10-05',
    planDays: DEFAULT_PLAN_DAYS,
    targets: { SIX_COUNT: 292, NAVY_SEAL: 130 },
    landmarks: { SIX_COUNT: 325, NAVY_SEAL: 150 },
  };

  it('creates one planned session per plan day with stable ids', () => {
    const week = buildWeek(base);
    expect(week).toHaveLength(4);
    expect(week[0]).toMatchObject({
      id: plannedSessionId('2026-10-05', 0),
      weekStart: '2026-10-05',
      dayOfWeek: 0,
      movement: 'SIX_COUNT',
      targetReps: 292,
      isTestDay: false,
    });
    expect(buildWeek(base)).toEqual(week); // deterministic
  });

  it('is sorted by day of week', () => {
    expect(buildWeek(base).map((p) => p.dayOfWeek)).toEqual([0, 1, 2, 6]);
  });

  it('marks a day as a test day once its target reaches the landmark', () => {
    const week = buildWeek({ ...base, targets: { SIX_COUNT: 325, NAVY_SEAL: 130 } });
    const sixCountDays = week.filter((p) => p.movement === 'SIX_COUNT');
    expect(sixCountDays.every((p) => p.isTestDay)).toBe(true);
    expect(sixCountDays[0]!.targetReps).toBe(325);
    expect(week.filter((p) => p.movement === 'NAVY_SEAL').every((p) => p.isTestDay)).toBe(false);
  });

  it('keeps an overshooting target on a test day', () => {
    const week = buildWeek({ ...base, targets: { SIX_COUNT: 340, NAVY_SEAL: 130 } });
    expect(week[0]!.targetReps).toBe(340);
  });
});

describe('nextWeekTargets', () => {
  const planned = buildWeek({
    weekStart: '2026-10-05',
    planDays: DEFAULT_PLAN_DAYS,
    targets: { SIX_COUNT: 100, NAVY_SEAL: 40 },
    landmarks: { SIX_COUNT: 325, NAVY_SEAL: 150 },
  });

  it('reads the last completed session per movement', () => {
    const early = makeSession({
      id: 'a', movement: 'SIX_COUNT', completedReps: 100, effort: 10,
      startedAt: '2026-10-05T06:00:00.000Z',
    });
    const late = makeSession({
      id: 'b', movement: 'SIX_COUNT', completedReps: 100, effort: 5,
      startedAt: '2026-10-11T06:00:00.000Z',
    });
    const linked = planned.map((p) =>
      p.movement === 'SIX_COUNT'
        ? { ...p, sessionId: p.dayOfWeek === 0 ? 'a' : 'b' }
        : p,
    );
    const next = nextWeekTargets({
      planned: linked,
      sessions: [early, late],
      targets: { SIX_COUNT: 100, NAVY_SEAL: 40 },
    });
    expect(next.SIX_COUNT).toBe(103); // effort 5 from the later session
  });

  it('leaves a movement unchanged when nothing was completed', () => {
    const next = nextWeekTargets({
      planned,
      sessions: [],
      targets: { SIX_COUNT: 100, NAVY_SEAL: 40 },
    });
    expect(next).toEqual({ SIX_COUNT: 100, NAVY_SEAL: 40 });
  });
});
