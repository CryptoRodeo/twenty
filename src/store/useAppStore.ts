import { create } from 'zustand';
import { importBackup } from '@/data/backup';
import type { Db } from '@/data/db';
import { deleteLevelEventsExcept, upsertLevelEvents } from '@/data/levelEventsRepo';
import {
  linkSession, listAllPlanned, listWeek, saveWeek,
} from '@/data/plannedRepo';
import {
  deleteSession, insertSession, insertSessions, listSessions, updateSession,
} from '@/data/sessionsRepo';
import {
  DEFAULT_SETTINGS, getBaseline, getSettings, saveBaseline, saveSettings,
} from '@/data/settingsRepo';
import { GRADUATION_ORDER, MOVEMENT_SHORT, MOVEMENTS } from '@/domain/levels';
import { planWeek } from '@/domain/planner';
import { computeLevelEvents, computeProgression, type ProgressionState } from '@/domain/progression';
import {
  computeRecords, computeStreakWeeks, computeTotals, weeklyMinutes,
  type PersonalRecords, type Totals,
} from '@/domain/stats';
import { DAY_LETTERS, addDays, dayIndex, parseIsoDate, toIsoDate, weekStartIso } from '@/domain/time';
import type {
  Baseline, Movement, PlanDay, MovementMap, NewSession, PlannedSession, Session, Settings,
} from '@/domain/types';

export type { NewSession };

export interface ImportResult {
  imported: number;
  /** Rows identical to a session already stored, so not imported again. */
  skipped: number;
}

/** Identity used to spot a re-pasted CSV row: local date, movement, duration, reps. */
function sessionKey(s: NewSession): string {
  return `${toIsoDate(new Date(s.startedAt))}|${s.movement}|${s.durationSec}|${s.completedReps}`;
}

export interface AppState {
  ready: boolean;
  db: Db | null;
  sessions: Session[];
  planned: PlannedSession[];
  settings: Settings;
  baseline: Baseline | null;
  /** Level order just reached by the last saved session; the summary celebrates it. */
  pendingLevelUp: number | null;

