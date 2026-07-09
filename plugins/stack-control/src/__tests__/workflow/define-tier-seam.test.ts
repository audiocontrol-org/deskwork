// 035 T011 (US1) — RED: the `/stack-control:define` tasks-authoring seam wires the
// model-tier requirement into the `/speckit-tasks` drive, MIRRORING how
// `/stack-control:design` injects its single-source house-rules block (FR-002).
//
// This is a structural/content assertion over `skills/define/SKILL.md`: the seam
// (a) runs `stackctl tier-vocab` to read THIS installation's vocabulary, (b) injects
// the `renderTierRequirement(vocab)` block (src/workflow/tier-requirement.ts — the
// single source) into the tasks backend conversation, (c) states the capability-not-
// vendor stance (does NOT branch on which backend authors tasks — FR-002) and the
// operator override / non-clobber posture (FR-007), and handles the absent-vocab
// case ([tier:UNSET] + loud advisory, non-blocking — FR-009). Mirrors the content-
// assertion pattern in capability/skill-marker-example-authorizes.test.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

function defineSkill(): string {
  return readFileSync(join(PLUGIN_ROOT, 'skills', 'define', 'SKILL.md'), 'utf8');
}

describe('035 FR-002 — define tasks seam injects the tier requirement (mirrors design house-rules)', () => {
  it('(a) reads the installation vocabulary via `stackctl tier-vocab`', () => {
    const md = defineSkill();
    expect(md).toMatch(/stackctl tier-vocab(\s+--json)?/);
  });

  it('(b) injects the `renderTierRequirement` single-source block into the /speckit-tasks drive', () => {
    const md = defineSkill();
    expect(md).toMatch(/renderTierRequirement/);
    // Names the single source so a reviewer can trace the block to it.
    expect(md).toMatch(/tier-requirement\.ts/);
    // The injection is bound to the tasks-authoring backend (speckit-tasks), not another step.
    expect(md).toMatch(/speckit-tasks/);
  });

  it('(c) states the capability-not-vendor stance — does NOT branch on which backend authors tasks (FR-002)', () => {
    const md = defineSkill();
    // The tier section must assert capability-not-vendor near the tier wiring.
    const tierSection = md.slice(md.search(/renderTierRequirement/));
    expect(tierSection).toMatch(/capability, not (vendor|provider|backend)|not.*branch.*backend|Principle III/i);
  });

  it('handles the absent-vocab case: [tier:UNSET] + loud advisory, non-blocking (FR-009)', () => {
    const md = defineSkill();
    expect(md).toMatch(/UNSET/);
    expect(md).toMatch(/configured:\s*false|absent|no `?tier_map`?/i);
    expect(md).toMatch(/advisory|non-?block/i);
  });

  it('preserves operator override / non-clobber of a reviewed tasks.md (FR-007)', () => {
    const md = defineSkill();
    const tierSection = md.slice(md.search(/renderTierRequirement/));
    expect(tierSection).toMatch(/override|non-?clobber|not.*clobber|operator-initiated|reviewed/i);
  });
});
