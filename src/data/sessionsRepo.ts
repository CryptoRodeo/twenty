import type { Db } from './db';
import type { Movement, Session, SessionKind } from '@/domain/types';

interface Row {
  id: string;
  movement: string;
  started_at: string;
  duration_sec: number;
  target_reps: number;
  completed_reps: number;
  effort: number | null;
  kind: string;
  notes: string | null;
}

const COLUMNS =
  'id, movement, started_at, duration_sec, target_reps, completed_reps, effort, kind, notes';

function toDomain(row: Row): Session {
  const session: Session = {
    id: row.id,
    movement: row.movement as Movement,
    startedAt: row.started_at,
    durationSec: row.duration_sec,
    targetReps: row.target_reps,
    completedReps: row.completed_reps,
    effort: row.effort,
    kind: row.kind as SessionKind,
  };
  if (row.notes !== null) session.notes = row.notes;
  return session;
}

function toParams(s: Session): unknown[] {
  return [
    s.id, s.movement, s.startedAt, s.durationSec, s.targetReps,
    s.completedReps, s.effort, s.kind, s.notes ?? null,
  ];
}

export async function insertSession(db: Db, s: Session): Promise<void> {
  await db.runAsync(
    `INSERT INTO sessions (${COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?)`,
    toParams(s),
  );
}

export async function updateSession(db: Db, s: Session): Promise<void> {
  await db.runAsync(
    `UPDATE sessions SET movement = ?, started_at = ?, duration_sec = ?, target_reps = ?,
       completed_reps = ?, effort = ?, kind = ?, notes = ? WHERE id = ?`,
    [...toParams(s).slice(1), s.id],
  );
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
}

export async function listSessions(db: Db): Promise<Session[]> {
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM sessions ORDER BY started_at ASC, id ASC`,
  );
  return rows.map(toDomain);
}

export async function getSession(db: Db, id: string): Promise<Session | null> {
  const rows = await db.getAllAsync<Row>(
    `SELECT ${COLUMNS} FROM sessions WHERE id = ?`,
    [id],
  );
  return rows[0] ? toDomain(rows[0]) : null;
}
