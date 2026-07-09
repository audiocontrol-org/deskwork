// 035 T020 (RED-first) — the static tasks-template.md must not drift from the
// single-source render module (FR-011/FR-012). The template is a plain markdown
// file (no way to call `renderTierRequirement`/import the TS constants at
// generation time — research.md Decision 4), so this test is the drift guard:
// it asserts the template's tier documentation embeds the SAME canonical
// clauses `tier-requirement.ts` exports, and that the template exemplifies
// `[tier:<label>]` on a sample task line + in the Format line (contracts/
// render-tier-requirement.md § Invariants the drift test checks).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER_HEURISTIC_CLAUSE, TIER_TAG_FORMAT_CLAUSE } from '../../workflow/tier-requirement.js';

const here = dirname(fileURLToPath(import.meta.url));
/** `plugins/stack-control/.specify/templates/tasks-template.md` — up from src/__tests__/workflow/. */
const TASKS_TEMPLATE_PATH = resolve(here, '..', '..', '..', '.specify', 'templates', 'tasks-template.md');

/** The parser's tag shape (`src/execute/tasks-tier-parser.ts` `TIER_TAG`), duplicated
 * here deliberately: the drift test must independently confirm the exemplified sample
 * tag is one `resolve-tiers` would actually accept, not merely that literal text
 * `[tier:` appears somewhere. */
const TIER_TAG_SHAPE = /\[tier:([^\]]+)\]/;

describe('tasks-template.md — no drift from the single-source tier-requirement constants (FR-011/FR-012)', () => {
  const template = readFileSync(TASKS_TEMPLATE_PATH, 'utf8');

  it('contains the canonical TIER_TAG_FORMAT_CLAUSE verbatim', () => {
    expect(template).toContain(TIER_TAG_FORMAT_CLAUSE);
  });

  it('contains the canonical TIER_HEURISTIC_CLAUSE verbatim', () => {
    expect(template).toContain(TIER_HEURISTIC_CLAUSE);
  });

  it('the `## Format:` line documents the `[tier:LABEL]` slot alongside `[P?]`/`[Story]`', () => {
    const formatLine = template.split('\n').find((line) => line.startsWith('## Format:'));
    expect(formatLine).toBeDefined();
    expect(formatLine).toMatch(/\[tier:LABEL\]/);
  });

  it('at least one sample task line carries a `[tier:<label>]` tag matching the parser shape', () => {
    const lines = template.split('\n');
    const sampleTaskLines = lines.filter((line) => /^-\s+\[[ xX]\]\s+T\d+\b/.test(line));
    expect(sampleTaskLines.length).toBeGreaterThan(0);

    const tagged = sampleTaskLines.filter((line) => TIER_TAG_SHAPE.test(line));
    expect(tagged.length).toBeGreaterThan(0);
  });
});
