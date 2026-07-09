// 035 T016/T017 (FR-003/FR-010/SC-002) — behavior-guard: the tier vocabulary is
// installation-defined, not hardcoded. A `cheap:haiku / mid:sonnet / frontier:opus`
// tier_map (non-default labels) proves `bucketBindings` and `renderTierRequirement`
// carry no baked-in `fast`/`balanced`/`powerful` vocabulary, and that the `tier-vocab`
// verb reports the operator's own labels back (mirroring the CLI-driven convention
// in src/__tests__/subcommands/tier-vocab.test.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';
import { bucketBindings, renderTierRequirement, type TierVocab } from '../../workflow/tier-requirement.js';
import type { TierMap } from '../../config/types.js';

const NON_DEFAULT_MAP: TierMap = { cheap: 'haiku', mid: 'sonnet', frontier: 'opus' };
const DEFAULT_VOCAB_WORDS = ['fast', 'balanced', 'powerful'];

describe('035 non-default tier vocabulary — no hardcoded fast/balanced/powerful (FR-003/FR-010/SC-002)', () => {
  it('bucketBindings binds cheapest/mid/mostCapable to the operator\'s own labels', () => {
    expect(bucketBindings(NON_DEFAULT_MAP)).toEqual({
      cheapest: 'cheap',
      mid: 'mid',
      mostCapable: 'frontier',
    });
  });

  it("renderTierRequirement's block names only cheap/mid/frontier — never fast/balanced/powerful", () => {
    const vocab: TierVocab = {
      configured: true,
      configPath: '/tmp/does-not-matter/config.yaml',
      labels: [
        { label: 'cheap', model: 'haiku', rank: 0 },
        { label: 'mid', model: 'sonnet', rank: 1 },
        { label: 'frontier', model: 'opus', rank: 2 },
      ],
      buckets: bucketBindings(NON_DEFAULT_MAP),
    };
    const block = renderTierRequirement(vocab);

    // The operator's own labels are present.
    expect(block).toMatch(/cheap/);
    expect(block).toMatch(/\bmid\b/);
    expect(block).toMatch(/frontier/);

    // No hardcoded default-vocabulary word leaks into the rendered block.
    for (const word of DEFAULT_VOCAB_WORDS) {
      expect(block).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it('the tier-vocab verb (CLI) reports the operator\'s own labels for a non-default installation', () => {
    const work = mkdtempSync(join(tmpdir(), 'stackctl-tiervocab-nondefault-'));
    try {
      mkdirSync(join(work, '.stack-control'), { recursive: true });
      writeFileSync(
        join(work, '.stack-control', 'config.yaml'),
        ['version: 1', 'tier_map:', '  cheap: haiku', '  mid: sonnet', '  frontier: opus', ''].join('\n'),
      );
      const r = runCli(['tier-vocab'], { cwd: work });
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout) as { buckets: { cheapest: string; mid: string; mostCapable: string } };
      expect(out.buckets).toEqual({ cheapest: 'cheap', mid: 'mid', mostCapable: 'frontier' });
      // No default-vocabulary word appears in the verb's own JSON output.
      for (const word of DEFAULT_VOCAB_WORDS) {
        expect(r.stdout).not.toMatch(new RegExp(`"${word}"`));
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
