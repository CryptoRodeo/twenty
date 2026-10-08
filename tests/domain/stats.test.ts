import { bestLandmark } from '@/domain/progression';
import {
  buildChartSeries,
  computeRecords,
  computeStreakWeeks,
  computeTotals,
  peakValue,
  weeklyMinutes,
} from '@/domain/stats';
import { addDays, parseIsoDate, toIsoDate } from '@/domain/time';
import { makeBaseline, makeSession } from '../helpers/factories';

const NOW = new Date(2026, 9, 7); // Wed of the week starting 2026-10-05

/** Four 20-minute sessions on Mon, Tue, Wed and Sun of the week starting on the given Monday. */
function fullWeek(monday: string) {
  return [0, 1, 2, 6].map((d) =>
    makeSession({
      startedAt: `${toIsoDate(addDays(parseIsoDate(monday), d))}T06:00:00.000Z`,
      durationSec: 1200,
      completedReps: 100,
    }),
  );
}

describe('computeTotals', () => {
  it('sums completed reps per movement and counts workouts', () => {
    const totals = computeTotals(
      [
        makeSession({ movement: 'SIX_COUNT', completedReps: 100 }),
        makeSession({ movement: 'SIX_COUNT', completedReps: 50, durationSec: 600 }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 40 }),
      ],
      null,
    );
    expect(totals).toEqual({
      total: 190,
      byMovement: { SIX_COUNT: 150, NAVY_SEAL: 40 },
      workouts: 3,
    });
  });

  it('adds the imported baseline on top', () => {
    const totals = computeTotals(
      [makeSession({ movement: 'SIX_COUNT', completedReps: 100 })],
      makeBaseline({
        totalReps: { SIX_COUNT: 35_617, NAVY_SEAL: 15_344 },
        workouts: 245,
      }),
    );
    expect(totals.byMovement.SIX_COUNT).toBe(35_717);
    expect(totals.total).toBe(51_061);
    expect(totals.workouts).toBe(246);
  });
});

describe('computeRecords', () => {
  it('reports the best exactly-20-minute result per movement', () => {
    const records = computeRecords(
      [
        makeSession({ movement: 'SIX_COUNT', completedReps: 288 }),
        makeSession({ movement: 'SIX_COUNT', completedReps: 500, durationSec: 2400 }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 140 }),
      ],
      null,
    );
    expect(records.best20Min).toEqual({ SIX_COUNT: 288, NAVY_SEAL: 140 });
  });

  it('keeps imported bests and lifetime totals', () => {
    const records = computeRecords(
      [],
      makeBaseline({
        bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 },
        totalReps: { SIX_COUNT: 35_617, NAVY_SEAL: 15_344 },
      }),
    );
    expect(records.best20Min).toEqual({ SIX_COUNT: 325, NAVY_SEAL: 150 });
    expect(records.totalByMovement).toEqual({ SIX_COUNT: 35_617, NAVY_SEAL: 15_344 });
  });

  it('agrees with the progression bestLandmark (one implementation)', () => {
    const sessions = [
      makeSession({ movement: 'SIX_COUNT', completedReps: 330 }),
      makeSession({ movement: 'SIX_COUNT', completedReps: 900, durationSec: 1199 }),
      makeSession({ movement: 'NAVY_SEAL', completedReps: 10 }),
    ];
    const baseline = makeBaseline({ bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 } });
    expect(computeRecords(sessions, baseline).best20Min).toEqual(bestLandmark(sessions, baseline));
    expect(computeRecords(sessions, baseline).best20Min).toEqual({ SIX_COUNT: 330, NAVY_SEAL: 150 });
  });
});

describe('weeklyMinutes', () => {
  it('sums planned duration for the Mon–Sun week', () => {
    expect(weeklyMinutes(fullWeek('2026-10-05'), '2026-10-05')).toBe(80);
  });

  it('ignores sessions from other weeks', () => {
    expect(weeklyMinutes(fullWeek('2026-09-28'), '2026-10-05')).toBe(0);
  });

  it('counts custom durations too', () => {
    expect(weeklyMinutes([makeSession({ startedAt: '2026-10-07T06:00:00.000Z', durationSec: 600 })], '2026-10-05')).toBe(10);
  });
});

