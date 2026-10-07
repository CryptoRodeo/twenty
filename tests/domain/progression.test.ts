import {
  bestLandmark,
  computeLevelEvents,
  computeProgression,
  highestOrderMetByReps,
  isLandmarkEligible,
} from '@/domain/progression';
import { EMPTY_BASELINE, makeBaseline, makeSession } from '../helpers/factories';

const NOW = new Date(2026, 9, 7, 12, 0); // Wed 2026-10-07

describe('isLandmarkEligible', () => {
  it('accepts only exactly-20-minute sessions', () => {
    expect(isLandmarkEligible(makeSession({ durationSec: 1200 }))).toBe(true);
    expect(isLandmarkEligible(makeSession({ durationSec: 1199 }))).toBe(false);
    expect(isLandmarkEligible(makeSession({ durationSec: 1800 }))).toBe(false);
  });

  it('ignores session kind', () => {
    expect(isLandmarkEligible(makeSession({ kind: 'CUSTOM', durationSec: 1200 }))).toBe(true);
  });
});

describe('bestLandmark', () => {
  it('takes the max eligible result per movement', () => {
    const best = bestLandmark(
      [
        makeSession({ movement: 'SIX_COUNT', completedReps: 120 }),
        makeSession({ movement: 'SIX_COUNT', completedReps: 160 }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 42 }),
      ],
      EMPTY_BASELINE,
    );
    expect(best).toEqual({ SIX_COUNT: 160, NAVY_SEAL: 42 });
  });

  it('excludes non-20-minute sessions from bests', () => {
    const best = bestLandmark(
      [makeSession({ movement: 'SIX_COUNT', completedReps: 400, durationSec: 1800 })],
      EMPTY_BASELINE,
    );
    expect(best.SIX_COUNT).toBe(0);
  });

  it('floors bests at the imported baseline', () => {
    const best = bestLandmark(
      [makeSession({ movement: 'SIX_COUNT', completedReps: 10 })],
      makeBaseline({ bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 } }),
    );
    expect(best).toEqual({ SIX_COUNT: 325, NAVY_SEAL: 150 });
  });
});

describe('highestOrderMetByReps', () => {
  it('returns null when 1A is not met', () => {
    expect(highestOrderMetByReps({ SIX_COUNT: 0, NAVY_SEAL: 0 })).toBeNull();
  });

  it('requires both movements for a level', () => {
    // 160 six-counts covers 1D, but only 20 Navy Seals → stuck at 1B.
    expect(highestOrderMetByReps({ SIX_COUNT: 160, NAVY_SEAL: 20 })).toBe(1);
  });

  it('unlocks several levels at once', () => {
    expect(highestOrderMetByReps({ SIX_COUNT: 160, NAVY_SEAL: 60 })).toBe(3);
  });
});

