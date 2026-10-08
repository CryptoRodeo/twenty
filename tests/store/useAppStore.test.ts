import { readFileSync } from 'fs';
import { join } from 'path';
import { runMigrations } from '@/data/migrations';
import { listWeek, saveWeek } from '@/data/plannedRepo';
import { listLevelEvents } from '@/data/levelEventsRepo';
import { listSessions } from '@/data/sessionsRepo';
import {
  selectProgression,
  selectStats,
  selectTodaysPlan,
  selectWeek,
  useAppStore,
} from '@/store/useAppStore';
import { GRADUATION_ORDER, LEVELS } from '@/domain/levels';
import { FIRST_WEEK_FRACTION } from '@/domain/planner';
import { weekStartIso } from '@/domain/time';
import { makeBaseline } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/testDb';

const NOW = new Date(2026, 9, 7, 7, 0); // Wed 2026-10-07, week starts 2026-10-05

let db: TestDb;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  await useAppStore.getState().init(db);
});

afterEach(() => db.close());

describe('init', () => {
  it('marks the store ready with defaults and no data', () => {
    const s = useAppStore.getState();
    expect(s.ready).toBe(true);
    expect(s.sessions).toEqual([]);
    expect(s.baseline).toBeNull();
    expect(s.settings.weeklyGoalMin).toBe(80);
  });
});

describe('ensureWeek', () => {
  it('plans the current week from the first-week fraction', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    const week = await listWeek(db, '2026-10-05');
    expect(week.map((p) => [p.dayOfWeek, p.movement, p.targetReps])).toEqual([
      [0, 'SIX_COUNT', 1],
      [1, 'NAVY_SEAL', 1],
      [2, 'NAVY_SEAL', 1],
      [6, 'SIX_COUNT', 1],
    ]);
    // 1A's target is 1, so these are immediately test days.
    expect(week.every((p) => p.isTestDay)).toBe(true);
  });

  it('plans from the imported baseline when there is one', async () => {
    await useAppStore.getState().importBaseline(
      makeBaseline({ startLevelOrder: 9, bestLandmark: { SIX_COUNT: 300, NAVY_SEAL: 135 } }),
    );
    await useAppStore.getState().ensureWeek(NOW);
    const week = await listWeek(db, '2026-10-05');
    const sixCount = week.find((p) => p.movement === 'SIX_COUNT')!;
    expect(sixCount.targetReps).toBe(300); // max(ceil(325*0.9)=293, best 300)
    expect(sixCount.isTestDay).toBe(false);
  });

  it('does not overwrite a week that already exists', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    await useAppStore.getState().updateSettings({
      planDays: [{ dayOfWeek: 4, movement: 'NAVY_SEAL' }],
    });
    await useAppStore.getState().ensureWeek(NOW);
    expect((await listWeek(db, '2026-10-05')).map((p) => p.dayOfWeek)).toEqual([0, 1, 2, 6]);
  });
});

