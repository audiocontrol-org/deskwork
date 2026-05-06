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

/**
 * Mirror of `addEntry`'s slugify so test fixtures can predict the slug
 * `run('add', [..., title])` will mint without parsing stdout.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * `run('add', ...)` plus the entry-centric scaffolds needed for doctor
 * to pass on a freshly-minted Ideas-stage sidecar (#184): a stubbed
 * `docs/<slug>/scrapbook/idea.md` (satisfies `file-presence`) and an
 * `artifactPath` written into the sidecar (satisfies `missing-artifact-path`).
 *
 * Tests in this file exercise legacy validators (missing-frontmatter-id,
 * legacy-top-level-id-migration, the exit-code matrix); both Phase 30
 * entry-centric validators are orthogonal to those concerns and these
 * stubs keep them quiet. Tests that DO want to exercise the entry-centric
 * validators call `run('add', ...)` directly.
 */
function addWithIdeaStub(args: string[]): RunResult {
  const result = run('add', args);
  // Title is always args[1] (after the project root); none of these tests
  // pass --slug, so slug derives from the title.
  const slug = slugify(args[1]);
  // Post-T1 (Issue #222): the sidecar's artifactPath is index.md. The
  // stub also creates a scrapbook/idea.md so legacy file-presence
  // assumptions still pass — the legacy file is now a (synthetic)
  // scrapbook snapshot, not the entry's primary file.
  const ideaRelPath = join('docs', slug, 'scrapbook', 'idea.md');
  writeRaw(ideaRelPath, '---\nstub: true\n---\n');
  const indexRelPath = join('docs', slug, 'index.md');
  writeRaw(indexRelPath, '---\nstub: true\n---\n');
  // Find the freshly-minted sidecar by reading the calendar to get the
  // entry's UUID, then patch its artifactPath. The sidecar already
  // exists post-`add` (#184).
  const cal = readCalendarFile();
  const entry = cal.entries.find((e) => e.slug === slug);
  if (!entry || !entry.id) {
    throw new Error(`addWithIdeaStub: no calendar entry for slug "${slug}"`);
  }
  const sidecarPath = join(project, '.deskwork', 'entries', `${entry.id}.json`);
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8')) as Record<
    string,
    unknown
  >;
  sidecar.artifactPath = indexRelPath;
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8');
  return result;
}

function readCalendarFile() {
  const raw = readFileSync(join(project, 'docs/calendar.md'), 'utf-8');
  return parseCalendar(raw);
}

function frontmatterOf(rel: string): Record<string, unknown> {
  const raw = readFileSync(join(project, 'src/content', rel), 'utf-8');
  return parseFrontmatter(raw).data;
}

/**
 * Read the canonical deskwork-namespaced id from a fixture file's
 * frontmatter (Issue #38). Returns undefined when the file has no
 * deskwork block or the id field within is missing.
 */
function deskworkIdOf(rel: string): string | undefined {
  const data = frontmatterOf(rel);
  const block = data.deskwork;
  if (block === undefined || block === null) return undefined;
  if (typeof block !== 'object' || Array.isArray(block)) return undefined;
  const id = (block as Record<string, unknown>).id;
  return typeof id === 'string' ? id : undefined;
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
    addWithIdeaStub([project, 'My Post']);
    writeContent(
      'my-post/index.md',
      '---\ntitle: My Post\n---\n\n# My Post\n',
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/missing-frontmatter-id/);
  });

  it('--fix=missing-frontmatter-id --yes binds the id when there is exactly one candidate', () => {
    addWithIdeaStub([project, 'Single Candidate']);
    writeContent(
      'single-candidate/index.md',
      '---\ntitle: Single Candidate\n---\n\n# Single\n',
    );

    const fix = run('doctor', [project, '--fix=missing-frontmatter-id', '--yes']);
    expect(fix.code).toBe(0);
    expect(fix.stdout).toMatch(/applied/);

    // File now carries the calendar's id under `deskwork.id` (Issue #38).
    const cal = readCalendarFile();
    const entry = cal.entries.find((e) => e.slug === 'single-candidate');
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(deskworkIdOf('single-candidate/index.md')).toBe(entry.id);
    // Top-level `id:` MUST NOT have been written — that keyspace is
    // the operator's, not deskwork's.
    expect(frontmatterOf('single-candidate/index.md').id).toBeUndefined();

    // Re-audit: no findings.
    const reaudit = run('doctor', [project]);
    expect(reaudit.code).toBe(0);
  });

  it('--fix=... --yes skips when multiple candidates exist (ambiguous)', () => {
    addWithIdeaStub([project, 'Ambiguous']);
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

    // Neither file got a deskwork.id written.
    expect(deskworkIdOf('ambiguous/index.md')).toBeUndefined();
    expect(deskworkIdOf('other/duplicate-title.md')).toBeUndefined();
  });

  it('reports zero candidates explicitly when no matching file exists, exits 0 (Issue #44 — prerequisite-missing is not a real follow-up)', () => {
    addWithIdeaStub([project, 'Detached Entry']);
    // No file at all under contentDir. (The stub idea.md lives outside
    // contentDir so missing-frontmatter-id still finds zero candidates.)

    const fix = run('doctor', [project, '--fix=missing-frontmatter-id', '--yes']);
    // Issue #44: prerequisite-missing skips do not warrant exit 1 in
    // --fix mode — there's nothing for doctor to do until the operator
    // runs /deskwork:outline. The skip is informational, not blocking.
    expect(fix.code).toBe(0);
    expect(fix.stdout).toMatch(/no candidate file/);
    expect(fix.stdout).toMatch(/prerequisite-missing/);
  });
});