describe('computeStreakWeeks', () => {
  const goal = 80;

  it('is 0 with no sessions and no baseline', () => {
    expect(computeStreakWeeks({ sessions: [], baseline: null, weeklyGoalMin: goal, now: NOW })).toBe(0);
  });

  it('counts consecutive qualifying weeks up to this week', () => {
    const sessions = [...fullWeek('2026-09-21'), ...fullWeek('2026-09-28'), ...fullWeek('2026-10-05')];
    expect(computeStreakWeeks({ sessions, baseline: null, weeklyGoalMin: goal, now: NOW })).toBe(3);
  });

  it('still counts when this week is not finished yet', () => {
    const sessions = [...fullWeek('2026-09-21'), ...fullWeek('2026-09-28')];
    expect(computeStreakWeeks({ sessions, baseline: null, weeklyGoalMin: goal, now: NOW })).toBe(2);
  });

  it('breaks on a short week', () => {
    const sessions = [
      ...fullWeek('2026-09-21'),
      makeSession({ startedAt: '2026-09-29T06:00:00.000Z', durationSec: 1200 }),
      ...fullWeek('2026-10-05'),
    ];
    expect(computeStreakWeeks({ sessions, baseline: null, weeklyGoalMin: goal, now: NOW })).toBe(1);
  });

  it('adds the imported streak when the chain reaches the first recorded week', () => {
    const sessions = [...fullWeek('2026-09-28'), ...fullWeek('2026-10-05')];
    const baseline = makeBaseline({ streakWeeks: 16 });
    expect(computeStreakWeeks({ sessions, baseline, weeklyGoalMin: goal, now: NOW })).toBe(18);
  });

  it('does not add the imported streak once the chain has been broken', () => {
    const sessions = [...fullWeek('2026-09-21'), ...fullWeek('2026-10-05')]; // 09-28 missing
    const baseline = makeBaseline({ streakWeeks: 16 });
    expect(computeStreakWeeks({ sessions, baseline, weeklyGoalMin: goal, now: NOW })).toBe(1);
  });

  it('falls back to the imported streak before any session is logged', () => {
    const baseline = makeBaseline({ streakWeeks: 16 });
    expect(computeStreakWeeks({ sessions: [], baseline, weeklyGoalMin: goal, now: NOW })).toBe(16);
  });
});

describe('buildChartSeries', () => {
  const sessions = [
    makeSession({ movement: 'SIX_COUNT', completedReps: 100, startedAt: '2026-09-07T06:00:00.000Z' }),
    makeSession({ movement: 'SIX_COUNT', completedReps: 120, startedAt: '2026-10-05T06:00:00.000Z' }),
    makeSession({ movement: 'SIX_COUNT', completedReps: 130, startedAt: '2026-10-07T06:00:00.000Z' }),
    makeSession({ movement: 'NAVY_SEAL', completedReps: 60, startedAt: '2026-10-06T06:00:00.000Z' }),
  ];

  it('filters by movement', () => {
    expect(buildChartSeries({ sessions, movement: 'NAVY_SEAL', bucket: 'WORKOUT' })).toHaveLength(1);
  });

  it('gives one ascending point per workout', () => {
    const points = buildChartSeries({ sessions, movement: 'SIX_COUNT', bucket: 'WORKOUT' });
    expect(points.map((p) => p.value)).toEqual([100, 120, 130]);
    expect(points[2]!.label).toBe('7/10');
  });

  it('sums by Mon–Sun week', () => {
    const points = buildChartSeries({ sessions, movement: 'SIX_COUNT', bucket: 'WEEK' });
    expect(points.map((p) => [p.key, p.value])).toEqual([
      ['2026-09-07', 100],
      ['2026-10-05', 250],
    ]);
  });

  it('sums by month with short month labels', () => {
    const points = buildChartSeries({ sessions, movement: 'SIX_COUNT', bucket: 'MONTH' });
    expect(points.map((p) => [p.label, p.value])).toEqual([
      ['Sep', 100],
      ['Oct', 250],
    ]);
  });

  it('keeps only the most recent `limit` points', () => {
    const points = buildChartSeries({ sessions, movement: 'SIX_COUNT', bucket: 'WORKOUT', limit: 2 });
    expect(points.map((p) => p.value)).toEqual([120, 130]);
  });

  it('returns an empty series rather than throwing when there is no data', () => {
    expect(buildChartSeries({ sessions: [], movement: 'SIX_COUNT', bucket: 'WEEK' })).toEqual([]);
    expect(peakValue([])).toBe(0);
  });
});

describe('peakValue', () => {
  it('reports the tallest bar', () => {
    expect(peakValue(buildChartSeries({
      sessions: [
        makeSession({ completedReps: 100, startedAt: '2026-10-05T06:00:00.000Z' }),
        makeSession({ completedReps: 130, startedAt: '2026-10-07T06:00:00.000Z' }),
      ],
      movement: 'SIX_COUNT',
      bucket: 'WORKOUT',
    }))).toBe(130);
  });
});