describe('addSession', () => {
  it('still resolves with the session stored once when week planning fails', async () => {
    const original = useAppStore.getState().ensureWeek;
    useAppStore.setState({ ensureWeek: jest.fn().mockRejectedValue(new Error('disk full')) });
    try {
      const saved = await useAppStore.getState().addSession({
        movement: 'SIX_COUNT',
        startedAt: new Date().toISOString(),
        durationSec: 1200,
        targetReps: 100,
        completedReps: 100,
        effort: null,
        kind: 'CUSTOM',
      });
      expect(saved.id).toMatch(/\S/);
      expect(useAppStore.getState().sessions).toHaveLength(1);
    } finally {
      useAppStore.setState({ ensureWeek: original });
    }
  });

  it('plans the current week after the first session on a fresh database', async () => {
    const now = new Date();
    expect(await listWeek(db, weekStartIso(now))).toHaveLength(0);
    await useAppStore.getState().addSession({
      movement: 'SIX_COUNT',
      startedAt: now.toISOString(),
      durationSec: 1200,
      targetReps: 100,
      completedReps: 100,
      effort: null,
      kind: 'CUSTOM',
    });
    expect((await listWeek(db, weekStartIso(now))).length).toBeGreaterThan(0);
    expect(useAppStore.getState().planned.length).toBeGreaterThan(0);
  });

  it('links a same-day workout to that day’s slot, not an earlier missed one', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    const saved = await useAppStore.getState().addSession({
      movement: 'NAVY_SEAL',
      startedAt: NOW.toISOString(),
      durationSec: 1200,
      targetReps: 1,
      completedReps: 40,
      effort: 6,
      kind: 'GUIDED',
    });
    expect(saved.id).toMatch(/\S/);
    expect(useAppStore.getState().sessions).toHaveLength(1);
    const linked = (await listWeek(db, '2026-10-05')).filter((p) => p.sessionId === saved.id);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.movement).toBe('NAVY_SEAL');
    expect(linked[0]!.dayOfWeek).toBe(2); // Wednesday, not Tuesday's missed slot
  });

  it('links nothing for a workout on an unplanned day', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    const thursday = new Date(2026, 9, 8, 7, 0);
    await useAppStore.getState().addSession({
      movement: 'NAVY_SEAL', startedAt: thursday.toISOString(), durationSec: 1200,
      targetReps: 1, completedReps: 40, effort: 6, kind: 'GUIDED',
    });
    expect((await listWeek(db, '2026-10-05')).every((p) => p.sessionId === undefined)).toBe(true);
  });

  it('honours an explicit planned slot in the same week', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    const saved = await useAppStore.getState().addSession({
      movement: 'NAVY_SEAL', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 1, completedReps: 40, effort: 6, kind: 'GUIDED',
    }, '2026-10-05-1');
    const linked = (await listWeek(db, '2026-10-05')).filter((p) => p.sessionId === saved.id);
    expect(linked.map((p) => p.dayOfWeek)).toEqual([1]);
  });

  it('ignores an explicit slot of a different movement', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    await useAppStore.getState().addSession({
      movement: 'NAVY_SEAL', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 1, completedReps: 40, effort: 6, kind: 'GUIDED',
    }, '2026-10-05-0');
    const week = await listWeek(db, '2026-10-05');
    expect(week.find((p) => p.id === '2026-10-05-0')!.sessionId).toBeUndefined();
  });

  it('reconciles level events without duplicating them', async () => {
    const add = (movement: 'SIX_COUNT' | 'NAVY_SEAL', completedReps: number) =>
      useAppStore.getState().addSession({
        movement, startedAt: NOW.toISOString(), durationSec: 1200,
        targetReps: completedReps, completedReps, effort: 7, kind: 'LANDMARK',
      });
    await add('SIX_COUNT', 160);
    await add('NAVY_SEAL', 60);
    const events = await listLevelEvents(db);
    expect(events.map((e) => e.levelOrder)).toEqual([0, 1, 2, 3]);
    await add('SIX_COUNT', 161);
    expect((await listLevelEvents(db)).map((e) => e.levelOrder)).toEqual([0, 1, 2, 3]);
  });
});

describe('editSession and removeSession', () => {
  it('recomputes derived state after an edit', async () => {
    const saved = await useAppStore.getState().addSession({
      movement: 'SIX_COUNT', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 100, completedReps: 100, effort: 7, kind: 'GUIDED',
    });
    await useAppStore.getState().editSession({ ...saved, completedReps: 10 });
    expect(selectStats(useAppStore.getState(), NOW).totals.total).toBe(10);
  });

  it('removes a session and drops it from totals', async () => {
    const saved = await useAppStore.getState().addSession({
      movement: 'SIX_COUNT', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 100, completedReps: 100, effort: 7, kind: 'GUIDED',
    });
    await useAppStore.getState().removeSession(saved.id);
    expect(useAppStore.getState().sessions).toEqual([]);
    expect(selectStats(useAppStore.getState(), NOW).totals.total).toBe(0);
  });
});

describe('level event sync', () => {
  const landmark = (movement: 'SIX_COUNT' | 'NAVY_SEAL', completedReps: number) => ({
    movement, startedAt: NOW.toISOString(), durationSec: 1200,
    targetReps: completedReps, completedReps, effort: 7, kind: 'LANDMARK' as const,
  });

  it('drops a stale REACHED row when a session is edited down', async () => {
    const six = await useAppStore.getState().addSession(landmark('SIX_COUNT', 160));
    await useAppStore.getState().addSession(landmark('NAVY_SEAL', 60));
    expect((await listLevelEvents(db)).map((e) => e.levelOrder)).toEqual([0, 1, 2, 3]);
    await useAppStore.getState().editSession({ ...six, completedReps: 10 });
    const orders = (await listLevelEvents(db)).map((e) => e.levelOrder);
    expect(orders.length).toBeLessThan(4);
    expect(orders).not.toContain(3);
  });

  it('drops stale REACHED rows when a session is deleted', async () => {
    const six = await useAppStore.getState().addSession(landmark('SIX_COUNT', 160));
    await useAppStore.getState().addSession(landmark('NAVY_SEAL', 60));
    await useAppStore.getState().removeSession(six.id);
    expect((await listLevelEvents(db)).map((e) => e.levelOrder)).not.toContain(3);
    expect(useAppStore.getState().levelEvents.map((e) => e.levelOrder)).not.toContain(3);
  });
});

