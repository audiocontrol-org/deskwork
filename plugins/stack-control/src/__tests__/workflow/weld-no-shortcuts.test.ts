// 032 US1 (T012) — the weld has no escape hatch. From `merging`, the ONLY forward
// transition fires `graduate` (records status:shipped) — there is no skip/defer
// variant that merges without recording. The ship/advance surface exposes no
// `--defer`/`--skip` flag, the ship SKILL.md offers no agent shortcut, and
// `/stack-control:execute` does NOT auto-chain into ship (FR-003/FR-004, analyze C1).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadWorkflowDoc } from '../../workflow/workflow-grammar.js';
import { scanShortcutAffordances } from '../../subcommands/no-shortcuts-audit.js';
import { makeWorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, '..', '..', '..'); // src/__tests__/workflow → plugin root
const shipSkill = () => readFileSync(resolve(PLUGIN_ROOT, 'skills', 'ship', 'SKILL.md'), 'utf8');
const executeSkill = () => readFileSync(resolve(PLUGIN_ROOT, 'skills', 'execute', 'SKILL.md'), 'utf8');

describe('032 US1 — the weld has no skip/defer/shortcut escape (FR-003/FR-004)', () => {
  it('from merging the ONLY forward transition fires graduate (records shipped) — no skip variant', () => {
    const f = makeWorkflowFixture();
    const doc = loadWorkflowDoc(f.root);
    f.cleanup();
    const fromMerging = doc.transitions.filter((t) => t.from === 'merging');
    // Exactly one forward transition out of merging, and it is graduate → validating,
    // recording status:shipped. There is no second transition that leaves merging
    // without firing the record (no "skip recording" path).
    expect(fromMerging).toHaveLength(1);
    expect(fromMerging[0]!.codename).toBe('graduate');
    expect(fromMerging[0]!.to).toBe('validating');
    expect(fromMerging[0]!.effects.some((e) => e.verb === 'roadmap-advance' && e.args.to === 'shipped')).toBe(true);
  });

  it('the ship SKILL.md offers no agent-driven skip/defer/shortcut and exposes no --defer/--skip flag', () => {
    const body = shipSkill();
    expect(scanShortcutAffordances(body, 'skills/ship/SKILL.md')).toEqual([]);
    expect(body).not.toMatch(/--defer\b/);
    expect(body).not.toMatch(/--skip\b/);
  });

  it('/stack-control:execute does NOT auto-invoke or reference ship (merge timing is operator-owned, FR-004)', () => {
    const body = executeSkill();
    // execute must not chain into ship — no `/stack-control:ship` reference, no `:ship` invocation.
    expect(body).not.toMatch(/stack-control:ship\b/);
    expect(body).not.toMatch(/\bworkflow\s+ship\b/);
  });
});
