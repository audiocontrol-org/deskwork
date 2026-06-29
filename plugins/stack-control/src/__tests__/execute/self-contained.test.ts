// 033 T023 (US3) — the feature is self-contained (FR-013 / SC-006).
//
// stack-control adopts superpowers' subagent-execution PATTERNS but MUST NOT hard-depend
// on the superpowers plugin being installed: the tier discipline is applied by
// stack-control itself, so behavior is identical whether or not superpowers is present.
// This guards the source — the feature's own modules must carry no `superpowers` import.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The feature's own source files (NOT tests, which may reference the name in prose).
const FEATURE_SOURCES = [
  join(SRC, 'execute', 'accepted-models.ts'),
  join(SRC, 'execute', 'tasks-tier-parser.ts'),
  join(SRC, 'execute', 'tier-resolution.ts'),
  join(SRC, 'execute', 'ledger.ts'),
  join(SRC, 'subcommands', 'resolve-tiers.ts'),
];

describe('feature is self-contained — no superpowers runtime coupling (033 T023)', () => {
  it('no feature source imports/requires the superpowers plugin (FR-013/SC-006)', () => {
    const offenders: string[] = [];
    for (const file of FEATURE_SOURCES) {
      const body = readFileSync(file, 'utf8');
      if (/\b(import|require)\b[^\n]*superpowers/i.test(body)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