  init: (db: Db) => Promise<void>;
  reload: () => Promise<void>;
  /** `plannedId` is the slot the player started from, when there was one. */
  addSession: (input: NewSession, plannedId?: string) => Promise<Session>;
  clearLevelUp: () => void;
  editSession: (s: Session) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /**
   * Choose the level being worked on, then restart this week's open slots with
   * the first-week rule. Completes nothing. Seeding flows call this LAST.
   */
  setTargetLevel: (order: number) => Promise<void>;
  /** Replace all data from a JSON backup, then re-derive levels and plan this week. */
  restoreBackup: (json: string) => Promise<void>;
  /** Save the baseline, then restart this week's open slots with the first-week rule. */
  importBaseline: (b: Baseline) => Promise<void>;
  /**
   * Append imported sessions, skipping rows identical to a stored session (same
   * date, movement, duration and reps), then restart this week's open slots
   * with the first-week rule.
   */
  importSessions: (rows: NewSession[]) => Promise<ImportResult>;
  ensureWeek: (now: Date) => Promise<void>;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requireDb(state: AppState): Db {
  if (!state.db) throw new Error('Store not initialised — call init(db) first');
  return state.db;
}

/**
 * Level history is derived, never authored: recompute it from all sessions
 * and make the stored rows match exactly (insert, update and delete).
 */
async function reconcileLevelEvents(
  db: Db, baseline: Baseline | null, targetLevelOrder: number,
): Promise<void> {
  const sessions = await listSessions(db);
  const events = computeLevelEvents({ sessions, baseline, now: new Date(), targetLevelOrder });
  await upsertLevelEvents(db, events);
  await deleteLevelEventsExcept(db, events.map((e) => e.id));
}

function nextLandmarks(progression: ProgressionState): MovementMap<number> {
  const landmarks = {} as MovementMap<number>;
  for (const m of MOVEMENTS) landmarks[m] = progression.nextTargets[m].target;
  return landmarks;
}

/** Plan one week from the current progression (pure read of db + state). `restart` ignores last week. */
async function buildWeek(
  db: Db, state: AppState, now: Date, planDays: PlanDay[] = state.settings.planDays,
  restart = false,
): Promise<PlannedSession[]> {
  const weekStart = weekStartIso(now);
  const { sessions, baseline } = state;
  const targetLevelOrder = state.settings.targetLevelOrder;
  const progression = computeProgression({ sessions, baseline, now, targetLevelOrder });
  const previousStartIso = toIsoDate(addDays(parseIsoDate(weekStart), -7));
  const previousWeek = restart ? [] : await listWeek(db, previousStartIso);
  // The next landmarks as they stood when last week was planned (its Monday):
  // a level reached since then reopens that movement with the first-week rule.
  const previousStart = parseIsoDate(previousStartIso);
  const previousLandmarks = nextLandmarks(computeProgression({
    sessions: sessions.filter((s) => new Date(s.startedAt) < previousStart),
    baseline, now: previousStart, targetLevelOrder,
  }));
  return planWeek({
    weekStart,
    planDays,
    previousWeek,
    sessions,
    landmarks: nextLandmarks(progression),
    previousLandmarks,
    best: progression.best,
  });
}

/**
 * Replace the targets of this week's slots that no session is linked to.
 * Linked (done) rows are never touched. No-op when the week is unplanned.
 * Each open row is updated in place, matched by day (its id is kept), so
 * rows are never added: a restored week whose ids do not follow the
 * planner's pattern cannot gain a duplicate slot.
 */
async function replanOpenSlots(
  db: Db, state: AppState, now: Date, opts: { restart?: boolean } = {},
): Promise<void> {
  const existing = await listWeek(db, weekStartIso(now));
  const open = existing.filter((p) => p.sessionId === undefined);
  if (open.length === 0) return;
  // Edit Week applies from next week: keep this week's day/movement layout.
  const layout = existing.map((p) => ({ dayOfWeek: p.dayOfWeek, movement: p.movement }));
  const fresh = await buildWeek(db, state, now, layout, opts.restart === true);
  const updates: PlannedSession[] = [];
  for (const row of open) {
    const plan = fresh.find((f) => f.dayOfWeek === row.dayOfWeek && f.movement === row.movement);
    if (plan) updates.push({ ...row, targetReps: plan.targetReps, isTestDay: plan.isTestDay });
  }
  await saveWeek(db, updates);
}

/** Plan this week when it has no rows yet. An existing (possibly hand-edited) week is never overwritten. */
async function planWeekIfMissing(
  db: Db, state: AppState, now: Date, opts: { restart?: boolean } = {},
): Promise<boolean> {
  if ((await listWeek(db, weekStartIso(now))).length > 0) return false;
  await saveWeek(db, await buildWeek(db, state, now, state.settings.planDays, opts.restart === true));
  return true;
}

/**
 * After history or baseline changes: rebuild level events, refresh state, then
 * re-plan this week's open slots (and plan the week if it does not exist yet).
 * `restart` is for explicit seeding actions (baseline or CSV import): the
 * targets planned before them were placeholders, so this week opens with the
 * first-week rule. A restore keeps the backup's own progression.
 */
async function settleDerivedState(
  db: Db, get: () => AppState, opts: { restart?: boolean } = {},
): Promise<void> {
  await reconcileLevelEvents(db, get().baseline, get().settings.targetLevelOrder);
  await get().reload();
  const now = new Date();
  await replanOpenSlots(db, get(), now, opts);
  await planWeekIfMissing(db, get(), now, opts);
  await get().reload();
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  db: null,
  sessions: [],
  planned: [],
  settings: DEFAULT_SETTINGS,
  baseline: null,
  pendingLevelUp: null,

  init: async (db) => {
    set({ db, pendingLevelUp: null });
    await get().reload();
    set({ ready: true });
  },

  reload: async () => {
    const db = requireDb(get());
    const [sessions, planned, settings, baseline] = await Promise.all([
      listSessions(db),
      listAllPlanned(db),
      getSettings(db),
      getBaseline(db),
    ]);
    set({ sessions, planned, settings, baseline });
  },

  addSession: async (input, plannedId) => {
    const db = requireDb(get());
    const before = selectProgression(get(), new Date(input.startedAt)).currentLevelOrder;
    const session: Session = { ...input, id: newId() };
    await insertSession(db, session);

    // Link only to a slot for the same movement in the session's week that is
    // still open: the one the player started from, else the same day's slot.
    // Missed slots are never ticked by a later workout.
    const startedAt = new Date(session.startedAt);
    const open = (await listWeek(db, weekStartIso(startedAt)))
      .filter((p) => p.movement === session.movement && p.sessionId === undefined);
    const slot = (plannedId !== undefined ? open.find((p) => p.id === plannedId) : undefined)
      ?? open.find((p) => p.dayOfWeek === dayIndex(startedAt));
    if (slot) await linkSession(db, slot.id, session.id);

    await reconcileLevelEvents(db, get().baseline, get().settings.targetLevelOrder);
    await get().reload();
    const after = selectProgression(get(), new Date(input.startedAt)).currentLevelOrder;
    // Always overwrite, so a flag left by a dismissed celebration cannot replay.
    set({ pendingLevelUp: after !== null && (before === null || after > before) ? after : null });
    // A fresh install has no baseline, so its week could not be planned at launch;
    // the first session gives it history. ensureWeek never overwrites an existing week.
    // Best-effort: the session is already persisted, so a planning failure must not
    // report a failed save (a retry would duplicate it); the foreground re-plan retries.
    try {
      await get().ensureWeek(new Date());
    } catch {
      // intentionally ignored
    }
    return session;
  },

  clearLevelUp: () => set({ pendingLevelUp: null }),

  editSession: async (s) => {
    const db = requireDb(get());
    await updateSession(db, s);
    await reconcileLevelEvents(db, get().baseline, get().settings.targetLevelOrder);
    await get().reload();
  },

  removeSession: async (id) => {
    const db = requireDb(get());
    await deleteSession(db, id);
    await reconcileLevelEvents(db, get().baseline, get().settings.targetLevelOrder);
    await get().reload();
  },

  updateSettings: async (patch) => {
    const db = requireDb(get());
    const next = { ...get().settings, ...patch };
    await saveSettings(db, next);
    set({ settings: next });
  },

  setTargetLevel: async (order) => {
    const db = requireDb(get());
    if (!Number.isInteger(order) || order < 0 || order > GRADUATION_ORDER) {
      throw new Error(`Invalid target level: ${order}`);
    }
    await get().updateSettings({ targetLevelOrder: order });
    // An explicit choice restarts this week's open targets with the first-week rule.
    const now = new Date();
    await replanOpenSlots(db, get(), now, { restart: true });
    await planWeekIfMissing(db, get(), now, { restart: true });
    await get().reload();
  },

  restoreBackup: async (json) => {
    const db = requireDb(get());
    await importBackup(db, json);
    // The restore is committed: derived-state failures must not report a failed restore.
    try {
      await get().reload();
      await settleDerivedState(db, get);
    } catch {
      try { await get().reload(); } catch { /* intentionally ignored */ }
    }
  },

  importBaseline: async (b) => {
    const db = requireDb(get());
    await saveBaseline(db, b);
    set({ baseline: b });
    await settleDerivedState(db, get, { restart: true });
  },

  importSessions: async (rows) => {
    const db = requireDb(get());
    const stored = new Set((await listSessions(db)).map(sessionKey));
    const fresh = rows.filter((row) => !stored.has(sessionKey(row)));
    const result: ImportResult = { imported: fresh.length, skipped: rows.length - fresh.length };
    if (fresh.length === 0) return result;
    await insertSessions(db, fresh.map((row) => ({ ...row, id: newId() })));
    // The rows are committed: a failure past this point must not report a failed
    // import (a retry would duplicate them). The foreground ensureWeek / next launch heals.
    try {
      await settleDerivedState(db, get, { restart: true });
    } catch {
      try { await get().reload(); } catch { /* intentionally ignored */ }
    }
    return result;
  },

  ensureWeek: async (now) => {
    const db = requireDb(get());
    if (await planWeekIfMissing(db, get(), now)) await get().reload();
  },
}));