describe('importBaseline', () => {
  it('plans the current week immediately', async () => {
    await useAppStore.getState().importBaseline(
      makeBaseline({ startLevelOrder: 9, bestLandmark: { SIX_COUNT: 300, NAVY_SEAL: 135 } }),
    );
    expect((await listWeek(db, weekStartIso(new Date()))).length).toBe(4);
  });
});

describe('importBaseline re-plan', () => {
  afterEach(() => jest.useRealTimers());

  it('re-plans unlinked slots from the baseline and keeps linked rows untouched', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(NOW); // fresh install: 1A-level targets
    expect((await listWeek(db, '2026-10-05')).every((p) => p.targetReps === 1)).toBe(true);
    const monday = useAppStore.getState().planned.find((p) => p.weekStart === '2026-10-05' && p.dayOfWeek === 0)!;
    const session = await useAppStore.getState().addSession({
      movement: monday.movement, startedAt: new Date(2026, 9, 5, 7, 0).toISOString(), durationSec: 1200,
      targetReps: 1, completedReps: 40, effort: 6, kind: 'GUIDED',
    }, monday.id);

    await useAppStore.getState().importBaseline(
      makeBaseline({ startLevelOrder: 9, bestLandmark: { SIX_COUNT: 300, NAVY_SEAL: 135 } }),
    );
    const week = await listWeek(db, '2026-10-05');
    const linked = week.find((p) => p.id === monday.id)!;
    expect(linked.sessionId).toBe(session.id);
    expect(linked.targetReps).toBe(1);
    const open = week.filter((p) => p.sessionId === undefined);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((p) => p.targetReps > 1)).toBe(true);
  });
});

describe('importBaseline layout', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps this week\'s slots when planDays changed after planning', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(NOW);
    const before = await listWeek(db, '2026-10-05');
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, planDays: [{ dayOfWeek: 4, movement: 'SIX_COUNT' }] },
    });
    await useAppStore.getState().importBaseline(
      makeBaseline({ startLevelOrder: 9, bestLandmark: { SIX_COUNT: 300, NAVY_SEAL: 135 } }),
    );
    const after = await listWeek(db, '2026-10-05');
    const shape = (w: typeof before) => w.map((p) => [p.id, p.dayOfWeek, p.movement]);
    expect(shape(after)).toEqual(shape(before));
    expect(after.every((p) => p.targetReps > 1)).toBe(true);
  });
});

describe('importBaseline failure', () => {
  afterEach(() => jest.restoreAllMocks());

  it('never leaves the week with fewer rows when the re-plan write fails', async () => {
    const now = new Date();
    await useAppStore.getState().ensureWeek(now);
    const count = (await listWeek(db, weekStartIso(now))).length;
    expect(count).toBeGreaterThan(0);
    const real = db.runAsync.bind(db);
    jest.spyOn(db, 'runAsync').mockImplementation(((sql: string, ...a: unknown[]) =>
      /INSERT INTO planned_sessions/.test(sql)
        ? Promise.reject(new Error('disk full'))
        : (real as (...x: unknown[]) => unknown)(sql, ...a)) as never);
    await expect(useAppStore.getState().importBaseline(
      makeBaseline({ startLevelOrder: 9, bestLandmark: { SIX_COUNT: 300, NAVY_SEAL: 135 } }),
    )).rejects.toThrow('disk full');
    expect((await listWeek(db, weekStartIso(now))).length).toBe(count);
  });
});

