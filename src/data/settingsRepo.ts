import type { Db } from './db';
import { DEFAULT_PLAN_DAYS, DEFAULT_WEEKLY_GOAL_MIN } from '@/domain/planner';
import type { Baseline, Settings } from '@/domain/types';

export const KEY_SETTINGS = 'settings';
export const KEY_BASELINE = 'baseline';

export const DEFAULT_SETTINGS: Settings = {
  weeklyGoalMin: DEFAULT_WEEKLY_GOAL_MIN,
  planDays: DEFAULT_PLAN_DAYS,
  soundOn: true,
  hapticsOn: true,
  countInSec: 10,
};

async function readJson<T>(db: Db, key: string): Promise<T | null> {
  const rows = await db.getAllAsync<{ value: string }>(
    'SELECT value FROM app_kv WHERE key = ?',
    [key],
  );
  const raw = rows[0]?.value;
  return raw === undefined ? null : (JSON.parse(raw) as T);
}

async function writeJson(db: Db, key: string, value: unknown): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}

/** Missing keys fall back to defaults, so a fresh install needs no seeding. */
export async function getSettings(db: Db): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(db, KEY_SETTINGS);
  return stored === null ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(db: Db, s: Settings): Promise<void> {
  await writeJson(db, KEY_SETTINGS, s);
}

export async function getBaseline(db: Db): Promise<Baseline | null> {
  return readJson<Baseline>(db, KEY_BASELINE);
}

export async function saveBaseline(db: Db, b: Baseline): Promise<void> {
  await writeJson(db, KEY_BASELINE, b);
}
