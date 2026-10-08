import { create } from 'zustand';
import type { Db } from '@/data/db';
import {
  deleteLevelEventsExcept, listLevelEvents, upsertLevelEvents,
} from '@/data/levelEventsRepo';
import { linkSession, listAllPlanned, listWeek, saveWeek } from '@/data/plannedRepo';
import {
  deleteSession, insertSession, listSessions, updateSession,
} from '@/data/sessionsRepo';
import {
  DEFAULT_SETTINGS, getBaseline, getSettings, saveBaseline, saveSettings,
} from '@/data/settingsRepo';
import { MOVEMENT_SHORT, MOVEMENTS } from '@/domain/levels';
import { movementForDay, planWeek } from '@/domain/planner';
import { computeLevelEvents, computeProgression, type ProgressionState } from '@/domain/progression';
import {
  computeRecords, computeStreakWeeks, computeTotals, weeklyMinutes,
  type PersonalRecords, type Totals,
} from '@/domain/stats';
import { DAY_LETTERS, addDays, dayIndex, parseIsoDate, toIsoDate, weekStartIso } from '@/domain/time';
import type {
  Baseline, LevelEvent, Movement, MovementMap, NewSession, PlannedSession, Session, Settings,
} from '@/domain/types';

export type { NewSession };

export interface AppState {
  ready: boolean;
  db: Db | null;
  sessions: Session[];
  planned: PlannedSession[];
  levelEvents: LevelEvent[];
  settings: Settings;
  baseline: Baseline | null;

  init: (db: Db) => Promise<void>;
  reload: () => Promise<void>;
  /** `plannedId` is the slot the player started from, when there was one. */
  addSession: (input: NewSession, plannedId?: string) => Promise<Session>;
  editSession: (s: Session) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  importBaseline: (b: Baseline) => Promise<void>;
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
async function reconcileLevelEvents(db: Db, baseline: Baseline | null): Promise<void> {
  const sessions = await listSessions(db);
  const events = computeLevelEvents({ sessions, baseline, now: new Date() });
  await upsertLevelEvents(db, events);
  await deleteLevelEventsExcept(db, events.map((e) => e.id));
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  db: null,
  sessions: [],
  planned: [],
  levelEvents: [],
  settings: DEFAULT_SETTINGS,
  baseline: null,

  init: async (db) => {
    set({ db });
    await get().reload();
    set({ ready: true });
  },

  reload: async () => {
    const db = requireDb(get());
    const [sessions, planned, levelEvents, settings, baseline] = await Promise.all([
      listSessions(db),
      listAllPlanned(db),
      listLevelEvents(db),
      getSettings(db),
      getBaseline(db),
    ]);
    set({ sessions, planned, levelEvents, settings, baseline });
  },

  addSession: async (input, plannedId) => {
    const db = requireDb(get());
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

    await reconcileLevelEvents(db, get().baseline);
    await get().reload();
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

  editSession: async (s) => {
    const db = requireDb(get());
    await updateSession(db, s);
    await reconcileLevelEvents(db, get().baseline);
    await get().reload();
  },

  removeSession: async (id) => {
    const db = requireDb(get());
    await deleteSession(db, id);
    await reconcileLevelEvents(db, get().baseline);
    await get().reload();
  },

  updateSettings: async (patch) => {
    const db = requireDb(get());
    const next = { ...get().settings, ...patch };
    await saveSettings(db, next);
    set({ settings: next });
  },

  importBaseline: async (b) => {
    const db = requireDb(get());
    await saveBaseline(db, b);
    set({ baseline: b });
    await reconcileLevelEvents(db, b);
    await get().ensureWeek(new Date());
    await get().reload();
  },

  ensureWeek: async (now) => {
    const db = requireDb(get());
    const weekStart = weekStartIso(now);
    // An existing week (possibly hand-edited) is never overwritten.
    if ((await listWeek(db, weekStart)).length > 0) return;

    const state = get();
    const progression = computeProgression({
      sessions: state.sessions, baseline: state.baseline, now,
    });
    const landmarks = {} as MovementMap<number>;
    for (const m of MOVEMENTS) landmarks[m] = progression.nextTargets[m].target;

    const previousWeek = await listWeek(db, toIsoDate(addDays(parseIsoDate(weekStart), -7)));
    await saveWeek(db, planWeek({
      weekStart,
      planDays: state.settings.planDays,
      previousWeek,
      sessions: state.sessions,
      landmarks,
      best: progression.best,
    }));
    await get().reload();
  },
}));

// ---------------------------------------------------------------------------
// Selectors — pure functions of state, so they are testable without React.
// ---------------------------------------------------------------------------

export function selectProgression(s: AppState, now: Date): ProgressionState {
  return computeProgression({ sessions: s.sessions, baseline: s.baseline, now });
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
    const movement = slot?.movement ?? movementForDay(s.settings.planDays, d);
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

export function selectTodaysPlan(s: AppState, now: Date): PlannedSession | null {
  return selectWeek(s, now).days[dayIndex(now)]?.planned ?? null;
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
