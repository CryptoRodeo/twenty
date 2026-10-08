import { parseSessionCsv } from '@/domain/csv';

describe('parseSessionCsv', () => {
  it('parses a well-formed file with a header', () => {
    const { rows, errors } = parseSessionCsv(
      'date,movement,durationMin,reps,effort\n2026-09-28,SIX_COUNT,20,288,8\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      movement: 'SIX_COUNT',
      durationSec: 1200,
      targetReps: 288,
      completedReps: 288,
      effort: 8,
      kind: 'LANDMARK',
    });
  });

  it('timestamps each row at noon local time so the date never shifts', () => {
    const { rows } = parseSessionCsv('2026-09-28,SIX_COUNT,20,288,8');
    const d = new Date(rows[0]!.startedAt);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(12);
  });

  it('works without a header and skips blank lines', () => {
    const { rows, errors } = parseSessionCsv('\n2026-09-28,6,20,288,8\n\n2026-09-29,navy,20,140,\n');
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.movement)).toEqual(['SIX_COUNT', 'NAVY_SEAL']);
  });

  it('accepts movement aliases case-insensitively', () => {
    const { rows } = parseSessionCsv(
      '2026-09-28,six-count,20,1,\n2026-09-28,6-COUNT,20,1,\n2026-09-28,Navy Seal,20,1,\n2026-09-28,n,20,1,',
    );
    expect(rows.map((r) => r.movement)).toEqual(['SIX_COUNT', 'SIX_COUNT', 'NAVY_SEAL', 'NAVY_SEAL']);
  });

  it('treats a blank effort as null', () => {
    const { rows } = parseSessionCsv('2026-09-28,SIX_COUNT,20,288,');
    expect(rows[0]!.effort).toBeNull();
  });

  it('marks a non-20-minute row as CUSTOM', () => {
    const { rows } = parseSessionCsv('2026-09-28,SIX_COUNT,10,120,6');
    expect(rows[0]).toMatchObject({ durationSec: 600, kind: 'CUSTOM' });
  });

  it('reports bad rows by line number and still imports the good ones', () => {
    const { rows, errors } = parseSessionCsv(
      [
        '2026-09-28,SIX_COUNT,20,288,8',
        '28/09/2026,SIX_COUNT,20,288,8',
        '2026-09-29,PUSHUPS,20,288,8',
        '2026-09-30,SIX_COUNT,0,288,8',
        '2026-10-01,SIX_COUNT,20,-5,8',
        '2026-10-02,SIX_COUNT,20,288,11',
        '2026-10-03,SIX_COUNT,20',
        '2026-10-04,NAVY_SEAL,20,140,9',
      ].join('\n'),
    );
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(6);
    expect(errors[0]).toMatch(/line 2/);
    expect(errors[0]).toMatch(/date/i);
    expect(errors[1]).toMatch(/line 3.*movement/i);
    expect(errors[2]).toMatch(/line 4.*duration/i);
    expect(errors[3]).toMatch(/line 5.*reps/i);
    expect(errors[4]).toMatch(/line 6.*effort/i);
    expect(errors[5]).toMatch(/line 7.*columns/i);
  });

  it('returns nothing for empty input', () => {
    expect(parseSessionCsv('   ')).toEqual({ rows: [], errors: [] });
  });

  it('rejects a well-shaped but impossible date', () => {
    const { rows, errors } = parseSessionCsv('2026-02-30,SIX_COUNT,20,288,8');
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/line 1.*date/i);
  });
});
