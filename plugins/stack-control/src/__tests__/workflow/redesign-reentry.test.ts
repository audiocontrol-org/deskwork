// US8 (022) — a `* → designing` re-entry opens a new design-record revision
// (append-only), marks the affected downstream phase checkpoints stale, and
// preserves the existing spec dir as a revision (FR-032). RED first (T032).

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reenterDesign } from '../../workflow/redesign.js';
import {
  isCheckpointStale,
  writePhaseCheckpoint,
} from '../../govern/checkpoint-state.js';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { runCli } from '../_run-helpers.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
const ITEM = 'multi:feature/x';
const SPEC = 'specs/022-x';
const SLUG = '022-x';
const DESIGN = 'docs/superpowers/specs/x-design.md';

/** An item in `implementing` (design+spec set), with a downstream phase checkpoint. */
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture(
    [{ identifier: ITEM, status: 'in-flight', design: DESIGN, spec: SPEC, analyzeClean: true }],
    { git: true },
  );
  fixtures.push(f);
  f.write(DESIGN, '# Design record\n\n## problem-domain\noriginal content.\n');
  f.writeSpecTasks(SPEC, false);
  writePhaseCheckpoint(f.root, {
    version: 1,
    featureSlug: SLUG,
    phaseId: 'core',
    checkpoint: 'after_implement',
    auditLogSection: 'core',
    scopeFingerprint: 'fp',
    passedAt: '2026-06-16T00:00:00Z',
    governedPaths: ['src/x.ts'],
  });
  f.commitAll('seed');
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

function args(f: WorkflowFixture) {
  return {
    installationRoot: f.root,
    roadmapPath: f.roadmapPath,
    item: ITEM,
    designDoc: DESIGN,
    featureSlug: SLUG,
    hasSpec: true,
    opts: f.opts,
    at: '2026-06-16T12:00:00Z',
  };
}

describe('US8 re-design re-entry', () => {
  it('opens a NEW design-record revision rather than overwriting the prior one', () => {
    const f = fixture();
    const result = reenterDesign(args(f));
    const body = readFileSync(join(f.root, DESIGN), 'utf8');
    expect(result.revision).toBe(1);
    expect(body).toContain('original content.'); // prior content preserved
    expect(body).toContain('## Revision 1 (re-entry)'); // a new revision opened
    // a second re-entry opens revision 2 (append-only, monotonic)
    expect(reenterDesign(args(f)).revision).toBe(2);
    expect(readFileSync(join(f.root, DESIGN), 'utf8')).toContain('## Revision 2 (re-entry)');
  });

  it('marks the affected downstream phase checkpoints stale', () => {
    const f = fixture();
    expect(isCheckpointStale(f.root, SLUG, 'core')).toBe(false);
    const result = reenterDesign(args(f));
    expect(result.staledCheckpoints).toContain('core');
    expect(isCheckpointStale(f.root, SLUG, 'core')).toBe(true);
  });

  it('preserves the existing spec dir + spec: pointer (not discarded)', () => {
    const f = fixture();
    const result = reenterDesign(args(f));
    expect(result.specPreserved).toBe(true);
    expect(existsSync(join(f.root, SPEC, 'tasks.md'))).toBe(true); // spec dir preserved
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)!.spec).toBe(SPEC); // pointer intact
  });
});

describe('US8 re-design re-entry — CLI', () => {
  it('redesign --apply re-enters designing, opens a revision, and stales checkpoints', () => {
    const f = fixture();
    const r = runCli(['workflow', 'redesign', ITEM, DESIGN, '--apply'], { cwd: f.root });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('re-entered designing');
    expect(isCheckpointStale(f.root, SLUG, 'core')).toBe(true);
    expect(readFileSync(join(f.root, DESIGN), 'utf8')).toContain('## Revision 1 (re-entry)');
  });
});
