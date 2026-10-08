import { LANDMARK_DURATION_SEC } from './levels';
import type { Movement, NewSession } from './types';

export const CSV_HEADER = 'date,movement,durationMin,reps,effort';

export interface ParsedCsv {
  rows: NewSession[];
  errors: string[];
}

const MOVEMENT_ALIASES: Record<string, Movement> = {
  six_count: 'SIX_COUNT', sixcount: 'SIX_COUNT', six: 'SIX_COUNT',
  '6': 'SIX_COUNT', '6-count': 'SIX_COUNT', '6count': 'SIX_COUNT', 'six-count': 'SIX_COUNT',
  navy_seal: 'NAVY_SEAL', navyseal: 'NAVY_SEAL', navy: 'NAVY_SEAL',
  n: 'NAVY_SEAL', 'navy seal': 'NAVY_SEAL', 'navy-seal': 'NAVY_SEAL',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEADER_KEY = CSV_HEADER.toLowerCase().replace(/\s/g, '');

/** Noon local: far enough from both DST edges that the calendar date is stable. */
function noonLocal(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** A real calendar date, not just a well-shaped string (rejects 2026-02-30). */
function parseDate(text: string): string | null {
  if (!ISO_DATE.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number) as [number, number, number];
  const at = noonLocal(y, m, d);
  const real = at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
  return real ? at.toISOString() : null;
}

export function parseSessionCsv(text: string): ParsedCsv {
  const rows: NewSession[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    const lineNo = index + 1;
    if (line === '') return;
    if (line.toLowerCase().replace(/\s/g, '') === HEADER_KEY) return;

    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== 5) {
      errors.push(`line ${lineNo}: expected 5 columns (${CSV_HEADER}), got ${cells.length}`);
      return;
    }
    const [date, movementRaw, durationRaw, repsRaw, effortRaw] =
      cells as [string, string, string, string, string];

    const startedAt = parseDate(date);
    if (startedAt === null) {
      errors.push(`line ${lineNo}: date must be a real YYYY-MM-DD date, got "${date}"`);
      return;
    }
    const movement = MOVEMENT_ALIASES[movementRaw.toLowerCase()];
    if (movement === undefined) {
      errors.push(`line ${lineNo}: unknown movement "${movementRaw}"`);
      return;
    }
    const durationMin = Number(durationRaw);
    if (durationRaw === '' || !Number.isFinite(durationMin) || durationMin <= 0) {
      errors.push(`line ${lineNo}: duration must be a positive number of minutes, got "${durationRaw}"`);
      return;
    }
    const reps = Number(repsRaw);
    if (repsRaw === '' || !Number.isInteger(reps) || reps < 0) {
      errors.push(`line ${lineNo}: reps must be a whole number of 0 or more, got "${repsRaw}"`);
      return;
    }
    let effort: number | null = null;
    if (effortRaw !== '') {
      const parsed = Number(effortRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
        errors.push(`line ${lineNo}: effort must be blank or a whole number 1-10, got "${effortRaw}"`);
        return;
      }
      effort = parsed;
    }

    const durationSec = Math.round(durationMin * 60);
    rows.push({
      movement,
      startedAt,
      durationSec,
      targetReps: reps,
      completedReps: reps,
      effort,
      kind: durationSec === LANDMARK_DURATION_SEC ? 'LANDMARK' : 'CUSTOM',
    });
  });

  return { rows, errors };
}
