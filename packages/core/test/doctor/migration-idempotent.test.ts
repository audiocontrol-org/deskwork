/**
 * Phase 39b — sites-to-lanes migration idempotency.
 *
 * After a first `--fix` has dropped `sites`, created the lanes, and
 * backfilled every entry's artifactPath, a SECOND `--fix` must be a
 * no-op: no lane re-creation, no sidecar re-stamp, no finding.
 *
 * The rule's source of truth for legacy sites is the on-disk config
 * read through the migration-only tolerant reader (`legacy-config.ts`),
 * NOT `ctx.config` — so once the `sites` block is dropped from disk the
 * second run sees nothing to migrate. Idempotency is exercised by
 * running the rule directly twice against the same project root.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sitesToLanesMigration from '@/doctor/rules/sites-to-lanes-migration';
import { yesInteraction } from '@/doctor/runner';
import { readSidecar } from '@/sidecar/read';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';
import type { DoctorContext } from '@/doctor/types';
import type { DeskworkConfig } from '@/config';

function entry(uuid: string, slug: string): Entry {
  return {
    uuid,
    slug,
    title: slug,
    keywords: [],
    source: 'manual',
    currentStage: 'Drafting',
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
  };
}

const CONFIG: DeskworkConfig = {
  version: 1,
  sites: {
    blog: {
      contentDir: 'src/content/blog',
      calendarPath: '.deskwork/calendar.md',
      host: 'blog.example.com',
    },
  },
  defaultSite: 'blog',
};

function ctxFor(root: string): DoctorContext {
  return {
    projectRoot: root,
    config: CONFIG,
    site: 'blog',
    calendar: { entries: [], distributions: [] },
    index: { byId: new Map(), byPath: new Map(), invalid: [] },
    workflows: [],
    interaction: yesInteraction,
  };
}

/** Run the rule's full audit→plan→apply cycle once. Returns applied count. */
async function runRuleOnce(ctx: DoctorContext): Promise<{ findings: number; applied: number }> {
  const findings = await sitesToLanesMigration.audit(ctx);
  let applied = 0;
  for (const finding of findings) {
    const plan = await sitesToLanesMigration.plan(ctx, finding);
    if (plan.kind === 'apply') {
      const result = await sitesToLanesMigration.apply(ctx, plan);
      if (result.applied) applied++;
    }
  }
  return { findings: findings.length, applied };
}

describe('sites-to-lanes migration idempotency', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dw-s2l-idem-'));
    await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
    await writeFile(join(root, '.deskwork', 'config.json'), JSON.stringify(CONFIG));
    await mkdir(join(root, 'src', 'content', 'blog', 'one-post'), { recursive: true });
    await writeFile(join(root, 'src', 'content', 'blog', 'one-post', 'index.md'), '# One');
    await writeSidecar(root, entry('11111111-1111-4111-8111-111111111111', 'one-post'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('second --fix is a no-op', async () => {
    const first = await runRuleOnce(ctxFor(root));
    expect(first.applied).toBeGreaterThan(0);

    // Sites dropped from disk.
    const afterCfg = JSON.parse(await readFile(join(root, '.deskwork', 'config.json'), 'utf8'));
    expect(afterCfg.sites).toBeUndefined();

    // Entry backfilled.
    const stamped = await readSidecar(root, '11111111-1111-4111-8111-111111111111');
    expect(stamped.artifactPath).toBe('src/content/blog/one-post/index.md');

    // Second run: no finding (sites gone, every entry has artifactPath).
    const second = await runRuleOnce(ctxFor(root));
    expect(second.findings).toBe(0);
    expect(second.applied).toBe(0);
  });
});
