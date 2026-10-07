import * as SQLite from 'expo-sqlite';

export const DB_FILENAME = 'twenty.db';

/**
 * The narrow database surface every repository is written against. Backed by
 * expo-sqlite on device and better-sqlite3 in tests, so repository SQL is
 * covered for real rather than mocked.
 */
export interface Db {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  runAsync(sql: string, params?: unknown[]): Promise<void>;
}

export function createExpoDb(native: SQLite.SQLiteDatabase): Db {
  return {
    execAsync: (sql) => native.execAsync(sql),
    getAllAsync: <T,>(sql: string, params: unknown[] = []) =>
      native.getAllAsync<T>(sql, ...(params as never[])),
    runAsync: async (sql, params: unknown[] = []) => {
      await native.runAsync(sql, ...(params as never[]));
    },
  };
}

/** Opens the on-device database with foreign keys on. Caller runs migrations. */
export async function openAppDb(): Promise<Db> {
  const native = await SQLite.openDatabaseAsync(DB_FILENAME);
  await native.execAsync('PRAGMA foreign_keys = ON;');
  return createExpoDb(native);
}
