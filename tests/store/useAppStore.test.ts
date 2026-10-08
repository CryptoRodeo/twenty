import { runMigrations } from '@/data/migrations';
import { listWeek } from '@/data/plannedRepo';
import { listLevelEvents } from '@/data/levelEventsRepo';
import {
  selectProgression,
  selectStats,
  selectTodaysPlan,
  selectWeek,
  useAppStore,
} from '@/store/useAppStore';
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
