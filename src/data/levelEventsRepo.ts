import type { Db } from './db';
import type { LevelEvent } from '@/domain/types';

interface Row {
  id: string;
  level_order: number;
  type: string;
  at: string;
}

/** Ids come from `computeLevelEvents`, so this is safe to call on every load. */
export async function upsertLevelEvents(db: Db, events: LevelEvent[]): Promise<void> {
  for (const e of events) {
    await db.runAsync(
      `INSERT INTO level_events (id, level_order, type, at) VALUES (?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET level_order = excluded.level_order,
                                     type = excluded.type,
                                     at = excluded.at`,
      [e.id, e.levelOrder, e.type, e.at],
    );
  }
}

export async function listLevelEvents(db: Db): Promise<LevelEvent[]> {
  const rows = await db.getAllAsync<Row>(
    'SELECT id, level_order, type, at FROM level_events ORDER BY level_order ASC, at ASC',
  );
  return rows.map((r) => ({
    id: r.id,
    levelOrder: r.level_order,
    type: r.type as LevelEvent['type'],
    at: r.at,
  }));
}

/** Removes stored events whose ids are no longer derivable (after an edit or delete). */
export async function deleteLevelEventsExcept(db: Db, keepIds: string[]): Promise<void> {
  if (keepIds.length === 0) {
    await db.runAsync('DELETE FROM level_events');
    return;
  }
  const marks = keepIds.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM level_events WHERE id NOT IN (${marks})`, keepIds);
}
