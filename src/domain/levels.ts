import type { Movement, MovementMap } from './types';

/** A landmark attempt must be exactly this long. */
export const LANDMARK_DURATION_SEC = 1200;

/** Graduation must be re-confirmed inside this many days. */
export const GRADUATION_VALID_DAYS = 30;

export const GRADUATION_ORDER = 10;

export const MOVEMENTS: readonly Movement[] = ['SIX_COUNT', 'NAVY_SEAL'];

/** Zero reps per movement. Copy before mutating. */
export const ZERO_REPS: MovementMap<number> = { SIX_COUNT: 0, NAVY_SEAL: 0 };

export const MOVEMENT_LABEL: MovementMap<string> = {
  SIX_COUNT: '6-count',
  NAVY_SEAL: 'Navy Seal',
};

export const MOVEMENT_SHORT: MovementMap<string> = {
  SIX_COUNT: '6',
  NAVY_SEAL: 'N',
};

export interface Level {
  order: number;
  name: string;
  targets: MovementMap<number>;
}

function level(order: number, name: string, sixCount: number, navySeal: number): Level {
  return { order, name, targets: { SIX_COUNT: sixCount, NAVY_SEAL: navySeal } };
}

/**
 * THE source of truth for level targets. Change rep targets here and nowhere
 * else — no other module may hard-code these numbers.
 */
export const LEVELS: readonly Level[] = [
  level(0, '1A', 1, 1),
  level(1, '1B', 50, 20),
  level(2, '1C', 100, 40),
  level(3, '1D', 150, 60),
  level(4, '2A', 200, 80),
  level(5, '2B', 225, 90),
  level(6, '3A', 250, 100),
  level(7, '3B', 260, 110),
  level(8, '4A', 275, 120),
  level(9, '4B', 300, 135),
  level(GRADUATION_ORDER, 'Graduation', 325, 150),
];

export function levelByOrder(order: number): Level {
  const found = LEVELS[order];
  if (!found) throw new Error(`Unknown level order: ${order}`);
  return found;
}

/** `null` means "no level reached yet", so the next level is 1A. */
export function nextLevelAfter(order: number | null): Level | null {
  const next = order === null ? 0 : order + 1;
  return LEVELS[next] ?? null;
}
