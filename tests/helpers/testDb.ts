import Database from 'better-sqlite3';
import type { Db } from '@/data/db';

export type TestDb = Db & { close(): void };

/**
 * better-sqlite3's native addon is process-global: it remembers the first
 * `SqliteError` class it was handed. Jest gives every test file its own vm
 * realm, but a worker process reuses the addon across files, so a later file
 * can receive errors whose prototype chain ends in a *previous* file's `Error`.
 * Those fail `instanceof Error`, which makes `.rejects.toThrow()` report
 * "Received function did not throw". Re-raising as a realm-local Error (as
 * expo-sqlite's plain Errors would be) keeps the harness realm-independent.
 */
function localize(error: unknown): Error {
  if (error instanceof Error) return error;
  const source = error as { message?: unknown; code?: unknown };
  const local = new Error(String(source?.message ?? error)) as Error & { code?: unknown };
  if (source?.code !== undefined) local.code = source.code;
  (local as Error & { cause?: unknown }).cause = error;
  return local;
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw localize(error);
  }
}

/** An in-memory SQLite database exposing the same async surface as expo-sqlite. */
export function createTestDb(): TestDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  return {
    async execAsync(sql: string): Promise<void> {
      guard(() => raw.exec(sql));
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return guard(() => raw.prepare(sql).all(...(params as never[])) as T[]);
    },
    async runAsync(sql: string, params: unknown[] = []): Promise<void> {
      guard(() => raw.prepare(sql).run(...(params as never[])));
    },
    close(): void {
      raw.close();
    },
  };
}