describe('computeProgression', () => {
  it('reports no level and 1A as the next target on a cold start', () => {
    const state = computeProgression({ sessions: [], baseline: null, now: NOW });
    expect(state.currentLevelOrder).toBeNull();
    expect(state.currentLevel).toBeNull();
    expect(state.nextLevel!.name).toBe('1A');
    expect(state.nextTargets.SIX_COUNT).toMatchObject({ best: 0, target: 1, met: false, remaining: 1 });
  });

  it('unlocks 1B, 1C and 1D from one 160-rep session plus Navy Seal progress', () => {
    const state = computeProgression({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 160 }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 60 }),
      ],
      baseline: null,
      now: NOW,
    });
    expect(state.currentLevel!.name).toBe('1D');
    expect(state.nextLevel!.name).toBe('2A');
    expect(state.nextTargets.NAVY_SEAL).toMatchObject({ best: 60, target: 80, met: false, remaining: 20 });
    expect(state.nextTargets.SIX_COUNT.ratio).toBeCloseTo(0.8, 5);
  });

  it('never unlocks a landmark from a non-20-minute session', () => {
    const state = computeProgression({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 400, durationSec: 1800 }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 200, durationSec: 2400 }),
      ],
      baseline: null,
      now: NOW,
    });
    expect(state.currentLevelOrder).toBeNull();
  });

  it('caps at 4B when the graduation landmarks land in different weeks', () => {
    const state = computeProgression({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 325, startedAt: '2026-09-28T06:00:00.000Z' }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 150, startedAt: '2026-10-06T06:00:00.000Z' }),
      ],
      baseline: null,
      now: NOW,
    });
    expect(state.currentLevel!.name).toBe('4B');
    expect(state.graduated).toBe(false);
    expect(state.graduationWeekStart).toBeNull();
  });

  it('graduates when both landmarks land in the same Mon–Sun week', () => {
    const state = computeProgression({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 325, startedAt: '2026-10-05T06:00:00.000Z' }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 150, startedAt: '2026-10-06T06:00:00.000Z' }),
      ],
      baseline: null,
      now: NOW,
    });
    expect(state.currentLevel!.name).toBe('Graduation');
    expect(state.graduated).toBe(true);
    expect(state.graduationWeekStart).toBe('2026-10-05');
    expect(state.nextLevel).toBeNull();
    expect(state.daysUntilGraduationExpiry).toBe(29);
    expect(state.nextTargets.SIX_COUNT).toMatchObject({ target: 325, met: true, remaining: 0, ratio: 1 });
  });

  it('expires graduation after 30 days and drops to 4B, keeping history', () => {
    const state = computeProgression({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 325, startedAt: '2026-08-03T06:00:00.000Z' }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 150, startedAt: '2026-08-04T06:00:00.000Z' }),
      ],
      baseline: null,
      now: NOW,
    });
    expect(state.graduated).toBe(false);
    expect(state.currentLevel!.name).toBe('4B');
    expect(state.daysUntilGraduationExpiry).toBeLessThan(0);
    expect(state.reachedAt[10]).toBe('2026-08-04T06:00:00.000Z');
  });

  it('honours an imported baseline level as a floor', () => {
    const state = computeProgression({
      sessions: [],
      baseline: makeBaseline({
        startLevelOrder: 9,
        bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 },
      }),
      now: NOW,
    });
    expect(state.currentLevel!.name).toBe('4B');
    expect(state.graduated).toBe(false);
  });

  it('graduates from a baseline that names the qualifying week', () => {
    const state = computeProgression({
      sessions: [],
      baseline: makeBaseline({
        startLevelOrder: 10,
        bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 },
        graduationWeekStart: '2026-10-05',
      }),
      now: NOW,
    });
    expect(state.graduated).toBe(true);
    expect(state.currentLevel!.name).toBe('Graduation');
  });
});

describe('computeLevelEvents', () => {
  it('stamps each newly reached level with the session that unlocked it', () => {
    const events = computeLevelEvents({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 160, startedAt: '2026-09-01T06:00:00.000Z' }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 60, startedAt: '2026-09-03T06:00:00.000Z' }),
      ],
      baseline: null,
      now: NOW,
    });
    expect(events.map((e) => [e.levelOrder, e.type, e.at])).toEqual([
      [0, 'REACHED', '2026-09-03T06:00:00.000Z'],
      [1, 'REACHED', '2026-09-03T06:00:00.000Z'],
      [2, 'REACHED', '2026-09-03T06:00:00.000Z'],
      [3, 'REACHED', '2026-09-03T06:00:00.000Z'],
    ]);
  });

  it('is idempotent — ids are deterministic', () => {
    const input = {
      sessions: [
        makeSession({ movement: 'NAVY_SEAL', completedReps: 1, startedAt: '2026-09-01T06:00:00.000Z' }),
        makeSession({ movement: 'SIX_COUNT', completedReps: 1, startedAt: '2026-09-01T06:00:00.000Z' }),
      ],
      baseline: null,
      now: NOW,
    };
    expect(computeLevelEvents(input)).toEqual(computeLevelEvents(input));
    expect(computeLevelEvents(input)[0]!.id).toBe('level-0-REACHED');
  });

  it('appends an EXPIRED event when graduation has lapsed', () => {
    const events = computeLevelEvents({
      sessions: [
        makeSession({ movement: 'SIX_COUNT', completedReps: 325, startedAt: '2026-08-03T06:00:00.000Z' }),
        makeSession({ movement: 'NAVY_SEAL', completedReps: 150, startedAt: '2026-08-04T06:00:00.000Z' }),
      ],
      baseline: null,
      now: NOW,
    });
    const expired = events.filter((e) => e.type === 'EXPIRED');
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({ id: 'level-10-EXPIRED', levelOrder: 10 });
  });
});
