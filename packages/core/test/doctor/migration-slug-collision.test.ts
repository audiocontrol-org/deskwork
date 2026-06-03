/**
 * Phase 39b — migration ambiguity-halt (AUDIT-20260602-03 guard).
 *
 * The slug+stage backfill heuristic is the SAME search that causes the
 * #394 multi-site false-positive: a slug present under more than one
 * legacy `site.contentDir` resolves to more than one candidate file.
 * The migration MUST NOT silently stamp one of them — that would
 * launder a known-ambiguous guess into permanent, trusted
 * `artifactPath` data and make the bug undetectable afterward.
 *
 * This test is the operator-reproducible assertion of the halt:
 *   - a slug exists under TWO site contentDirs (the collision);
 *   - the colliding entry emits a `migration-ambiguous` finding naming
 *     BOTH candidate paths and its sidecar is NOT stamped;
 *   - an unambiguous sibling (slug under exactly one contentDir) IS
 *     stamped normally.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
    docs: {
      contentDir: 'docs',
      calendarPath: '.deskwork/calendar.md',
      host: 'docs.example.com',
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

const COLLIDING = '11111111-1111-4111-8111-111111111111';
const UNAMBIGUOUS = '22222222-2222-4222-8222-222222222222';

describe('sites-to-lanes migration ambiguity-halt (AUDIT-20260602-03)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dw-s2l-collide-'));
    await mkdir(join(root, '.deskwork', 'entries'), { recursive: true });
    await writeFile(join(root, '.deskwork', 'config.json'), JSON.stringify(CONFIG));

    // The colliding slug `shared` exists under BOTH contentDirs.
    await mkdir(join(root, 'src', 'content', 'blog', 'shared'), { recursive: true });
    await writeFile(join(root, 'src', 'content', 'blog', 'shared', 'index.md'), '# blog shared');
    await mkdir(join(root, 'docs', 'shared'), { recursive: true });
    await writeFile(join(root, 'docs', 'shared', 'index.md'), '# docs shared');

    // The unambiguous sibling `only-here` exists under exactly one.
    await mkdir(join(root, 'docs', 'only-here'), { recursive: true });
    await writeFile(join(root, 'docs', 'only-here', 'index.md'), '# only here');

    await writeSidecar(root, entry(COLLIDING, 'shared'));
    await writeSidecar(root, entry(UNAMBIGUOUS, 'only-here'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('emits migration-ambiguous for the colliding entry, leaves it unstamped, stamps the sibling', async () => {
    const ctx = ctxFor(root);
    const findings = await sitesToLanesMigration.audit(ctx);

    // The collision is surfaced as a distinct migration-ambiguous finding.
    const ambiguous = findings.filter((f) => f.ruleId === 'migration-ambiguous');
    expect(ambiguous).toHaveLength(1);
    const detail = ambiguous[0];
    expect(String(detail.details.entryUuid)).toBe(COLLIDING);
    const candidates = detail.details.candidates;
    expect(Array.isArray(candidates)).toBe(true);
    const candidateList = candidates as string[];
    expect(candidateList).toContain('src/content/blog/shared/index.md');
    expect(candidateList).toContain('docs/shared/index.md');

    // Apply every plan (the runner would do this).
    for (const finding of findings) {
      const plan = await sitesToLanesMigration.plan(ctx, finding);
      if (plan.kind === 'apply') {
        await sitesToLanesMigration.apply(ctx, plan);
      }
    }

    // The colliding entry is NOT stamped — the guess was refused.
    const collided = await readSidecar(root, COLLIDING);
    expect(collided.artifactPath).toBeUndefined();

    // The unambiguous sibling IS stamped.
    const sibling = await readSidecar(root, UNAMBIGUOUS);
    expect(sibling.artifactPath).toBe('docs/only-here/index.md');
  });
});
