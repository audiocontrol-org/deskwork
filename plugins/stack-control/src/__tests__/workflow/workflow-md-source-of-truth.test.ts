// US3 (022) — the governed WORKFLOW.md is the single source of truth: a criterion
// edited in an installation override changes engine behavior, and a malformed doc
// fails loud naming the violation with NO silent fallback to the bundled default
// (FR-005/FR-005a/FR-007). RED first (T016).

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUNDLED_WORKFLOW_PATH,
  loadWorkflowDoc,
} from '../../workflow/workflow-grammar.js';
import { WorkflowError } from '../../workflow/workflow-types.js';
import { DocumentModelError } from '../../document-model/types.js';
import { runCli } from '../_run-helpers.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(nodes: Parameters<typeof makeWorkflowFixture>[0] = []): WorkflowFixture {
  const f = makeWorkflowFixture(nodes);
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

const BUNDLED = readFileSync(BUNDLED_WORKFLOW_PATH, 'utf8');

/** Write `<root>/.stack-control/WORKFLOW.md` as an installation override. */
function writeOverride(f: WorkflowFixture, content: string): void {
  writeFileSync(join(f.root, '.stack-control', 'WORKFLOW.md'), content, 'utf8');
}

describe('US3 — WORKFLOW.md override resolution', () => {
  it('resolves the bundled default when no installation override exists', () => {
    const doc = loadWorkflowDoc(fixture().root);
    expect(doc.source).toBe('bundled');
    expect(doc.path).toBe(BUNDLED_WORKFLOW_PATH);
  });

  it('an installation override wins over the bundled default', () => {
    const f = fixture();
    writeOverride(f, BUNDLED);
    const doc = loadWorkflowDoc(f.root);
    expect(doc.source).toBe('override');
    expect(doc.path).toBe(join(f.root, '.stack-control', 'WORKFLOW.md'));
  });
});

describe('US3 — the doc governs behavior (mutating a criterion changes the answer)', () => {
  it("editing the specifying phase's exit criterion changes the status answer", () => {
    const ITEM = 'multi:feature/x';
    const f = fixture([{ identifier: ITEM, status: 'planned', design: 'd', spec: 'specs/x', analyzeClean: false }]);

    // Bundled: specifying exit = `node-marker analyze-clean` → unmet (not clean).
    const bundled = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(bundled.stdout).toContain('phase: specifying');
    expect(bundled.stdout).toContain('exit criteria: 0 of 1 met');

    // Override: change specifying exit to `pointer-set spec` → now met (spec set).
    const overridden = BUNDLED.replace(
      '- exit: node-marker analyze-clean',
      '- exit: pointer-set spec',
    );
    expect(overridden).not.toBe(BUNDLED); // the replace actually fired
    writeOverride(f, overridden);
    const after = runCli(['workflow', 'status', ITEM], { cwd: f.root });
    expect(after.stdout).toContain('phase: specifying');
    expect(after.stdout).toContain('exit criteria: 1 of 1 met (all met)');
  });
});

describe('US3 — a malformed WORKFLOW.md fails loud, never silently falls back', () => {
  it('throws WorkflowError on an unknown criterion kind (no fallback to bundled)', () => {
    const f = fixture();
    writeOverride(f, BUNDLED.replace('- exit: tasks-complete spec', '- exit: bogus-kind spec'));
    expect(() => loadWorkflowDoc(f.root)).toThrow(WorkflowError);
    expect(() => loadWorkflowDoc(f.root)).toThrow(/bogus-kind/);
  });

  it('throws on a missing required field', () => {
    const f = fixture();
    // Drop the `- work:` line from the captured phase.
    writeOverride(f, BUNDLED.replace('- work: stack-control:backlog\n', ''));
    expect(() => loadWorkflowDoc(f.root)).toThrow(/missing required field '- work:'/);
  });

  it("throws when the 'commit' effect is not last", () => {
    const f = fixture();
    const broken = BUNDLED.replace(
      '- effects: journal-append message={message}; commit message={message}',
      '- effects: commit message={message}; journal-append message={message}',
    );
    writeOverride(f, broken);
    expect(() => loadWorkflowDoc(f.root)).toThrow(/'commit' effect must be LAST/);
  });

  it('throws on a structurally malformed heading (document-model fail-loud)', () => {
    const f = fixture();
    writeOverride(f, BUNDLED.replace('## phase:captured', '## not-a-valid-unit-id'));
    expect(() => loadWorkflowDoc(f.root)).toThrow(DocumentModelError);
  });

  it('rejects a heavy/interactive verb authored as an advance effect (FR-017)', () => {
    const f = fixture();
    writeOverride(f, BUNDLED.replace('- effects: roadmap-advance to=in-flight;', '- effects: execute;'));
    expect(() => loadWorkflowDoc(f.root)).toThrow(/heavy\/interactive verb/);
  });
});
