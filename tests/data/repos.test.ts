import { runMigrations } from '@/data/migrations';
import { deleteLevelEventsExcept, listLevelEvents, upsertLevelEvents } from '@/data/levelEventsRepo';
import { linkSession, listAllPlanned, listWeek, saveWeek } from '@/data/plannedRepo';
import { deleteSession, getSession, insertSession, insertSessions, listSessions, updateSession } from '@/data/sessionsRepo';
import { DEFAULT_SETTINGS, getBaseline, getSettings, saveBaseline, saveSettings } from '@/data/settingsRepo';
import { buildWeek, DEFAULT_PLAN_DAYS } from '@/domain/planner';
import { makeBaseline, makeSession } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/testDb';

let db: TestDb;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
});

afterEach(() => db.close());

describe('sessionsRepo', () => {
  it('round-trips a session including null effort and notes', async () => {
    const s = makeSession({ id: 'x1', effort: null, notes: 'felt heavy' });
    await insertSession(db, s);
    expect(await getSession(db, 'x1')).toEqual(s);
  });

  it('omits `notes` entirely when the column is null', async () => {
    await insertSession(db, makeSession({ id: 'x2', notes: undefined }));
    const loaded = await getSession(db, 'x2');
    expect(loaded).not.toHaveProperty('notes');
  });

  it('lists sessions oldest-first', async () => {
    await insertSession(db, makeSession({ id: 'b', startedAt: '2026-10-07T06:00:00.000Z' }));
    await insertSession(db, makeSession({ id: 'a', startedAt: '2026-10-05T06:00:00.000Z' }));
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('updates reps and effort', async () => {
    const s = makeSession({ id: 'u1', completedReps: 100, effort: 7 });
    await insertSession(db, s);
    await updateSession(db, { ...s, completedReps: 288, effort: 9 });
    expect(await getSession(db, 'u1')).toMatchObject({ completedReps: 288, effort: 9 });
  });

  it('deletes a session and returns null for it afterwards', async () => {
    await insertSession(db, makeSession({ id: 'd1' }));
    await deleteSession(db, 'd1');
    expect(await getSession(db, 'd1')).toBeNull();
  });
});

describe('insertSessions', () => {
  it('inserts the whole batch', async () => {
    await insertSessions(db, [makeSession({ id: 'a' }), makeSession({ id: 'b' })]);
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('inserts nothing and rethrows when a row fails mid-batch', async () => {
    await expect(insertSessions(db, [
      makeSession({ id: 'a' }), makeSession({ id: 'b' }), makeSession({ id: 'a' }),
    ])).rejects.toThrow();
    expect(await listSessions(db)).toEqual([]);
  });
});

describe('plannedRepo', () => {
  const week = buildWeek({
    weekStart: '2026-10-05',
    planDays: DEFAULT_PLAN_DAYS,
    targets: { SIX_COUNT: 292, NAVY_SEAL: 130 },
    landmarks: { SIX_COUNT: 325, NAVY_SEAL: 150 },
  });

  it('saves and reloads a week, preserving the test-day flag', async () => {
    const withTest = week.map((p, i) => (i === 0 ? { ...p, isTestDay: true } : p));
    await saveWeek(db, withTest);
    const loaded = await listWeek(db, '2026-10-05');
    expect(loaded).toHaveLength(4);
    expect(loaded[0]!.isTestDay).toBe(true);
    expect(loaded[1]!.isTestDay).toBe(false);
  });

  it('upserts on a second save rather than duplicating rows', async () => {
    await saveWeek(db, week);
    await saveWeek(db, week.map((p) => ({ ...p, targetReps: p.targetReps + 5 })));
    const loaded = await listWeek(db, '2026-10-05');
    expect(loaded).toHaveLength(4);
    expect(loaded[0]!.targetReps).toBe(297);
  });

  it('returns an empty array for a week that has no plan', async () => {
    expect(await listWeek(db, '2026-11-02')).toEqual([]);
  });

  it('links a completed session and surfaces it as sessionId', async () => {
    await saveWeek(db, week);
    await insertSession(db, makeSession({ id: 'done1' }));
    await linkSession(db, week[0]!.id, 'done1');
    const loaded = await listWeek(db, '2026-10-05');
    expect(loaded[0]!.sessionId).toBe('done1');
    expect(loaded[1]!.sessionId).toBeUndefined();
  });

  it('lists every planned session across weeks, oldest week first', async () => {
    await saveWeek(db, week);
    await saveWeek(db, buildWeek({ ...{
      weekStart: '2026-09-28',
      planDays: DEFAULT_PLAN_DAYS,
      targets: { SIX_COUNT: 280, NAVY_SEAL: 125 },
      landmarks: { SIX_COUNT: 325, NAVY_SEAL: 150 },
    } }));
    const all = await listAllPlanned(db);
    expect(all).toHaveLength(8);
    expect(all[0]!.weekStart).toBe('2026-09-28');
  });
});

describe('levelEventsRepo', () => {
  it('upserts by deterministic id so repeated reconciliation adds nothing', async () => {
    const events = [
      { id: 'level-0-REACHED', levelOrder: 0, type: 'REACHED' as const, at: '2026-09-01T06:00:00.000Z' },
      { id: 'level-1-REACHED', levelOrder: 1, type: 'REACHED' as const, at: '2026-09-03T06:00:00.000Z' },
    ];
    await upsertLevelEvents(db, events);
    await upsertLevelEvents(db, events);
    expect(await listLevelEvents(db)).toEqual(events);
  });

  it('deletes events that are no longer in the keep set', async () => {
    const events = [
      { id: 'level-0-REACHED', levelOrder: 0, type: 'REACHED' as const, at: '2026-09-01T06:00:00.000Z' },
      { id: 'level-1-REACHED', levelOrder: 1, type: 'REACHED' as const, at: '2026-09-03T06:00:00.000Z' },
    ];
    await upsertLevelEvents(db, events);
    await deleteLevelEventsExcept(db, ['level-0-REACHED']);
    expect(await listLevelEvents(db)).toEqual([events[0]]);
    await deleteLevelEventsExcept(db, []);
    expect(await listLevelEvents(db)).toEqual([]);
  });

  it('tolerates an empty batch', async () => {
    await expect(upsertLevelEvents(db, [])).resolves.toBeUndefined();
  });
});

describe('settingsRepo', () => {
  it('returns documented defaults before anything is saved', async () => {
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ weeklyGoalMin: 80, countInSec: 10, soundOn: true, hapticsOn: true });
    expect(DEFAULT_SETTINGS.planDays).toEqual(DEFAULT_PLAN_DAYS);
  });

  it('round-trips edited settings including plan days', async () => {
    const edited = {
      ...DEFAULT_SETTINGS,
      soundOn: false,
      countInSec: 5,
      planDays: [{ dayOfWeek: 3, movement: 'NAVY_SEAL' as const }],
    };
    await saveSettings(db, edited);
    expect(await getSettings(db)).toEqual(edited);
  });

  it('has no baseline until one is imported', async () => {
    expect(await getBaseline(db)).toBeNull();
  });

  it('round-trips an imported baseline', async () => {
    const baseline = makeBaseline({
      startLevelOrder: 9,
      bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 },
      totalReps: { SIX_COUNT: 35_617, NAVY_SEAL: 15_344 },
      workouts: 245,
      streakWeeks: 16,
    });
    await saveBaseline(db, baseline);
    expect(await getBaseline(db)).toEqual(baseline);
  });
});