describe('importSessions', () => {
  afterEach(() => jest.useRealTimers());

  const row = (movement: 'SIX_COUNT' | 'NAVY_SEAL', startedAt: string, reps: number) => ({
    movement, startedAt, durationSec: 1200, targetReps: reps, completedReps: reps,
    effort: 8, kind: 'LANDMARK' as const,
  });

  it('inserts a batch and derives levels from it', async () => {
    await useAppStore.getState().importSessions([
      row('SIX_COUNT', '2026-09-01T12:00:00.000Z', 160),
      row('NAVY_SEAL', '2026-09-03T12:00:00.000Z', 60),
    ]);
    expect(useAppStore.getState().sessions).toHaveLength(2);
    expect(selectProgression(useAppStore.getState(), NOW).currentLevel!.name).toBe('1D');
    expect((await listLevelEvents(db)).length).toBeGreaterThan(0);
  });

  it('inserts nothing on a failed import, so a retry yields exactly N sessions', async () => {
    const rows = [
      row('SIX_COUNT', '2026-09-01T12:00:00.000Z', 160),
      row('SIX_COUNT', '2026-09-02T12:00:00.000Z', 161),
      row('NAVY_SEAL', '2026-09-03T12:00:00.000Z', 60),
    ];
    const real = db.runAsync.bind(db);
    let inserts = 0;
    const spy = jest.spyOn(db, 'runAsync').mockImplementation(((sql: string, ...a: unknown[]) => {
      if (/INSERT INTO sessions/.test(sql) && ++inserts === 3) return Promise.reject(new Error('disk full'));
      return (real as (...x: unknown[]) => unknown)(sql, ...a);
    }) as never);
    await expect(useAppStore.getState().importSessions(rows)).rejects.toThrow('disk full');
    expect(await listSessions(db)).toEqual([]);
    spy.mockRestore();
    await useAppStore.getState().importSessions(rows);
    expect(useAppStore.getState().sessions).toHaveLength(3);
    expect(await listSessions(db)).toHaveLength(3);
  });

  it('resolves and stores the rows once when settling fails after the commit', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(NOW);
    const real = db.runAsync.bind(db);
    const spy = jest.spyOn(db, 'runAsync').mockImplementation(((sql: string, ...a: unknown[]) =>
      /INSERT INTO planned_sessions|INSERT INTO level_events/.test(sql)
        ? Promise.reject(new Error('disk full'))
        : (real as (...x: unknown[]) => unknown)(sql, ...a)) as never);
    await expect(useAppStore.getState().importSessions([
      row('SIX_COUNT', '2026-09-01T12:00:00.000Z', 160),
    ])).resolves.toBeUndefined();
    spy.mockRestore();
    expect(await listSessions(db)).toHaveLength(1);
    expect(useAppStore.getState().sessions).toHaveLength(1);
  });

  it('re-plans the current week\'s open slots from the imported history', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(NOW);
    expect((await listWeek(db, '2026-10-05')).every((p) => p.targetReps === 1)).toBe(true);
    await useAppStore.getState().importSessions([
      row('SIX_COUNT', new Date(2026, 8, 20, 12).toISOString(), 160),
      row('NAVY_SEAL', new Date(2026, 8, 21, 12).toISOString(), 60),
    ]);
    const week = await listWeek(db, '2026-10-05');
    expect(week.length).toBeGreaterThan(0);
    expect(week.every((p) => p.targetReps > 1)).toBe(true);
  });
});

