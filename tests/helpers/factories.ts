import type { Baseline, Session } from '@/domain/types';
import { LANDMARK_DURATION_SEC } from '@/domain/levels';
import { ZERO_BASELINE } from '@/domain/progression';

let seq = 0;

export function makeSession(overrides: Partial<Session> = {}): Session {
  seq += 1;
  return {
    id: `s${seq}`,
    movement: 'SIX_COUNT',
    startedAt: '2026-10-05T06:00:00.000Z',
    durationSec: LANDMARK_DURATION_SEC,
    targetReps: 100,
    completedReps: 100,
    effort: 7,
    kind: 'GUIDED',
    ...overrides,
  };
}

export const EMPTY_BASELINE = ZERO_BASELINE;

export function makeBaseline(overrides: Partial<Baseline> = {}): Baseline {
  return { ...EMPTY_BASELINE, ...overrides };
}
