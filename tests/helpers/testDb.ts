import Database from 'better-sqlite3';
import type { Db } from '@/data/db';

export type TestDb = Db & { close(): void };

/** An in-memory SQLite database exposing the same async surface as expo-sqlite. */
export function createTestDb(): TestDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  return {
    async execAsync(sql: string): Promise<void> {
      raw.exec(sql);
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    async runAsync(sql: string, params: unknown[] = []): Promise<void> {
      raw.prepare(sql).run(...(params as never[]));
    },
    close(): void {
      raw.close();
    },
  };
}
