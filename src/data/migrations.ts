import type { Db } from './db';

export interface Migration {
  version: number;
  up: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: [
      `CREATE TABLE IF NOT EXISTS sessions (
         id             TEXT PRIMARY KEY,
         movement       TEXT NOT NULL,
         started_at     TEXT NOT NULL,
         duration_sec   INTEGER NOT NULL,
         target_reps    INTEGER NOT NULL,
         completed_reps INTEGER NOT NULL,
         effort         INTEGER,
         kind           TEXT NOT NULL,
         notes          TEXT
       );`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);`,
      `CREATE TABLE IF NOT EXISTS planned_sessions (
         id          TEXT PRIMARY KEY,
         week_start  TEXT NOT NULL,
         day_of_week INTEGER NOT NULL,
         movement    TEXT NOT NULL,
         target_reps INTEGER NOT NULL,
         is_test_day INTEGER NOT NULL,
         session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL
       );`,
      `CREATE INDEX IF NOT EXISTS idx_planned_week ON planned_sessions(week_start);`,
      `CREATE TABLE IF NOT EXISTS level_events (
         id          TEXT PRIMARY KEY,
         level_order INTEGER NOT NULL,
         type        TEXT NOT NULL,
         at          TEXT NOT NULL
       );`,
      `CREATE TABLE IF NOT EXISTS app_kv (
         key   TEXT PRIMARY KEY,
         value TEXT NOT NULL
       );`,
    ],
  },
];

async function ensureVersionTable(db: Db): Promise<void> {
  await db.execAsync(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);',
  );
  const rows = await db.getAllAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM schema_version',
  );
  if ((rows[0]?.count ?? 0) === 0) {
    await db.runAsync('INSERT INTO schema_version (version) VALUES (0)', []);
  }
}

export async function schemaVersion(db: Db): Promise<number> {
  await ensureVersionTable(db);
  const rows = await db.getAllAsync<{ version: number }>('SELECT version FROM schema_version');
  return rows[0]?.version ?? 0;
}

/** Applies pending migrations in order and returns the resulting version. */
export async function runMigrations(db: Db): Promise<number> {
  let current = await schemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const statement of migration.up) {
      await db.execAsync(statement);
    }
    await db.runAsync('UPDATE schema_version SET version = ?', [migration.version]);
    current = migration.version;
  }
  return current;
}
