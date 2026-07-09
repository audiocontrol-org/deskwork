// 035 T004 (RED-first) — the injected tier-requirement render block.
//
// Asserts renderTierRequirement composes from the single-source constants and
// carries the four contract sections (render-tier-requirement.md):
//   (a) syntax  (b) heuristic  (c) concrete binding  (d) completeness / UNSET.

import { describe, expect, it } from 'vitest';
import {
  bucketBindings,
  renderTierRequirement,
  TIER_HEURISTIC_CLAUSE,
  TIER_TAG_FORMAT_CLAUSE,
  type AbsentVocab,
  type TierVocab,
} from '../../workflow/tier-requirement.js';
import type { TierMap } from '../../config/types.js';

function configuredVocab(tierMap: TierMap, configPath = '/x/.stack-control/config.yaml'): TierVocab {
  return {
    configured: true,
    configPath,
    labels: Object.entries(tierMap).map(([label, model]) => ({ label, model, rank: 0 })),
    buckets: bucketBindings(tierMap),
  };
}

describe('shared canonical constants (single source, FR-012)', () => {
  it('the tag-format clause states the [tier:<label>] syntax', () => {
    expect(TIER_TAG_FORMAT_CLAUSE).toContain('[tier:<label>]');
  });

  it('the heuristic clause carries the FR-004 mechanical/standard/cross-cutting mapping', () => {
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('mechanical');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('red');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('doc');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('standard');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('cross-cutting');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('architectural');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('ambiguous');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('cheapest');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('mid');
    expect(TIER_HEURISTIC_CLAUSE.toLowerCase()).toContain('most-capable');
  });
});

describe('renderTierRequirement — configured vocab', () => {
  const tierMap: TierMap = { fast: 'haiku', balanced: 'sonnet', powerful: 'opus' };
  const block = renderTierRequirement(configuredVocab(tierMap));

  it('embeds the single-source constants verbatim (no drift)', () => {
    expect(block).toContain(TIER_TAG_FORMAT_CLAUSE);
    expect(block).toContain(TIER_HEURISTIC_CLAUSE);
  });

  it('(c) names THIS installation concrete bucket labels in the right roles', () => {
    expect(block).toContain('cheapest');
    expect(block).toContain('fast');
    expect(block).toContain('balanced');
    expect(block).toContain('powerful');
    // the block binds the derived buckets to the real labels, not a hardcoded set
    expect(block).toMatch(/cheapest[^\n]*fast/);
    expect(block).toMatch(/mid[^\n]*balanced/);
    expect(block).toMatch(/most-capable[^\n]*powerful/);
  });

  it('lists every label -> model so only resolvable labels are proposed', () => {
    expect(block).toMatch(/fast[^\n]*haiku/);
    expect(block).toMatch(/balanced[^\n]*sonnet/);
    expect(block).toMatch(/powerful[^\n]*opus/);
  });

  it('a differently-shaped installation gets ITS labels, never fast/balanced/powerful', () => {
    const other: TierMap = { cheap: 'haiku', frontier: 'opus' };
    const otherBlock = renderTierRequirement(configuredVocab(other));
    expect(otherBlock).toContain('cheap');
    expect(otherBlock).toContain('frontier');
    expect(otherBlock).not.toContain('balanced');
    expect(otherBlock).not.toContain('powerful');
  });
});

describe('renderTierRequirement — absent vocab (FR-009)', () => {
  const absent: AbsentVocab = {
    configured: false,
    configPath: '/proj/.stack-control/config.yaml',
  };
  const block = renderTierRequirement(absent);

  it('instructs emitting [tier:UNSET] on every task', () => {
    expect(block).toContain('[tier:UNSET]');
  });

  it('reproduces a loud advisory naming the missing tier_map and the config path', () => {
    expect(block).toContain('tier_map');
    expect(block).toContain('/proj/.stack-control/config.yaml');
  });

  it('still states the heuristic in the abstract', () => {
    expect(block).toContain(TIER_HEURISTIC_CLAUSE);
  });

  it('does NOT invent a real label or emit a concrete default', () => {
    expect(block).not.toContain('[tier:fast]');
    expect(block).not.toContain('[tier:balanced]');
    expect(block).not.toContain('[tier:powerful]');
  });
});
