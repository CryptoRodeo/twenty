import type { Db } from './db';
import { listLevelEvents, upsertLevelEvents } from './levelEventsRepo';
import { listAllPlanned, saveWeek } from './plannedRepo';
import { insertSession, listSessions } from './sessionsRepo';
import {
  DEFAULT_SETTINGS, getBaseline, getSettings, saveBaseline, saveSettings,
} from './settingsRepo';
import { GRADUATION_ORDER } from '@/domain/levels';
import type { Baseline, LevelEvent, PlannedSession, Session, Settings } from '@/domain/types';

export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: string;
  sessions: Session[];
  planned: PlannedSession[];
  levelEvents: LevelEvent[];
  settings: Settings;
  baseline: Baseline | null;
}

export async function exportBackup(db: Db, now: Date): Promise<string> {
  const file: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    sessions: await listSessions(db),
    planned: await listAllPlanned(db),
    levelEvents: await listLevelEvents(db),
    settings: await getSettings(db),
    baseline: await getBaseline(db),
  };
  return JSON.stringify(file, null, 2);
}

const unreadable = (why: string): Error =>
  new Error(`That backup could not be read — ${why}.`);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Parses and shape-checks a backup. Throws before anything is written. */
function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw unreadable('it is not valid JSON');
  }
  if (!isRecord(raw)) throw unreadable('it is not a backup file');
  if (raw.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version ${String(raw.version)} — this app reads version ${BACKUP_VERSION}.`,
    );
  }
  for (const key of ['sessions', 'planned', 'levelEvents'] as const) {
    if (!Array.isArray(raw[key])) throw unreadable(`"${key}" is missing`);
  }
  const rows = (key: string): unknown[] => raw[key] as unknown[];
  if (!rows('sessions').every((s) => isRecord(s) && typeof s.id === 'string'
    && typeof s.movement === 'string' && typeof s.startedAt === 'string'
    && typeof s.durationSec === 'number' && typeof s.targetReps === 'number'
    && typeof s.completedReps === 'number' && typeof s.kind === 'string')) {
    throw unreadable('a session is malformed');
  }
  if (!rows('planned').every((p) => isRecord(p) && typeof p.id === 'string'
    && typeof p.weekStart === 'string' && typeof p.dayOfWeek === 'number'
    && typeof p.movement === 'string' && typeof p.targetReps === 'number')) {
    throw unreadable('a planned session is malformed');
  }
  if (!rows('levelEvents').every((e) => isRecord(e) && typeof e.id === 'string'
    && typeof e.levelOrder === 'number' && typeof e.type === 'string'
    && typeof e.at === 'string')) {
    throw unreadable('a level event is malformed');
  }
  if (raw.settings !== undefined && raw.settings !== null) {
    const order = isRecord(raw.settings) ? raw.settings.targetLevelOrder : undefined;
    if (!isRecord(raw.settings)
      || (order !== undefined && (!Number.isInteger(order) || (order as number) < 0
        || (order as number) > GRADUATION_ORDER))) {
      throw unreadable('the settings are malformed');
    }
  }
  if (raw.baseline !== undefined && raw.baseline !== null && !isRecord(raw.baseline)) {
    throw unreadable('the baseline is malformed');
  }
  return raw as unknown as BackupFile;
}

/**
 * Destructive by design: a restore replaces everything (sessions, plan, level
 * history, settings and baseline). Validated first, then applied atomically.
 */
export async function importBackup(db: Db, json: string): Promise<void> {
  const file = parseBackup(json);

  await db.execAsync('BEGIN');
  try {
    // Planned sessions reference sessions, so clear children before parents.
    await db.runAsync('DELETE FROM planned_sessions', []);
    await db.runAsync('DELETE FROM sessions', []);
    await db.runAsync('DELETE FROM level_events', []);
    await db.runAsync('DELETE FROM app_kv', []);

    for (const s of file.sessions) await insertSession(db, s);
    await saveWeek(db, file.planned);
    await upsertLevelEvents(db, file.levelEvents);
    if (file.settings) await saveSettings(db, { ...DEFAULT_SETTINGS, ...file.settings });
    if (file.baseline) await saveBaseline(db, file.baseline);
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
