// US5 (022) — the design-to-spec exit gate fails loud on a missing required
// section, <2 solution-space alternatives, or an absent design-approved marker
// (FR-027, SC-007). RED first (T023).

import { afterEach, describe, expect, it } from 'vitest';
import { evaluateDesignGate, type GateContext } from '../../workflow/gate-eval.js';
import { HOUSE_RULES, renderHouseRules } from '../../workflow/house-rules.js';
import { DESIGN_RECORD_SECTIONS } from '../../workflow/workflow-types.js';
import { makeWorkflowFixture, type WorkflowFixture } from '../fixtures/workflow/workflow-fixtures.js';

let fixtures: WorkflowFixture[] = [];
function fixture(): WorkflowFixture {
  const f = makeWorkflowFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures) f.cleanup();
  fixtures = [];
});

/** A design record with the given sections + alternative count. */
function designRecord(sections: readonly string[], alternatives: number): string {
  const lines = ['# Design record', ''];
  for (const s of sections) {
    lines.push(`## ${s}`, '');
    if (s === 'solution-space') {
      for (let i = 0; i < alternatives; i++) lines.push(`- Alternative ${i + 1}: reason.`);
      lines.push('');
    } else {
      lines.push('content.', '');
    }
  }
  return lines.join('\n');
}

function ctxWith(f: WorkflowFixture, recordBody: string, designApproved: boolean): GateContext {
  const path = f.write('docs/superpowers/specs/x-design.md', recordBody);
  return {
    installationRoot: f.root,
    item: 'multi:feature/x',
    designPointer: 'docs/superpowers/specs/x-design.md',
    specPointer: null,
    analyzeClean: false,
    designApproved,
    designRecordPath: path,
    specDirPath: null,
    implRecordConverged: false,
    specRecordConverged: false,
    advanceTreeClean: true,
  };
}

describe('US5 design-to-spec exit gate', () => {
  it('passes when all required sections, ≥2 alternatives, and the approval marker are present', () => {
    const f = fixture();
    const ctx = ctxWith(f, designRecord(DESIGN_RECORD_SECTIONS, 2), true);
    const result = evaluateDesignGate(ctx);
    expect(result.allMet).toBe(true);
  });

  it('fails and names the missing section when a required section is absent', () => {
    const f = fixture();
    const missing = DESIGN_RECORD_SECTIONS.filter((s) => s !== 'open-questions');
    const result = evaluateDesignGate(ctxWith(f, designRecord(missing, 2), true));
    expect(result.allMet).toBe(false);
    expect(result.unmet.some((c) => c.kind === 'section-present' && c.param === 'open-questions')).toBe(true);
  });

  it('fails when the solution space lists fewer than 2 alternatives', () => {
    const f = fixture();
    const result = evaluateDesignGate(ctxWith(f, designRecord(DESIGN_RECORD_SECTIONS, 1), true));
    expect(result.allMet).toBe(false);
    expect(result.unmet.some((c) => c.kind === 'count-gte')).toBe(true);
  });

  it('fails when the design-approved marker is absent (judgment is a recorded fact)', () => {
    const f = fixture();
    const result = evaluateDesignGate(ctxWith(f, designRecord(DESIGN_RECORD_SECTIONS, 2), false));
    expect(result.allMet).toBe(false);
    expect(result.unmet.some((c) => c.kind === 'approval-marker')).toBe(true);
  });
});

describe('US5 house-rules block — single source', () => {
  it('renders the opinion for backend injection and includes capture-over-YAGNI', () => {
    const rendered = renderHouseRules();
    expect(rendered).toContain(HOUSE_RULES.id);
    expect(rendered).toContain('capture-over-yagni');
    expect(rendered).toContain('/stack-control:define');
  });
});
