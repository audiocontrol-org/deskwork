// T016 (RED-first, 027 Phase 5 US3) — FR-016 / CHK023: the governed ROADMAP.md
// header is HONEST about how to mutate the graph. It must not trap an agent
// between "do not hand-edit" and "no verb exists": it names the available
// mutation verbs, shows a worked `cluster` example, and states the explicit
// hand-edit-then-`roadmap order` fallback for an edit that has no verb yet.
//
// The header is the generated `ROADMAP_SKELETON` (src/setup/scaffold.ts) that
// `stackctl setup` writes and the read path auto-scaffolds — the canonical
// shipped header every installation inherits.
//
// RED until T017 rewrites the skeleton from the bare
// "manage with stackctl roadmap — do not hand-edit" to the honest-interim form.

import { describe, it, expect } from 'vitest';
import { ROADMAP_SKELETON } from '../../src/setup/scaffold.js';

describe('027 T016 — the governed ROADMAP header is honest about mutation (FR-016)', () => {
  it('does NOT ship the bare do-not-hand-edit trap', () => {
    // The dishonest form told the agent "do not hand-edit" while giving it no
    // verb for several mutations — the exact trap US3 removes.
    expect(ROADMAP_SKELETON).not.toMatch(/do not hand-edit/i);
  });

  it('names the mutation verbs (incl. cluster/group)', () => {
    for (const verb of ['add', 'advance', 'reclassify', 'defer', 'cluster']) {
      expect(ROADMAP_SKELETON).toContain(verb);
    }
  });

  it('includes a worked `roadmap cluster` example', () => {
    // A concrete, copy-pasteable cluster invocation — not just the verb name.
    expect(ROADMAP_SKELETON).toMatch(/roadmap cluster .*--children/);
  });

  it('states the hand-edit-then-`roadmap order` fallback for a verb-less edit', () => {
    // The honest interim escape hatch: when no verb exists, edit then revalidate.
    expect(ROADMAP_SKELETON).toMatch(/roadmap order/);
    expect(ROADMAP_SKELETON).toMatch(/edit|hand-edit/i);
  });
});