// ---------------------------------------------------------------------------
// orphan-frontmatter-id
// ---------------------------------------------------------------------------

describe('deskwork doctor — orphan-frontmatter-id', () => {
  it('reports a file whose id has no calendar match', () => {
    // Issue #38: deskwork's binding lives at deskwork.id, not top-level.
    writeContent(
      'orphan/index.md',
      `---\ndeskwork:\n  id: ${ID_A}\ntitle: Orphan\n---\n\n# Orphan\n`,
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/orphan-frontmatter-id/);
  });

  it('--fix --yes leaves orphans alone (safe default)', () => {
    writeContent(
      'orphan/index.md',
      `---\ndeskwork:\n  id: ${ID_A}\ntitle: Orphan\n---\n\n# Orphan\n`,
    );

    const fix = run('doctor', [project, '--fix=orphan-frontmatter-id', '--yes']);
    // --yes can't safely choose between leaving alone vs clearing the id;
    // it skips, exit 1.
    expect(fix.code).toBe(1);
    expect(fix.stdout).toMatch(/skipped/i);

    // Frontmatter unchanged.
    expect(deskworkIdOf('orphan/index.md')).toBe(ID_A);
  });
});

// ---------------------------------------------------------------------------
// duplicate-id
// ---------------------------------------------------------------------------