describe('selectors', () => {
  it('selectWeek returns seven days with today flagged', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    const view = selectWeek(useAppStore.getState(), NOW);
    expect(view.weekStart).toBe('2026-10-05');
    expect(view.days).toHaveLength(7);
    expect(view.days.map((d) => d.letter)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(view.days[2]!.isToday).toBe(true);
    expect(view.days[2]!.short).toBe('N');
    expect(view.days[3]!.movement).toBeNull(); // Thursday is a rest day
    expect(view.goalMin).toBe(80);
    expect(view.minutesDone).toBe(0);
  });

  it('selectWeek counts minutes and marks completed days', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    await useAppStore.getState().addSession({
      movement: 'NAVY_SEAL', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 1, completedReps: 40, effort: 6, kind: 'GUIDED',
    });
    const view = selectWeek(useAppStore.getState(), NOW);
    expect(view.minutesDone).toBe(20);
    expect(view.days.filter((d) => d.done)).toHaveLength(1);
  });

  it('selectWeek derives missed days (past, planned, not done) and test days', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    const state = useAppStore.getState();
    const mondaySlot = state.planned.find((p) => p.weekStart === '2026-10-05' && p.dayOfWeek === 0)!;
    const view = selectWeek(state, NOW);
    expect(view.days[0]!.missed).toBe(true); // Monday planned, before Wednesday, not done
    expect(view.days[2]!.missed).toBe(false); // today is not missed
    expect(view.days[3]!.missed).toBe(false); // rest day
    expect(view.days[0]!.isTestDay).toBe(mondaySlot.isTestDay);
    const marked = selectWeek(
      { ...state, planned: state.planned.map((p) => (p.id === mondaySlot.id ? { ...p, isTestDay: true } : p)) },
      NOW,
    );
    expect(marked.days[0]!.isTestDay).toBe(true);
    const done = selectWeek(
      { ...state, planned: state.planned.map((p) => (p.id === mondaySlot.id ? { ...p, sessionId: 'x' } : p)) },
      NOW,
    );
    expect(done.days[0]!.missed).toBe(false);
  });

  it('selectTodaysPlan finds the slot for today only', async () => {
    await useAppStore.getState().ensureWeek(NOW);
    expect(selectTodaysPlan(useAppStore.getState(), NOW)!.dayOfWeek).toBe(2);
    const thursday = new Date(2026, 9, 8, 7, 0);
    expect(selectTodaysPlan(useAppStore.getState(), thursday)).toBeNull();
  });

  it('selectProgression reflects stored sessions', async () => {
    await useAppStore.getState().addSession({
      movement: 'SIX_COUNT', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 160, completedReps: 160, effort: 7, kind: 'LANDMARK',
    });
    await useAppStore.getState().addSession({
      movement: 'NAVY_SEAL', startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: 60, completedReps: 60, effort: 7, kind: 'LANDMARK',
    });
    expect(selectProgression(useAppStore.getState(), NOW).currentLevel!.name).toBe('1D');
  });
});

function expectFirstWeekTargets(week: { movement: string; targetReps: number }[], order: number): void {
  expect(week.length).toBeGreaterThan(0);
  for (const p of week) {
    const landmark = LEVELS[order]!.targets[p.movement as 'SIX_COUNT' | 'NAVY_SEAL'];
    expect(p.targetReps).toBe(Math.ceil(landmark * FIRST_WEEK_FRACTION));
  }
}

describe('setTargetLevel', () => {
  afterEach(() => jest.useRealTimers());

  it('persists the choice, re-plans open slots from that level and completes nothing', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(NOW);
    await useAppStore.getState().setTargetLevel(2);

    expect(useAppStore.getState().settings.targetLevelOrder).toBe(2);
    expect((await listLevelEvents(db)).length).toBe(0);
    const p = selectProgression(useAppStore.getState(), NOW);
    expect(p.currentLevelOrder).toBeNull();
    expect(p.nextLevel?.name).toBe('1C');

    const week = await listWeek(db, '2026-10-05');
    expectFirstWeekTargets(week, 2);
  });

  it('restarts open targets from the first-week rule even when last week was planned', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await saveWeek(db, [
      { id: 'p-six', weekStart: '2026-09-28', dayOfWeek: 0, movement: 'SIX_COUNT', targetReps: 1, isTestDay: false },
      { id: 'p-navy', weekStart: '2026-09-28', dayOfWeek: 1, movement: 'NAVY_SEAL', targetReps: 1, isTestDay: false },
    ]);
    await useAppStore.getState().ensureWeek(NOW);
    await useAppStore.getState().setTargetLevel(2);
    expectFirstWeekTargets(await listWeek(db, '2026-10-05'), 2);
  });

  it('rejects an order outside 0..GRADUATION_ORDER or non-integer', async () => {
    for (const bad of [-1, GRADUATION_ORDER + 1, 1.5, Number.NaN]) {
      await expect(useAppStore.getState().setTargetLevel(bad)).rejects.toThrow(/Invalid target level/);
    }
    expect(useAppStore.getState().settings.targetLevelOrder).toBe(0);
  });

  it('survives a reload', async () => {
    await useAppStore.getState().setTargetLevel(3);
    await useAppStore.getState().reload();
    expect(useAppStore.getState().settings.targetLevelOrder).toBe(3);
  });
});

