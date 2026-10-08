export type Movement = 'SIX_COUNT' | 'NAVY_SEAL';

export type MovementMap<T> = Record<Movement, T>;

export type SessionKind = 'GUIDED' | 'CUSTOM' | 'LANDMARK';

/** One finished workout. */
export interface Session {
  id: string;
  movement: Movement;
  startedAt: string;      // ISO timestamp
  durationSec: number;    // planned duration (1200 for a standard session)
  targetReps: number;
  completedReps: number;
  effort: number | null;  // 1–10, entered after the workout
  kind: SessionKind;
  notes?: string;
}

/** One slot in a week's plan. */
export interface PlannedSession {
  id: string;
  weekStart: string;      // YYYY-MM-DD of the Monday
  dayOfWeek: number;      // 0 = Monday … 6 = Sunday
  movement: Movement;
  targetReps: number;
  isTestDay: boolean;
  sessionId?: string;     // set once completed
}

/** History of level changes. Never derived — always appended. */
export interface LevelEvent {
  id: string;
  levelOrder: number;
  type: 'REACHED' | 'EXPIRED';
  at: string;             // ISO timestamp
}

/** A session that has not been persisted yet — the id is assigned on insert. */
export type NewSession = Omit<Session, 'id'>;

export interface PlanDay {
  dayOfWeek: number;      // 0 = Monday … 6 = Sunday
  movement: Movement;
}

export interface Settings {
  weeklyGoalMin: number;  // default 80
  planDays: PlanDay[];
  soundOn: boolean;
  hapticsOn: boolean;
  countInSec: number;     // default 10
  /** Level the user is working toward (0..GRADUATION_ORDER); default 0 = 1A. Marks nothing completed. */
  targetLevelOrder: number;
  /**
   * Monday (ISO date) of the week of the last explicit seeding action (level
   * choice, baseline or CSV import); the week after it opens with the
   * first-week rule. `null` = none.
   */
  restartWeek: string | null;
}

/**
 * Pre-app progress entered once at onboarding. Stats add on top of this;
 * it is never modified by completing workouts.
 */
export interface Baseline {
  startLevelOrder: number | null;
  bestLandmark: MovementMap<number>;
  totalReps: MovementMap<number>;
  workouts: number;
  streakWeeks: number;
  /** Mon–Sun week in which the graduation landmarks were already met, if any. */
  graduationWeekStart: string | null;
}