describe('deskwork doctor — duplicate-id', () => {
  it('reports two files sharing the same frontmatter id', () => {
    // Issue #38: deskwork-namespaced binding.
    writeContent(
      'a/index.md',
      `---\ndeskwork:\n  id: ${ID_A}\ntitle: First\n---\n\n# A\n`,
    );
    writeContent(
      'b/index.md',
      `---\ndeskwork:\n  id: ${ID_A}\ntitle: Second\n---\n\n# B\n`,
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/duplicate-id/);
  });

  it('--fix --yes skips duplicates (operator must pick the canonical file)', () => {
    writeContent(
      'a/index.md',
      `---\ndeskwork:\n  id: ${ID_A}\ntitle: First\n---\n\n# A\n`,
    );
    writeContent(
      'b/index.md',
      `---\ndeskwork:\n  id: ${ID_A}\ntitle: Second\n---\n\n# B\n`,
    );

    const fix = run('doctor', [project, '--fix=duplicate-id', '--yes']);
    expect(fix.code).toBe(1);
    expect(fix.stdout).toMatch(/skipped/i);

    // Both files still have the id.
    expect(deskworkIdOf('a/index.md')).toBe(ID_A);
    expect(deskworkIdOf('b/index.md')).toBe(ID_A);
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
// legacy-top-level-id-migration (Issue #38)
// ---------------------------------------------------------------------------

describe('deskwork doctor — legacy-top-level-id-migration', () => {
  it('reports a file whose top-level id is a calendar UUID and has no deskwork.id', () => {
    // Add a calendar entry, then create a file with the legacy v0.7.0/v0.7.1
    // shape: top-level `id:` matching the calendar UUID, no deskwork block.
    addWithIdeaStub([project, 'Legacy Post']);
    const cal = readCalendarFile();
    const entry = cal.entries.find((e) => e.slug === 'legacy-post');
    expect(entry).toBeDefined();
    if (!entry) return;
    writeContent(
      'legacy-post/index.md',
      `---\nid: ${entry.id}\ntitle: Legacy Post\n---\n\n# Legacy\n`,
    );

    const audit = run('doctor', [project]);
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/legacy-top-level-id-migration/);
  });

  it('--fix --yes migrates the id to deskwork.id and removes the top-level field', () => {
    addWithIdeaStub([project, 'Migrate Me']);
    const cal = readCalendarFile();
    const entry = cal.entries.find((e) => e.slug === 'migrate-me');
    expect(entry).toBeDefined();
    if (!entry) return;
    writeContent(
      'migrate-me/index.md',
      `---\nid: ${entry.id}\ntitle: Migrate Me\ndatePublished: "2020-10-01"\n---\n\n# M\n`,
    );

    const fix = run('doctor', [
      project,
      '--fix=legacy-top-level-id-migration',
      '--yes',
    ]);
    expect(fix.code).toBe(0);
    expect(fix.stdout).toMatch(/applied/);

    // Top-level `id:` is gone; `deskwork.id` is populated with the same UUID.
    const fm = frontmatterOf('migrate-me/index.md');
    expect(fm.id).toBeUndefined();
    expect(deskworkIdOf('migrate-me/index.md')).toBe(entry.id);

    // Round-trip preservation: the unrelated double-quoted ISO date is
    // still double-quoted on disk after the migration write.
    const raw = readFileSync(
      join(project, 'src/content', 'migrate-me/index.md'),
      'utf-8',
    );
    expect(raw).toContain('datePublished: "2020-10-01"');
  });

  it('is idempotent — second run finds nothing to migrate', () => {
    addWithIdeaStub([project, 'Already Migrated']);
    const cal = readCalendarFile();
    const entry = cal.entries.find((e) => e.slug === 'already-migrated');
    expect(entry).toBeDefined();
    if (!entry) return;
    writeContent(
      'already-migrated/index.md',
      `---\nid: ${entry.id}\ntitle: Already\n---\n\n# A\n`,
    );

    // First migration.
    run('doctor', [project, '--fix=legacy-top-level-id-migration', '--yes']);
    // Second run on the post-migration state.
    const second = run('doctor', [
      project,
      '--fix=legacy-top-level-id-migration',
      '--yes',
      '--json',
    ]);
    const out = second.json as {
      findings: Array<{ ruleId: string }>;
      repairs: unknown[];
    };
    const migrationFindings = out.findings.filter(
      (f) => f.ruleId === 'legacy-top-level-id-migration',
    );
    expect(migrationFindings).toEqual([]);
    expect(out.repairs).toEqual([]);
  });

  it('leaves alone files whose top-level `id:` is not a calendar UUID', () => {
    // Operator's keyspace — not deskwork's. We must not migrate or
    // touch this.
    writeContent(
      'operator-id/index.md',
      `---\nid: not-a-uuid\ntitle: Operator's id\n---\n\n# Op\n`,
    );

    const fix = run('doctor', [
      project,
      '--fix=legacy-top-level-id-migration',
      '--yes',
      '--json',
    ]);
    const out = fix.json as { findings: Array<{ ruleId: string }> };
    const migrationFindings = out.findings.filter(
      (f) => f.ruleId === 'legacy-top-level-id-migration',
    );
    expect(migrationFindings).toEqual([]);

    // File untouched.
    const fm = frontmatterOf('operator-id/index.md');
    expect(fm.id).toBe('not-a-uuid');
  });

  it('--fix=all migrates legacy ids in the same run', () => {
    // Verify the rule is in the all-set (acceptance criterion).
    addWithIdeaStub([project, 'All Mode']);
    const cal = readCalendarFile();
    const entry = cal.entries.find((e) => e.slug === 'all-mode');
    expect(entry).toBeDefined();
    if (!entry) return;
    writeContent(
      'all-mode/index.md',
      `---\nid: ${entry.id}\ntitle: All Mode\n---\n\n# A\n`,
    );

    const fix = run('doctor', [project, '--fix=all', '--yes']);
    // The repair pipeline applies. After the run, the file should
    // carry deskwork.id and no top-level id.
    expect(fix.stdout).toMatch(/applied/);
    expect(deskworkIdOf('all-mode/index.md')).toBe(entry.id);
    expect(frontmatterOf('all-mode/index.md').id).toBeUndefined();
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

// ---------------------------------------------------------------------------
// Issue #44 — exit-code matrix for `--fix` mode
// ---------------------------------------------------------------------------

describe('deskwork doctor — exit-code matrix (Issue #44)', () => {
  it('audit on findings: exit 1 (unchanged)', () => {
    addWithIdeaStub([project, 'Audit Findings']);
    writeContent(
      'audit-findings/index.md',
      '---\ntitle: Audit Findings\n---\n\n# A\n',
    );
    const res = run('doctor', [project]);
    expect(res.code).toBe(1);
  });

  it('audit on clean tree: exit 0 (unchanged)', () => {
    const res = run('doctor', [project]);
    expect(res.code).toBe(0);
  });

  it('--fix with all-applied: exit 0', () => {
    addWithIdeaStub([project, 'All Applied']);
    writeContent(
      'all-applied/index.md',
      '---\ntitle: All Applied\n---\n\n# AA\n',
    );
    const res = run('doctor', [
      project,
      '--fix=missing-frontmatter-id',
      '--yes',
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/applied/);
  });

  it('--fix with all-skipped-prerequisite: exit 0 (NEW behavior)', () => {
    // Calendar entry with no body file → prerequisite-missing → exit 0.
    addWithIdeaStub([project, 'Skip Pre One']);
    addWithIdeaStub([project, 'Skip Pre Two']);
    const res = run('doctor', [
      project,
      '--fix=missing-frontmatter-id',
      '--yes',
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/prerequisite-missing/);
  });

  it('--fix with mixed applied + prerequisite-skipped: exit 0 (NEW behavior)', () => {
    // One entry has a body file (will be applied); one doesn't (will
    // be skipped as prerequisite-missing). Mixed run still exits 0.
    addWithIdeaStub([project, 'Has Body']);
    writeContent(
      'has-body/index.md',
      '---\ntitle: Has Body\n---\n\n# B\n',
    );
    addWithIdeaStub([project, 'No Body']);
    const res = run('doctor', [
      project,
      '--fix=missing-frontmatter-id',
      '--yes',
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/applied/);
    expect(res.stdout).toMatch(/prerequisite-missing/);
  });

  it('--fix with ambiguous case: exit 1 (operator must resolve)', () => {
    // Two candidate files for the same entry → ambiguous → exit 1.
    addWithIdeaStub([project, 'Ambiguous Case']);
    writeContent(
      'ambiguous-case/index.md',
      '---\ntitle: Ambiguous Case\n---\n\n# A\n',
    );
    writeContent(
      'other/dup.md',
      '---\ntitle: Ambiguous Case\n---\n\n# B\n',
    );
    const res = run('doctor', [
      project,
      '--fix=missing-frontmatter-id',
      '--yes',
    ]);
    expect(res.code).toBe(1);
    expect(res.stdout).toMatch(/ambiguous/);
  });

  it('--fix=schema-rejected --yes: exit 0 (passive rule, no findings)', () => {
    // schema-rejected emits no findings in audit, so there's nothing
    // to skip — clean exit. The skipReason machinery only triggers on
    // active findings.
    const res = run('doctor', [
      project,
      '--fix=schema-rejected',
      '--yes',
    ]);
    expect(res.code).toBe(0);
  });

  it('--fix=slug-collision --yes: exit 1 (editorial-decision)', () => {
    const calendarPath = join(project, 'docs/calendar.md');
    const calendar = parseCalendar(readFileSync(calendarPath, 'utf-8'));
    calendar.entries.push(
      {
        id: '99999999-9999-4999-8999-999999999991',
        slug: 'collide-x',
        title: 'X',
        description: '',
        stage: 'Ideas',
        targetKeywords: [],
        source: 'manual',
      },
      {
        id: '99999999-9999-4999-8999-999999999992',
        slug: 'collide-x',
        title: 'Y',
        description: '',
        stage: 'Ideas',
        targetKeywords: [],
        source: 'manual',
      },
    );
    writeCalendar(calendarPath, calendar);
    const res = run('doctor', [project, '--fix=slug-collision', '--yes']);
    expect(res.code).toBe(1);
    expect(res.stdout).toMatch(/editorial-decision/);
  });

  it('JSON output includes skipReason field (Issue #44)', () => {
    addWithIdeaStub([project, 'For Json']);
    const res = run('doctor', [
      project,
      '--fix=missing-frontmatter-id',
      '--yes',
      '--json',
    ]);
    expect(res.code).toBe(0);
    const out = res.json as {
      repairs: Array<{ skipReason?: string; ruleId: string }>;
    };
    expect(out.repairs.length).toBeGreaterThan(0);
    const r = out.repairs.find((x) => x.ruleId === 'missing-frontmatter-id');
    expect(r).toBeDefined();
    expect(r?.skipReason).toBe('prerequisite-missing');
  });

  it('grouped output prints applied/skipped subgroups (Issue #44)', () => {
    addWithIdeaStub([project, 'Grouped Applied']);
    writeContent(
      'grouped-applied/index.md',
      '---\ntitle: Grouped Applied\n---\n\n# G\n',
    );
    addWithIdeaStub([project, 'Grouped Skipped']);
    const res = run('doctor', [
      project,
      '--fix=missing-frontmatter-id',
      '--yes',
    ]);
    expect(res.code).toBe(0);
    // The grouped output format puts the rule name on its own
    // header line followed by indented `applied:` / `skipped (...):`
    // bullet lists.
    expect(res.stdout).toMatch(/missing-frontmatter-id: \d+ applied, \d+ skipped/);
    expect(res.stdout).toMatch(/applied:/);
    expect(res.stdout).toMatch(/skipped \(prerequisite-missing\):/);
  });
});
