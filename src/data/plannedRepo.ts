import type { Db } from './db';
import type { Movement, PlannedSession } from '@/domain/types';

interface Row {
  id: string;
  week_start: string;
  day_of_week: number;
  movement: string;
  target_reps: number;
  is_test_day: number;
  session_id: string | null;
}

const COLUMNS = 'id, week_start, day_of_week, movement, target_reps, is_test_day, session_id';

function toDomain(row: Row): PlannedSession {
  const planned: PlannedSession = {
    id: row.id,
    weekStart: row.week_start,
    dayOfWeek: row.day_of_week,
    movement: row.movement as Movement,
    targetReps: row.target_reps,
    isTestDay: row.is_test_day === 1,
  };
  if (row.session_id !== null) planned.sessionId = row.session_id;
  return planned;
}

/** Upsert by id, so re-planning a week never duplicates rows. */
export async function saveWeek(db: Db, planned: PlannedSession[]): Promise<void> {
  for (const p of planned) {
    await db.runAsync(
      `INSERT INTO planned_sessions (${COLUMNS}) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         week_start = excluded.week_start,
         day_of_week = excluded.day_of_week,
         movement = excluded.movement,
         target_reps = excluded.target_reps,
         is_test_day = excluded.is_test_day,
         session_id = COALESCE(excluded.session_id, planned_sessions.session_id)`,
      [p.id, p.weekStart, p.dayOfWeek, p.movement, p.targetReps, p.isTestDay ? 1 : 0, p.sessionId ?? null],
    );
  }
}

export async function listWeek(db: Db, weekStart: string): Promise<PlannedSession[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM planned_sessions WHERE week_start = ? ORDER BY day_of_week ASC`,
    [weekStart],
  );
  return rows.map(toDomain);
}

export async function listAllPlanned(db: Db): Promise<PlannedSession[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM planned_sessions ORDER BY week_start ASC, day_of_week ASC`,
  );
  return rows.map(toDomain);
}

export async function linkSession(db: Db, plannedId: string, sessionId: string): Promise<void> {
  await db.runAsync('UPDATE planned_sessions SET session_id = ? WHERE id = ?', [sessionId, plannedId]);
}
