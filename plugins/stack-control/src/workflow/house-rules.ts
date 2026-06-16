// The design frontend's single-source opinion (022 US5 / T024, FR-024). ONE
// source, two consumers: the block is INJECTED into the design backend's
// conversation (re-asserted at the backend's scope-check step) AND the
// `design-to-spec` exit gate's mechanical criteria are DERIVED from it. Keeping
// both off one block is what makes the frontend's opinion non-drifting — the gate
// can never check something the backend wasn't told, and vice-versa.

import {
  DESIGN_RECORD_SECTIONS,
  type Criterion,
  type HouseRulesBlock,
} from './workflow-types.js';

/** The named, versioned house-rules block (the frontend's opinion). */
export const HOUSE_RULES: HouseRulesBlock = {
  id: 'stack-control-design-v1',
  rules: [
    {
      id: 'capture-over-yagni',
      statement:
        'Capture everything known or knowably-implied — every edge case, cross-cut, and open ' +
        'question. Do NOT cut scope (no YAGNI, no "not in v1"). Scoping is a separate, explicit, ' +
        'operator-driven pass AFTER capture.',
      backedBy: 'mechanical',
    },
    {
      id: 'solution-space-alternatives',
      statement:
        'The solution space MUST enumerate at least 2 alternatives, including the rejected ones ' +
        'with the reason each was rejected.',
      backedBy: 'mechanical',
    },
    {
      id: 'required-sections',
      statement: `The design record MUST contain these sections: ${DESIGN_RECORD_SECTIONS.join(', ')}.`,
      backedBy: 'mechanical',
    },
    {
      id: 'operator-approval',
      statement:
        'The design is not done until the operator records approval as the design-approved: marker ' +
        'on the roadmap node. The operator judges; the gate checks the recorded fact.',
      backedBy: 'operator',
    },
    {
      id: 'handoff-to-spec-kit',
      statement:
        'The terminal handoff routes to Spec Kit (/stack-control:define), NEVER the backend default ' +
        '(writing-plans).',
      backedBy: 'soft',
    },
    {
      id: 'installation-anchored-record',
      statement:
        'The design record is written at <install-root>/docs/superpowers/specs/<date>-<slug>-design.md, ' +
        'inside the installation domain — never the adopter repo root.',
      backedBy: 'mechanical',
    },
  ],
};

/**
 * The mechanical `design-to-spec` exit-gate criteria DERIVED from the house
 * rules: each required section present, ≥2 solution-space alternatives, and the
 * recorded approval marker (FR-027). This is the same predicate set the bundled
 * WORKFLOW.md `design-to-spec` transition publishes — one opinion, two surfaces.
 */
export function designGateCriteria(): Criterion[] {
  return [
    ...DESIGN_RECORD_SECTIONS.map(
      (section): Criterion => ({ kind: 'section-present', target: 'design', param: section }),
    ),
    { kind: 'count-gte', target: 'solution-space-alternatives', param: 2 },
    { kind: 'approval-marker', target: 'design-approved' },
  ];
}

/** Render the house-rules block as markdown for injection into the backend conversation. */
export function renderHouseRules(): string {
  const lines = [`## stack-control design house rules (${HOUSE_RULES.id})`, ''];
  for (const rule of HOUSE_RULES.rules) {
    lines.push(`- **${rule.id}** (${rule.backedBy}): ${rule.statement}`);
  }
  return lines.join('\n');
}
