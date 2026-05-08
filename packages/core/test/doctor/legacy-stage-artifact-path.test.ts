/**
 * Tests for the `legacy-stage-artifact-path` doctor rule (Issue #222 /
 * T1 migration).
 *
 * Audit detects sidecars whose `artifactPath` points at a legacy
 * `<dir>/scrapbook/<stage>.md` file. Apply migrates by copying the
 * legacy file's content to `<dir>/index.md` and updating the sidecar's
 * `artifactPath`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  rm,
  mkdir,
  readFile,
  writeFile,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAudit, runRepair, yesInteraction } from '@/doctor/runner';
import { renderEmptyCalendar } from '@/calendar';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import type { Entry } from '@/schema/entry';
import type { DeskworkConfig } from '@/config';

const RULE_ID = 'legacy-stage-artifact-path';

const baseEntry: Omit<Entry, 'uuid' | 'slug' | 'artifactPath'> = {
  title: 'Legacy doc',
  keywords: [],
  source: 'manual',
  currentStage: 'Outlining',
  iterationByStage: {},
  createdAt: '2026-04-30T10:00:00.000Z',
  updatedAt: '2026-04-30T10:00:00.000Z',
};

async function setupFixture(): Promise<{
  root: string;
  config: DeskworkConfig;
}> {
  const root = await mkdtemp(join(tmpdir(), 'dw-legacy-stage-test-'));
  await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
  await writeFile(join(root, '.deskwork', 'calendar.md'), renderEmptyCalendar());
  const config: DeskworkConfig = {
    version: 1,
    sites: {
      main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'main',
  };
  return { root, config };
}

describe('doctor: legacy-stage-artifact-path', () => {
  let root: string;
  let config: DeskworkConfig;

  beforeEach(async () => {
    const f = await setupFixture();
    root = f.root;
    config = f.config;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('flags an entry whose artifactPath ends with /scrapbook/outline.md', async () => {
    const entry: Entry = {
      ...baseEntry,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      slug: 'a',
      artifactPath: 'docs/a/scrapbook/outline.md',
    };
    await writeSidecar(root, entry);
    await mkdir(join(root, 'docs', 'a', 'scrapbook'), { recursive: true });
    await writeFile(join(root, 'docs', 'a', 'scrapbook', 'outline.md'), '# outline body\n');

    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    expect(findings[0].details.legacyPath).toBe('docs/a/scrapbook/outline.md');
    expect(findings[0].details.nextPath).toBe('docs/a/index.md');
  });

  it('does not flag entries whose artifactPath is already index.md', async () => {
    const entry: Entry = {
      ...baseEntry,
      uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      slug: 'b',
      artifactPath: 'docs/b/index.md',
    };
    await writeSidecar(root, entry);

    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(0);
  });

  it('flags every legacy leaf (idea, plan, outline, drafting)', async () => {
    const cases: Array<{ uuid: string; slug: string; leaf: string }> = [
      { uuid: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', slug: 'c1', leaf: 'idea.md' },
      { uuid: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', slug: 'c2', leaf: 'plan.md' },
      { uuid: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', slug: 'c3', leaf: 'outline.md' },
      { uuid: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4', slug: 'c4', leaf: 'drafting.md' },
    ];
    for (const c of cases) {
      const e: Entry = {
        ...baseEntry,
        uuid: c.uuid,
        slug: c.slug,
        artifactPath: `docs/${c.slug}/scrapbook/${c.leaf}`,
      };
      await writeSidecar(root, e);
    }

    const report = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(4);
  });

  it('apply migrates the file content and updates the sidecar artifactPath', async () => {
    const entry: Entry = {
      ...baseEntry,
      uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      slug: 'mig',
      artifactPath: 'docs/mig/scrapbook/outline.md',
    };
    await writeSidecar(root, entry);
    await mkdir(join(root, 'docs', 'mig', 'scrapbook'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'mig', 'scrapbook', 'outline.md'),
      '# legacy outline body\n',
    );

    const report = await runRepair({ projectRoot: root, config }, yesInteraction);
    const repair = report.repairs.find((r) => r.finding.ruleId === RULE_ID);
    expect(repair?.applied).toBe(true);

    // index.md now exists with the legacy content.
    const indexBody = await readFile(join(root, 'docs', 'mig', 'index.md'), 'utf8');
    expect(indexBody).toContain('legacy outline body');

    // Legacy file is preserved (it's now a snapshot).
    const legacyStill = await readFile(
      join(root, 'docs', 'mig', 'scrapbook', 'outline.md'),
      'utf8',
    );
    expect(legacyStill).toContain('legacy outline body');

    // Sidecar's artifactPath was updated.
    const sidecar = await readSidecar(root, entry.uuid);
    expect(sidecar.artifactPath).toBe('docs/mig/index.md');
  });

  it('apply is idempotent — second run after migration finds nothing', async () => {
    const entry: Entry = {
      ...baseEntry,
      uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      slug: 'idem',
      artifactPath: 'docs/idem/scrapbook/outline.md',
    };
    await writeSidecar(root, entry);
    await mkdir(join(root, 'docs', 'idem', 'scrapbook'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'idem', 'scrapbook', 'outline.md'),
      '# body\n',
    );

    await runRepair({ projectRoot: root, config }, yesInteraction);

    const report2 = await runAudit({ projectRoot: root, config }, yesInteraction);
    const findings = report2.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(0);
  });

  it('apply skips the copy when index.md already matches the legacy content', async () => {
    const entry: Entry = {
      ...baseEntry,
      uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      slug: 'parallel',
      artifactPath: 'docs/parallel/scrapbook/outline.md',
    };
    await writeSidecar(root, entry);
    await mkdir(join(root, 'docs', 'parallel', 'scrapbook'), { recursive: true });
    const body = '# both copies match\n';
    await writeFile(join(root, 'docs', 'parallel', 'scrapbook', 'outline.md'), body);
    await writeFile(join(root, 'docs', 'parallel', 'index.md'), body);

    const report = await runRepair({ projectRoot: root, config }, yesInteraction);
    const repair = report.repairs.find((r) => r.finding.ruleId === RULE_ID);
    expect(repair?.applied).toBe(true);

    // No .tmp residue from the atomic-write path (we never entered it).
    await expect(
      stat(join(root, 'docs', 'parallel', `index.md.${process.pid}.tmp`)),
    ).rejects.toThrow();
  });

  it('apply refuses (apply-failed) when index.md exists with conflicting content', async () => {
    const entry: Entry = {
      ...baseEntry,
      uuid: '11111111-2222-4333-8444-555555555555',
      slug: 'conflict',
      artifactPath: 'docs/conflict/scrapbook/outline.md',
    };
    await writeSidecar(root, entry);
    await mkdir(join(root, 'docs', 'conflict', 'scrapbook'), { recursive: true });
    await writeFile(
      join(root, 'docs', 'conflict', 'scrapbook', 'outline.md'),
      '# legacy body\n',
    );
    await writeFile(
      join(root, 'docs', 'conflict', 'index.md'),
      '# DIFFERENT pre-existing index body\n',
    );

    const report = await runRepair({ projectRoot: root, config }, yesInteraction);
    const repair = report.repairs.find((r) => r.finding.ruleId === RULE_ID);
    expect(repair?.applied).toBe(false);
    expect(repair?.skipReason).toBe('apply-failed');
  });
});
