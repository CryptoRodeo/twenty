import { readFileSync } from 'fs';
import { join } from 'path';
import { importBackup } from '@/data/backup';
import { runMigrations } from '@/data/migrations';
import { listSessions } from '@/data/sessionsRepo';
import { parseSessionCsv } from '@/domain/csv';
import { createTestDb } from './helpers/testDb';

const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');

function block(lang: string): string {
  const match = new RegExp('```' + lang + '\\n([\\s\\S]*?)```').exec(readme);
  if (!match) throw new Error(`README has no \`\`\`${lang} block`);
  return match[1]!;
}

describe('README examples', () => {
  it('CSV example parses with no errors', () => {
    const parsed = parseSessionCsv(block('csv'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows.map((r) => r.kind)).toEqual(['LANDMARK', 'LANDMARK', 'LANDMARK', 'CUSTOM']);
    expect(parsed.rows[1]!.effort).toBeNull();
  });

  it('JSON backup example is accepted by the real importer', async () => {
    const db = createTestDb();
    await runMigrations(db);
    await importBackup(db, block('json'));
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['s1']);
    db.close();
  });

  it('documents every secret the release workflow reads', () => {
    const workflow = readFileSync(join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
    const secrets = [...new Set([...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]!))];
    expect(secrets.length).toBeGreaterThan(0);
    for (const name of secrets) expect(readme).toContain(name);
  });

  it('names the graduation window by its constant rather than a hard-coded day count', () => {
    expect(readme).toContain('GRADUATION_VALID_DAYS');
    expect(readme).not.toMatch(/\b30 days\b/);
  });
});