// ---------------------------------------------------------------------------
// Selectors — pure functions of state, so they are testable without React.
// ---------------------------------------------------------------------------

export function selectProgression(s: AppState, now: Date): ProgressionState {
  return computeProgression({
    sessions: s.sessions, baseline: s.baseline, now, targetLevelOrder: s.settings.targetLevelOrder,
  });
}

export interface WeekDayView {
  dayOfWeek: number;
  letter: string;
  movement: Movement | null;
  short: string | null;
  planned: PlannedSession | null;
  done: boolean;
  isToday: boolean;
  /** Planned, earlier than today in the current week, and not done. */
  missed: boolean;
  isTestDay: boolean;
}

export interface WeekView {
  weekStart: string;
  days: WeekDayView[];
  planned: PlannedSession[];
  byMovement: MovementMap<PlannedSession[]>;
  minutesDone: number;
  goalMin: number;
}

export function selectWeek(s: AppState, now: Date): WeekView {
  const weekStart = weekStartIso(now);
  const planned = s.planned.filter((p) => p.weekStart === weekStart);
  const today = dayIndex(now);

  const days: WeekDayView[] = DAY_LETTERS.map((letter, d) => {
    const slot = planned.find((p) => p.dayOfWeek === d) ?? null;
    // Same source as Train: only this week's planned rows. No slot = rest day,
    // even when Edit Week has added the day from next week.
    const movement = slot?.movement ?? null;
    return {
      dayOfWeek: d,
      letter,
      movement,
      short: movement ? MOVEMENT_SHORT[movement] : null,
      planned: slot,
      done: slot?.sessionId !== undefined,
      isToday: d === today,
      missed: slot !== null && slot.sessionId === undefined && d < today,
      isTestDay: slot?.isTestDay ?? false,
    };
  });

  const byMovement = {} as MovementMap<PlannedSession[]>;
  for (const m of MOVEMENTS) byMovement[m] = planned.filter((p) => p.movement === m);

  return {
    weekStart,
    days,
    planned,
    byMovement,
    minutesDone: weeklyMinutes(s.sessions, weekStart),
    goalMin: s.settings.weeklyGoalMin,
  };
}

export interface StatsView {
  totals: Totals;
  records: PersonalRecords;
  streakWeeks: number;
}

export function selectStats(s: AppState, now: Date): StatsView {
  return {
    totals: computeTotals(s.sessions, s.baseline),
    records: computeRecords(s.sessions, s.baseline),
    streakWeeks: computeStreakWeeks({
      sessions: s.sessions,
      baseline: s.baseline,
      weeklyGoalMin: s.settings.weeklyGoalMin,
      now,
    }),
  };
}

/** Today's open slot if there is one, otherwise the next open day this week. */
export function selectNextPlan(s: AppState, now: Date): PlannedSession | null {
  const week = selectWeek(s, now);
  const today = dayIndex(now);
  return (
    week.planned.find((p) => p.dayOfWeek === today && p.sessionId === undefined)
    ?? week.planned.find((p) => p.dayOfWeek > today && p.sessionId === undefined)
    ?? null
  );
}
