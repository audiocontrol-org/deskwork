/**
 * Integration tests for `deskwork doctor`.
 *
 * Each rule has a fixture project that violates the rule:
 *   - audit-only mode reports the finding and exits 1
 *   - --fix=<rule> --yes (or interactive equivalent) repairs where
 *     the rule has a real auto-repair, or skips with a clear message
 *     when the rule defers to the operator (slug-collision,
 *     ambiguous missing-frontmatter-id, etc.)
 *   - re-audit on the post-repair state expects no findings; exit 0
 *
 * Tests use the real `deskwork` CLI binary against tmp project trees
 * bootstrapped via `deskwork install` — same approach as
 * ingest-integration.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCalendar, writeCalendar } from '@deskwork/core/calendar';
import { parseFrontmatter } from '@deskwork/core/frontmatter';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  json?: unknown;
}

function run(subcommand: string, args: string[]): RunResult {
  const r = spawnSync(deskworkBin, [subcommand, ...args], { encoding: 'utf-8' });
  const stdout = r.stdout ?? '';
  let json: unknown;
  try {
    json = stdout.trim().length > 0 ? JSON.parse(stdout) : undefined;
  } catch {
    // text mode output isn't JSON; tests that care assert via stdout
  }
  return {
    code: r.status ?? -1,
    stdout,
    stderr: r.stderr ?? '',
    ...(json !== undefined ? { json } : {}),
  };
}

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'deskwork-doctor-int-'));
  const cfg = {
    version: 1,
    sites: {
      main: {
        host: 'example.com',
        contentDir: 'src/content',
        calendarPath: 'docs/calendar.md',
      },
    },
  };
  const cfgFile = join(project, 'config.tmp.json');
  writeFileSync(cfgFile, JSON.stringify(cfg), 'utf-8');
  const installRes = run('install', [project, cfgFile]);
  if (installRes.code !== 0) {
    throw new Error(`install failed: ${installRes.stderr || installRes.stdout}`);
  }
  rmSync(cfgFile);
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function writeContent(rel: string, contents: string): string {
  const abs = join(project, 'src/content', rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents, 'utf-8');
  return abs;
}

function writeRaw(rel: string, contents: string): string {
  const abs = join(project, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents, 'utf-8');
  return abs;
}

function readCalendarFile() {
  const raw = readFileSync(join(project, 'docs/calendar.md'), 'utf-8');
  return parseCalendar(raw);
}

function frontmatterOf(rel: string): Record<string, unknown> {
  const raw = readFileSync(join(project, 'src/content', rel), 'utf-8');
  return parseFrontmatter(raw).data;
}

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';
const ID_D = '44444444-4444-4444-8444-444444444444';

// ---------------------------------------------------------------------------
// Healthy fixture — sanity check
// ---------------------------------------------------------------------------

describe('deskwork doctor — healthy fixture', () => {
  it('exits 0 on a clean project with no findings', () => {
    const res = run('doctor', [project]);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/clean|no findings/i);
  });

  it('emits structured JSON in --json mode', () => {
    const res = run('doctor', [project, '--json']);
    expect(res.code).toBe(0);
    expect(res.json).toBeDefined();
    const out = res.json as { mode?: string; findings?: unknown[]; sites?: string[] };
    expect(out.mode).toBe('audit');
    expect(out.findings).toEqual([]);
    expect(out.sites).toEqual(['main']);
  });
});

// ---------------------------------------------------------------------------
// missing-frontmatter-id
// ---------------------------------------------------------------------------

describe('deskwork doctor — missing-frontmatter-id', () => {
  it('reports findings when calendar has an entry but no file carries the id', () => {
    // Add a calendar entry, then create a file at the slug-template path
    // WITHOUT an `id:` so it's a candidate but not yet bound.
    run('add', [project, 'My Post']);
    writeContent(
      'my-post/index.md',
      '---\ntitle: My Post\n---\n\n# My Post\n',
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/missing-frontmatter-id/);
  });

  it('--fix=missing-frontmatter-id --yes binds the id when there is exactly one candidate', () => {
    run('add', [project, 'Single Candidate']);
    writeContent(
      'single-candidate/index.md',
      '---\ntitle: Single Candidate\n---\n\n# Single\n',
    );

    const fix = run('doctor', [project, '--fix=missing-frontmatter-id', '--yes']);
    expect(fix.code).toBe(0);
    expect(fix.stdout).toMatch(/applied/);

    // File now carries the calendar's id.
    const cal = readCalendarFile();
    const entry = cal.entries.find((e) => e.slug === 'single-candidate');
    expect(entry).toBeDefined();
    if (!entry) return;
    const fm = frontmatterOf('single-candidate/index.md');
    expect(fm.id).toBe(entry.id);

    // Re-audit: no findings.
    const reaudit = run('doctor', [project]);
    expect(reaudit.code).toBe(0);
  });

  it('--fix=... --yes skips when multiple candidates exist (ambiguous)', () => {
    run('add', [project, 'Ambiguous']);
    // Two candidate files: one at the slug-template path, one with a
    // matching title elsewhere.
    writeContent(
      'ambiguous/index.md',
      '---\ntitle: Ambiguous\n---\n\n# A\n',
    );
    writeContent(
      'other/duplicate-title.md',
      '---\ntitle: Ambiguous\n---\n\n# B\n',
    );

    const fix = run('doctor', [project, '--fix=missing-frontmatter-id', '--yes']);
    // exit code is 1 because the finding wasn't repaired (skipped).
    expect(fix.code).toBe(1);
    expect(fix.stdout).toMatch(/skipped/i);

    // Neither file got an id written.
    const fmA = frontmatterOf('ambiguous/index.md');
    const fmB = frontmatterOf('other/duplicate-title.md');
    expect(fmA.id).toBeUndefined();
    expect(fmB.id).toBeUndefined();
  });

  it('reports zero candidates explicitly when no matching file exists', () => {
    run('add', [project, 'Detached Entry']);
    // No file at all under contentDir.

    const fix = run('doctor', [project, '--fix=missing-frontmatter-id', '--yes']);
    expect(fix.code).toBe(1);
    expect(fix.stdout).toMatch(/no candidate file/);
  });
});

// ---------------------------------------------------------------------------
// orphan-frontmatter-id
// ---------------------------------------------------------------------------

describe('deskwork doctor — orphan-frontmatter-id', () => {
  it('reports a file whose id has no calendar match', () => {
    writeContent(
      'orphan/index.md',
      `---\nid: ${ID_A}\ntitle: Orphan\n---\n\n# Orphan\n`,
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/orphan-frontmatter-id/);
  });

  it('--fix --yes leaves orphans alone (safe default)', () => {
    writeContent(
      'orphan/index.md',
      `---\nid: ${ID_A}\ntitle: Orphan\n---\n\n# Orphan\n`,
    );

    const fix = run('doctor', [project, '--fix=orphan-frontmatter-id', '--yes']);
    // --yes can't safely choose between leaving alone vs clearing the id;
    // it skips, exit 1.
    expect(fix.code).toBe(1);
    expect(fix.stdout).toMatch(/skipped/i);

    // Frontmatter unchanged.
    const fm = frontmatterOf('orphan/index.md');
    expect(fm.id).toBe(ID_A);
  });
});

// ---------------------------------------------------------------------------
// duplicate-id
// ---------------------------------------------------------------------------

describe('deskwork doctor — duplicate-id', () => {
  it('reports two files sharing the same frontmatter id', () => {
    writeContent(
      'a/index.md',
      `---\nid: ${ID_A}\ntitle: First\n---\n\n# A\n`,
    );
    writeContent(
      'b/index.md',
      `---\nid: ${ID_A}\ntitle: Second\n---\n\n# B\n`,
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/duplicate-id/);
  });

  it('--fix --yes skips duplicates (operator must pick the canonical file)', () => {
    writeContent(
      'a/index.md',
      `---\nid: ${ID_A}\ntitle: First\n---\n\n# A\n`,
    );
    writeContent(
      'b/index.md',
      `---\nid: ${ID_A}\ntitle: Second\n---\n\n# B\n`,
    );

    const fix = run('doctor', [project, '--fix=duplicate-id', '--yes']);
    expect(fix.code).toBe(1);
    expect(fix.stdout).toMatch(/skipped/i);

    // Both files still have the id.
    expect(frontmatterOf('a/index.md').id).toBe(ID_A);
    expect(frontmatterOf('b/index.md').id).toBe(ID_A);
  });
});

// ---------------------------------------------------------------------------
// slug-collision
// ---------------------------------------------------------------------------

describe('deskwork doctor — slug-collision', () => {
  it('reports two calendar entries sharing the same slug', () => {
    // Hand-write a calendar with two entries sharing a slug — addEntry
    // would refuse this, which is exactly the invariant doctor exists
    // to catch when it slips through hand-edits.
    const calendarPath = join(project, 'docs/calendar.md');
    const calendar = parseCalendar(readFileSync(calendarPath, 'utf-8'));
    calendar.entries.push(
      {
        id: ID_A,
        slug: 'shared-slug',
        title: 'First',
        description: '',
        stage: 'Ideas',
        targetKeywords: [],
        source: 'manual',
      },
      {
        id: ID_B,
        slug: 'shared-slug',
        title: 'Second',
        description: '',
        stage: 'Ideas',
        targetKeywords: [],
        source: 'manual',
      },
    );
    writeCalendar(calendarPath, calendar);

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/slug-collision/);
  });

  it('--fix=slug-collision --yes refuses to choose (report-only)', () => {
    const calendarPath = join(project, 'docs/calendar.md');
    const calendar = parseCalendar(readFileSync(calendarPath, 'utf-8'));
    calendar.entries.push(
      {
        id: ID_A,
        slug: 'collide',
        title: 'A',
        description: '',
        stage: 'Ideas',
        targetKeywords: [],
        source: 'manual',
      },
      {
        id: ID_B,
        slug: 'collide',
        title: 'B',
        description: '',
        stage: 'Ideas',
        targetKeywords: [],
        source: 'manual',
      },
    );
    writeCalendar(calendarPath, calendar);

    const fix = run('doctor', [project, '--fix=slug-collision', '--yes']);
    expect(fix.code).toBe(1);
    // The repair message references the editorial nature of the call.
    expect(fix.stdout).toMatch(/rename|operator|automatic/i);
  });
});

// ---------------------------------------------------------------------------
// schema-rejected
// ---------------------------------------------------------------------------

describe('deskwork doctor — schema-rejected', () => {
  it('audit returns no findings (passive rule by design)', () => {
    const res = run('doctor', [project, '--json']);
    expect(res.code).toBe(0);
    const out = res.json as { findings?: Array<{ ruleId: string }> };
    const schemaFindings = (out.findings ?? []).filter(
      (f) => f.ruleId === 'schema-rejected',
    );
    expect(schemaFindings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// workflow-stale
// ---------------------------------------------------------------------------

describe('deskwork doctor — workflow-stale', () => {
  it('reports a workflow whose slug has no matching calendar entry', () => {
    // Hand-craft a stale workflow on disk under .deskwork/review-journal/pipeline/.
    const workflow = {
      id: ID_C,
      site: 'main',
      slug: 'gone-from-calendar',
      contentKind: 'longform',
      state: 'in-review',
      currentVersion: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    writeRaw(
      `.deskwork/review-journal/pipeline/2025-01-01T00-00-00-000Z-${ID_C}.json`,
      JSON.stringify(workflow, null, 2),
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/workflow-stale/);
  });

  it('--fix=workflow-stale --yes deletes the pipeline entry; history preserved', () => {
    const workflow = {
      id: ID_D,
      site: 'main',
      slug: 'gone',
      contentKind: 'longform',
      state: 'in-review',
      currentVersion: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const pipelineFile = `.deskwork/review-journal/pipeline/2025-01-01T00-00-00-000Z-${ID_D}.json`;
    writeRaw(pipelineFile, JSON.stringify(workflow, null, 2));

    expect(existsSync(join(project, pipelineFile))).toBe(true);

    const fix = run('doctor', [project, '--fix=workflow-stale', '--yes']);
    expect(fix.code).toBe(0);
    expect(fix.stdout).toMatch(/applied/);

    // Pipeline file gone.
    expect(existsSync(join(project, pipelineFile))).toBe(false);

    // Re-audit clean.
    const reaudit = run('doctor', [project]);
    expect(reaudit.code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calendar-uuid-missing
// ---------------------------------------------------------------------------

describe('deskwork doctor — calendar-uuid-missing', () => {
  it('reports rows missing UUIDs on disk', () => {
    // Hand-craft a calendar with a row that has no UUID column.
    const calendarPath = join(project, 'docs/calendar.md');
    writeFileSync(
      calendarPath,
      [
        '# Editorial Calendar',
        '',
        '## Ideas',
        '',
        '| Slug | Title | Description | Keywords | Source |',
        '|------|-------|-------------|----------|--------|',
        '| no-uuid | No UUID | desc | | manual |',
        '',
        '## Planned',
        '',
        '*No entries.*',
        '',
        '## Outlining',
        '',
        '*No entries.*',
        '',
        '## Drafting',
        '',
        '*No entries.*',
        '',
        '## Review',
        '',
        '*No entries.*',
        '',
        '## Paused',
        '',
        '*No entries.*',
        '',
        '## Published',
        '',
        '*No entries.*',
        '',
        '## Distribution',
        '',
        '*No entries.*',
        '',
      ].join('\n'),
      'utf-8',
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/calendar-uuid-missing/);
  });

  it('--fix=calendar-uuid-missing --yes flushes UUIDs to disk', () => {
    const calendarPath = join(project, 'docs/calendar.md');
    writeFileSync(
      calendarPath,
      [
        '# Editorial Calendar',
        '',
        '## Ideas',
        '',
        '| Slug | Title | Description | Keywords | Source |',
        '|------|-------|-------------|----------|--------|',
        '| flushable | Flushable | desc | | manual |',
        '',
        '## Planned',
        '',
        '*No entries.*',
        '',
        '## Outlining',
        '',
        '*No entries.*',
        '',
        '## Drafting',
        '',
        '*No entries.*',
        '',
        '## Review',
        '',
        '*No entries.*',
        '',
        '## Paused',
        '',
        '*No entries.*',
        '',
        '## Published',
        '',
        '*No entries.*',
        '',
        '## Distribution',
        '',
        '*No entries.*',
        '',
      ].join('\n'),
      'utf-8',
    );

    const fix = run('doctor', [project, '--fix=calendar-uuid-missing', '--yes']);
    expect(fix.code).toBe(0);
    expect(fix.stdout).toMatch(/applied/);

    // Re-read the calendar from disk; the row should now have a UUID.
    const reread = readCalendarFile();
    const entry = reread.entries.find((e) => e.slug === 'flushable');
    expect(entry).toBeDefined();
    expect(entry?.id).toBeDefined();
    expect(entry?.id?.length).toBeGreaterThan(0);

    // Re-audit just this rule — the now-bound calendar still has no
    // frontmatter file for the row, which is a separate rule's
    // concern (missing-frontmatter-id), so a global re-audit would
    // still report. Scope to this rule for the clean assertion.
    const reaudit = run('doctor', [project, '--json']);
    const reauditJson = reaudit.json as { findings: Array<{ ruleId: string }> };
    const uuidFindings = reauditJson.findings.filter(
      (f) => f.ruleId === 'calendar-uuid-missing',
    );
    expect(uuidFindings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CLI flag handling
// ---------------------------------------------------------------------------

describe('deskwork doctor — flag handling', () => {
  it('rejects an unknown --fix rule with a usage error', () => {
    const res = run('doctor', [project, '--fix=bogus-rule']);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Unknown doctor rule/);
  });

  it('rejects an unknown --site with a usage error', () => {
    const res = run('doctor', [project, '--site', 'nope']);
    expect(res.code).toBe(2);
    expect(res.stderr).toMatch(/Unknown --site|Configured sites/);
  });

  it('respects --site in audit-only mode', () => {
    const res = run('doctor', [project, '--site', 'main', '--json']);
    expect(res.code).toBe(0);
    const out = res.json as { sites?: string[] };
    expect(out.sites).toEqual(['main']);
  });

  it('--fix=all is accepted', () => {
    // No findings, so this is just a flag-acceptance test.
    const res = run('doctor', [project, '--fix=all', '--yes']);
    expect(res.code).toBe(0);
  });
});