describe('pendingLevelUp', () => {
  const add = (movement: 'SIX_COUNT' | 'NAVY_SEAL', reps: number) =>
    useAppStore.getState().addSession({
      movement, startedAt: NOW.toISOString(), durationSec: 1200,
      targetReps: reps, completedReps: reps, effort: 7, kind: 'LANDMARK',
    });

  it('flags a new level and clears on demand', async () => {
    await add('SIX_COUNT', 160);
    expect(useAppStore.getState().pendingLevelUp).toBeNull(); // Navy Seal still at 0
    await add('NAVY_SEAL', 60);
    expect(useAppStore.getState().pendingLevelUp).toBe(3); // 1D
    useAppStore.getState().clearLevelUp();
    expect(useAppStore.getState().pendingLevelUp).toBeNull();
  });

  it('does not flag a session that reaches no new level', async () => {
    await add('SIX_COUNT', 160);
    await add('NAVY_SEAL', 60);
    useAppStore.getState().clearLevelUp();
    await add('SIX_COUNT', 150);
    expect(useAppStore.getState().pendingLevelUp).toBeNull();
  });

  it('clears a stale flag on a non-levelling save', async () => {
    await add('SIX_COUNT', 160);
    await add('NAVY_SEAL', 60);
    expect(useAppStore.getState().pendingLevelUp).toBe(3); // never dismissed
    await add('SIX_COUNT', 150);
    expect(useAppStore.getState().pendingLevelUp).toBeNull();
  });

  it('is reset by init', async () => {
    await add('SIX_COUNT', 160);
    await add('NAVY_SEAL', 60);
    expect(useAppStore.getState().pendingLevelUp).toBe(3);
    await useAppStore.getState().init(db);
    expect(useAppStore.getState().pendingLevelUp).toBeNull();
  });
});

