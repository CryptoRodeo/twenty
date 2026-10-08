import { BACKUP_VERSION, exportBackup, importBackup } from '@/data/backup';
import { runMigrations } from '@/data/migrations';
import { listAllPlanned, saveWeek } from '@/data/plannedRepo';
import { insertSession, listSessions } from '@/data/sessionsRepo';
import {
  DEFAULT_SETTINGS, getBaseline, getSettings, saveBaseline, saveSettings,
} from '@/data/settingsRepo';
import { makeBaseline, makeSession } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/testDb';

const NOW = new Date(2026, 9, 7, 12, 0);
let db: TestDb;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
});

afterEach(() => db.close());

describe('backup', () => {
  it('exports a versioned, stamped snapshot', async () => {
    await insertSession(db, makeSession({ id: 'b1' }));
    const parsed = JSON.parse(await exportBackup(db, NOW));
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.exportedAt).toBe(NOW.toISOString());
    expect(parsed.sessions).toHaveLength(1);
  });

  it('round-trips sessions, plan, baseline and settings into an empty database', async () => {
    await insertSession(db, makeSession({ id: 'b1', completedReps: 288 }));
    await saveWeek(db, [{
      id: 'p1', weekStart: '2026-10-05', dayOfWeek: 0, movement: 'SIX_COUNT',
      targetReps: 100, isTestDay: false, sessionId: 'b1',
    }]);
    await saveBaseline(db, makeBaseline({ workouts: 245 }));
    await saveSettings(db, { ...DEFAULT_SETTINGS, soundOn: false, targetLevelOrder: 4 });
    const json = await exportBackup(db, NOW);

    const fresh = createTestDb();
    await runMigrations(fresh);
    await importBackup(fresh, json);
    expect((await listSessions(fresh)).map((s) => s.completedReps)).toEqual([288]);
    expect((await listAllPlanned(fresh)).map((p) => p.sessionId)).toEqual(['b1']);
    expect((await getBaseline(fresh))!.workouts).toBe(245);
    const settings = await getSettings(fresh);
    expect(settings.soundOn).toBe(false);
    expect(settings.targetLevelOrder).toBe(4);
    fresh.close();
  });

  it('replaces existing data rather than merging it', async () => {
    const json = await exportBackup(db, NOW); // empty snapshot
    await insertSession(db, makeSession({ id: 'later' }));
    await importBackup(db, json);
    expect(await listSessions(db)).toEqual([]);
  });

  it('clears the old baseline and settings when the backup has none', async () => {
    const json = await exportBackup(db, NOW); // baseline null
    await saveBaseline(db, makeBaseline({ workouts: 9 }));
    await saveSettings(db, { ...DEFAULT_SETTINGS, soundOn: false });
    await importBackup(db, json);
    expect(await getBaseline(db)).toBeNull();
  });

  it('refuses a future backup version', async () => {
    await expect(importBackup(db, JSON.stringify({ version: 99, sessions: [] })))
      .rejects.toThrow(/version/i);
  });

  it('refuses malformed JSON', async () => {
    await expect(importBackup(db, 'not json')).rejects.toThrow(/could not be read/i);
  });

  it('changes nothing when the backup shape is malformed', async () => {
    await insertSession(db, makeSession({ id: 'keep' }));
    const bad = JSON.stringify({ version: BACKUP_VERSION, sessions: [{ id: 1 }], planned: [], levelEvents: [] });
    await expect(importBackup(db, bad)).rejects.toThrow(/could not be read/i);
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['keep']);
  });

  it('rolls back to the original data when the restore fails part-way', async () => {
    await insertSession(db, makeSession({ id: 'keep' }));
    await saveBaseline(db, makeBaseline({ workouts: 7 }));
    const dup = makeSession({ id: 'dup' });
    const bad = JSON.stringify({
      version: BACKUP_VERSION, exportedAt: NOW.toISOString(),
      sessions: [dup, dup], planned: [], levelEvents: [], settings: DEFAULT_SETTINGS, baseline: null,
    });
    await expect(importBackup(db, bad)).rejects.toThrow();
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['keep']);
    expect((await getBaseline(db))!.workouts).toBe(7);
  });

  describe('rejects bad field values without deleting anything', () => {
    const base = () => ({
      version: BACKUP_VERSION, exportedAt: NOW.toISOString(),
      sessions: [makeSession({ id: 'ok' })], planned: [], levelEvents: [],
      settings: DEFAULT_SETTINGS, baseline: null,
    });
    const cases: Array<[string, (b: ReturnType<typeof base>) => unknown]> = [
      ['movement', (b) => { b.sessions[0]!.movement = 'JUMP' as never; }],
      ['kind', (b) => { b.sessions[0]!.kind = 'WEIRD' as never; }],
      ['effort', (b) => { b.sessions[0]!.effort = 11; }],
      ['weeklyGoalMin', (b) => { (b.settings as never as Record<string, unknown>).weeklyGoalMin = '80'; }],
      ['soundOn', (b) => { (b.settings as never as Record<string, unknown>).soundOn = 'yes'; }],
      ['planDays', (b) => { (b.settings as never as Record<string, unknown>).planDays = [{ dayOfWeek: 9, movement: 'SIX_COUNT' }]; }],
    ];
    it.each(cases)('%s', async (_name, mutate) => {
      await insertSession(db, makeSession({ id: 'keep' }));
      const b = base();
      mutate(b);
      await expect(importBackup(db, JSON.stringify(b))).rejects.toThrow(/could not be read/i);
      expect((await listSessions(db)).map((s) => s.id)).toEqual(['keep']);
    });
  });
});
