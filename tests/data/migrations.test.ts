import { MIGRATIONS, runMigrations, schemaVersion } from '@/data/migrations';
import { createTestDb, type TestDb } from '../helpers/testDb';

let db: TestDb;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe('runMigrations', () => {
  it('starts at version 0', async () => {
    expect(await schemaVersion(db)).toBe(0);
  });

  it('creates every table', async () => {
    await runMigrations(db);
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    expect(rows.map((r) => r.name)).toEqual(
      expect.arrayContaining(['app_kv', 'level_events', 'planned_sessions', 'schema_version', 'sessions']),
    );
  });

  it('reports the latest version afterwards', async () => {
    const latest = MIGRATIONS[MIGRATIONS.length - 1]!.version;
    expect(await runMigrations(db)).toBe(latest);
    expect(await schemaVersion(db)).toBe(latest);
  });

  it('is idempotent — running twice changes nothing and does not throw', async () => {
    await runMigrations(db);
    await expect(runMigrations(db)).resolves.toBe(MIGRATIONS[MIGRATIONS.length - 1]!.version);
  });

  it('enforces the sessions primary key', async () => {
    await runMigrations(db);
    const insert =
      'INSERT INTO sessions (id, movement, started_at, duration_sec, target_reps, completed_reps, effort, kind, notes) VALUES (?,?,?,?,?,?,?,?,?)';
    const row = ['s1', 'SIX_COUNT', '2026-10-07T06:00:00.000Z', 1200, 100, 100, 7, 'GUIDED', null];
    await db.runAsync(insert, row);
    await expect(db.runAsync(insert, row)).rejects.toThrow();
  });

  it('nulls a planned session link when its session is deleted', async () => {
    await runMigrations(db);
    await db.runAsync(
      'INSERT INTO sessions (id, movement, started_at, duration_sec, target_reps, completed_reps, effort, kind, notes) VALUES (?,?,?,?,?,?,?,?,?)',
      ['s1', 'SIX_COUNT', '2026-10-07T06:00:00.000Z', 1200, 100, 100, 7, 'GUIDED', null],
    );
    await db.runAsync(
      'INSERT INTO planned_sessions (id, week_start, day_of_week, movement, target_reps, is_test_day, session_id) VALUES (?,?,?,?,?,?,?)',
      ['2026-10-05-2', '2026-10-05', 2, 'SIX_COUNT', 100, 0, 's1'],
    );
    await db.runAsync('DELETE FROM sessions WHERE id = ?', ['s1']);
    const [planned] = await db.getAllAsync<{ session_id: string | null }>(
      'SELECT session_id FROM planned_sessions',
    );
    expect(planned!.session_id).toBeNull();
  });
});