describe('restoreBackup', () => {
  it('plans the current week and re-derives level events from an older backup', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    try {
      const old = (movement: 'SIX_COUNT' | 'NAVY_SEAL', reps: number) => ({
        id: `old-${movement}`, movement, startedAt: new Date(2026, 8, 1, 7, 0).toISOString(),
        durationSec: 1200, targetReps: reps, completedReps: reps, effort: 7, kind: 'LANDMARK',
      });
      const json = JSON.stringify({
        version: 1, exportedAt: '2026-09-02T00:00:00.000Z',
        sessions: [old('SIX_COUNT', 160), old('NAVY_SEAL', 60)],
        planned: [], levelEvents: [], settings: useAppStore.getState().settings, baseline: null,
      });
      await useAppStore.getState().restoreBackup(json);
      expect(await listWeek(db, '2026-10-05')).not.toHaveLength(0);
      expect((await listLevelEvents(db)).some((e) => e.levelOrder === 3 && e.type === 'REACHED')).toBe(true);
      expect(useAppStore.getState().sessions).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('planning after a natural level-up', () => {
  afterEach(() => jest.useRealTimers());

  it('opens the next week at first-week targets for the new level', async () => {
    const week1 = new Date(2026, 8, 28, 7, 0); // Mon 2026-09-28
    jest.useFakeTimers({ now: week1, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(week1);
    const oneB = LEVELS[1]!.targets;
    const reps = { SIX_COUNT: oneB.SIX_COUNT - 10, NAVY_SEAL: oneB.NAVY_SEAL - 5 }; // 1A met, 1B not
    for (const [i, movement] of (['SIX_COUNT', 'NAVY_SEAL'] as const).entries()) {
      const at = new Date(2026, 8, 28 + i, 7, 0);
      jest.setSystemTime(at);
      await useAppStore.getState().addSession({
        movement, startedAt: at.toISOString(), durationSec: 1200,
        targetReps: 1, completedReps: reps[movement], effort: 7, kind: 'GUIDED',
      });
    }
    expect(selectProgression(useAppStore.getState(), NOW).currentLevel!.name).toBe(LEVELS[0]!.name);

    jest.setSystemTime(NOW);
    await useAppStore.getState().ensureWeek(NOW);
    const week = await listWeek(db, '2026-10-05');
    expect(week.length).toBeGreaterThan(0);
    for (const p of week) {
      expect(p.targetReps).toBe(Math.max(Math.ceil(oneB[p.movement] * FIRST_WEEK_FRACTION), reps[p.movement]));
    }
  });
});

describe('explicit seeding restarts this week (C1)', () => {
  afterEach(() => jest.useRealTimers());

  /** The app was opened in an earlier week, so that week was planned at 1A and this week follows it. */
  async function openedLastWeekThenThisWeek(): Promise<void> {
    const sunday = new Date(2026, 9, 4, 7, 0);
    jest.useFakeTimers({ now: sunday, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().ensureWeek(sunday);
    jest.setSystemTime(NOW);
    await useAppStore.getState().ensureWeek(NOW);
    const week = await listWeek(db, '2026-10-05');
    expect(week.every((p) => p.targetReps === LEVELS[0]!.targets[p.movement])).toBe(true);
  }

  it('Home flow (zero baseline, then target last) opens this week at 1C first-week targets', async () => {
    await openedLastWeekThenThisWeek();
    await useAppStore.getState().importBaseline(makeBaseline({
      startLevelOrder: null, bestLandmark: { SIX_COUNT: 0, NAVY_SEAL: 0 },
    }));
    await useAppStore.getState().setTargetLevel(2);
    expectFirstWeekTargets(await listWeek(db, '2026-10-05'), 2);
  });

  it('a baseline saved after choosing 1C keeps the 1C first-week targets', async () => {
    await openedLastWeekThenThisWeek();
    await useAppStore.getState().setTargetLevel(2);
    await useAppStore.getState().importBaseline(makeBaseline({
      startLevelOrder: null, bestLandmark: { SIX_COUNT: 0, NAVY_SEAL: 0 },
    }));
    expectFirstWeekTargets(await listWeek(db, '2026-10-05'), 2);
  });

  it('a baseline import lifts targets even when last week was planned', async () => {
    await openedLastWeekThenThisWeek();
    const best = LEVELS[9]!.targets;
    await useAppStore.getState().importBaseline(makeBaseline({ startLevelOrder: 9, bestLandmark: { ...best } }));
    const grad = LEVELS[GRADUATION_ORDER]!.targets;
    for (const p of await listWeek(db, '2026-10-05')) {
      expect(p.targetReps).toBe(Math.max(Math.ceil(grad[p.movement] * FIRST_WEEK_FRACTION), best[p.movement]));
    }
  });

  it('a CSV import lifts targets even when last week was planned', async () => {
    await openedLastWeekThenThisWeek();
    const oneD = LEVELS[3]!.targets;
    await useAppStore.getState().importSessions((['SIX_COUNT', 'NAVY_SEAL'] as const).map((movement, i) => ({
      movement, startedAt: new Date(2026, 8, 20 + i, 12).toISOString(), durationSec: 1200,
      targetReps: oneD[movement], completedReps: oneD[movement], effort: 8, kind: 'LANDMARK' as const,
    })));
    const twoA = LEVELS[4]!.targets;
    for (const p of await listWeek(db, '2026-10-05')) {
      expect(p.targetReps).toBe(Math.max(Math.ceil(twoA[p.movement] * FIRST_WEEK_FRACTION), oneD[p.movement]));
    }
  });
});

describe('re-plan keeps restored row ids (I1)', () => {
  afterEach(() => jest.useRealTimers());

  const readmeJson = (): string => {
    const readme = readFileSync(join(__dirname, '..', '..', 'README.md'), 'utf8');
    return /```json\n([\s\S]*?)```/.exec(readme)![1]!;
  };

  it('restoring the README example leaves exactly its one Monday slot', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    await useAppStore.getState().restoreBackup(readmeJson());
    const week = await listWeek(db, '2026-10-05');
    expect(week.map((p) => [p.id, p.dayOfWeek, p.sessionId])).toEqual([['p1', 0, 's1']]);
  });

  it('updates open rows with foreign ids in place and never adds rows', async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval'] });
    const file = JSON.parse(readmeJson()) as { planned: Record<string, unknown>[] };
    file.planned.push({
      id: 'p2', weekStart: '2026-10-05', dayOfWeek: 1, movement: 'NAVY_SEAL', targetReps: 7, isTestDay: false,
    });
    await useAppStore.getState().restoreBackup(JSON.stringify(file));
    await useAppStore.getState().setTargetLevel(2);
    const week = await listWeek(db, '2026-10-05');
    expect(week.map((p) => [p.id, p.dayOfWeek])).toEqual([['p1', 0], ['p2', 1]]);
    expect(week[0]!.targetReps).toBe(100); // linked row untouched
    expect(week[1]!.targetReps).toBe(Math.ceil(LEVELS[2]!.targets.NAVY_SEAL * FIRST_WEEK_FRACTION));
  });
});
