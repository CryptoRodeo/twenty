import type { Db } from './db';
import { listLevelEvents, upsertLevelEvents } from './levelEventsRepo';
import { listAllPlanned, saveWeek } from './plannedRepo';
import { insertSession, listSessions } from './sessionsRepo';
import {
  DEFAULT_SETTINGS, getBaseline, getSettings, saveBaseline, saveSettings,
} from './settingsRepo';
import { GRADUATION_ORDER, MOVEMENTS } from '@/domain/levels';
import type { Baseline, LevelEvent, Movement, PlannedSession, Session, Settings } from '@/domain/types';

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

const SESSION_KINDS: string[] = ['GUIDED', 'CUSTOM', 'LANDMARK'];

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
  const isMovement = (v: unknown): boolean => MOVEMENTS.includes(v as Movement);
  rows('sessions').forEach((s, i) => {
    const ok = isRecord(s) && typeof s.id === 'string' && isMovement(s.movement)
      && typeof s.startedAt === 'string' && !Number.isNaN(Date.parse(s.startedAt))
      && typeof s.durationSec === 'number' && typeof s.targetReps === 'number'
      && typeof s.completedReps === 'number'
      && SESSION_KINDS.includes(s.kind as string)
      && (s.effort === null || s.effort === undefined
        || (Number.isInteger(s.effort) && (s.effort as number) >= 1 && (s.effort as number) <= 10));
    if (!ok) throw unreadable(`session ${i + 1} is malformed (check movement, kind, effort 1-10 or null, and its numbers)`);
  });
  rows('planned').forEach((p, i) => {
    const ok = isRecord(p) && typeof p.id === 'string' && typeof p.weekStart === 'string'
      && Number.isInteger(p.dayOfWeek) && (p.dayOfWeek as number) >= 0 && (p.dayOfWeek as number) <= 6
      && isMovement(p.movement) && typeof p.targetReps === 'number';
    if (!ok) throw unreadable(`planned session ${i + 1} is malformed`);
  });
  rows('levelEvents').forEach((e, i) => {
    const ok = isRecord(e) && typeof e.id === 'string' && typeof e.levelOrder === 'number'
      && (e.type === 'REACHED' || e.type === 'EXPIRED') && typeof e.at === 'string';
    if (!ok) throw unreadable(`level event ${i + 1} is malformed`);
  });
  if (raw.settings !== undefined && raw.settings !== null) {
    const st = raw.settings;
    const num = (v: unknown): boolean => v === undefined || (typeof v === 'number' && Number.isFinite(v));
    const bool = (v: unknown): boolean => v === undefined || typeof v === 'boolean';
    const ok = isRecord(st) && num(st.weeklyGoalMin) && num(st.countInSec)
      && bool(st.soundOn) && bool(st.hapticsOn)
      && (st.targetLevelOrder === undefined || (Number.isInteger(st.targetLevelOrder)
        && (st.targetLevelOrder as number) >= 0 && (st.targetLevelOrder as number) <= GRADUATION_ORDER))
      && (st.planDays === undefined || (Array.isArray(st.planDays) && st.planDays.every((d) =>
        isRecord(d) && Number.isInteger(d.dayOfWeek) && (d.dayOfWeek as number) >= 0
        && (d.dayOfWeek as number) <= 6 && isMovement(d.movement))));
    if (!ok) throw unreadable('the settings are malformed (check goal, count-in, sound, haptics, level and plan days)');
  }
  if (raw.baseline !== undefined && raw.baseline !== null) {
    const b = raw.baseline;
    const count = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const perMovement = (v: unknown): boolean => isRecord(v) && MOVEMENTS.every((m) => count(v[m]));
    const ok = isRecord(b)
      && (b.startLevelOrder === null || (Number.isInteger(b.startLevelOrder)
        && (b.startLevelOrder as number) >= 0 && (b.startLevelOrder as number) <= GRADUATION_ORDER))
      && perMovement(b.bestLandmark) && perMovement(b.totalReps)
      && count(b.workouts) && count(b.streakWeeks)
      && (b.graduationWeekStart === null || (typeof b.graduationWeekStart === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(b.graduationWeekStart)));
    if (!ok) throw unreadable('the baseline is malformed (check level, bests, totals, workouts, streak and graduation week)');
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
