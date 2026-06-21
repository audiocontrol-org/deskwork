// T044 (RED-first, 029 Phase 8 US8) — the five structural drivers of myopic
// convergence (TASK-60) are codified into the barrage prompt template AND the
// implement/govern skill body (FR-029). Presence assertions: a future edit that
// drops a driver fails here.
//
//   1. channel-enumeration — a surface-adding fix enumerates the value / state /
//      multiline / composition channels it opens (with fixtures) before re-firing.
//   2. invariant-first boundary — a scope disposition states the mechanism's
//      invariant + an in-scope exception, not the exclusion of a counterexample.
//   3. round-0 self-red-team — a self-red-team pass over the fix diff before re-firing.
//   4. fleet-degradation pricing — convergence claims are priced by fleet health (US2).
//   5. severity-rubric anchoring — findings rated by the blast-radius rubric (US3).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROMPT = readFileSync(join(PLUGIN_ROOT, 'templates', 'audit-barrage-prompt.md'), 'utf8').toLowerCase();
const EXECUTE = readFileSync(join(PLUGIN_ROOT, 'skills', 'execute', 'SKILL.md'), 'utf8').toLowerCase();

const DRIVERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['channel-enumeration', /channel[\s-]enumeration/],
  ['invariant-first boundary', /invariant[\s-]first/],
  ['round-0 self-red-team', /self[\s-]red[\s-]team/],
  ['fleet-degradation pricing', /fleet[\s-]degradation/],
  ['severity-rubric anchoring', /severity[\s-]rubric/],
];

describe('US8 FR-029 — process drivers in the barrage prompt template', () => {
  for (const [name, re] of DRIVERS) {
    it(`the barrage prompt template carries the ${name} driver`, () => {
      expect(PROMPT).toMatch(re);
    });
  }
});

describe('US8 FR-029 — process drivers in the implement/govern skill body', () => {
  for (const [name, re] of DRIVERS) {
    it(`the execute skill body carries the ${name} driver`, () => {
      expect(EXECUTE).toMatch(re);
    });
  }
});
