// US1 help-probe — spec-misc family (028; FR-001/002; SC-001).
// Every verb (spec-check / spec-governance-gate / slush-findings / execute-check /
// no-shortcuts-audit) and every sub-action emits a conformant help body (a
// `Usage:` line + non-empty content). buildSurfaceFrom runs the completeness +
// mediation guards — a bad declaration throws here.

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';
import { SPEC_MISC_VERBS } from '../../cli-help/surfaces/spec-misc.js';

const surface = buildSurfaceFrom(SPEC_MISC_VERBS);

describe('spec-misc --help (028 US1)', () => {
  it('builds the surface (completeness + mediation guards pass)', () => {
    expect(surface.length).toBe(SPEC_MISC_VERBS.length);
  });

  for (const descriptor of surface) {
    it(`${descriptor.verb} --help emits a usage body`, () => {
      const out = renderVerbHelp(descriptor);
      expect(out).toMatch(/^Usage:/m);
      expect(out.trim().length).toBeGreaterThan(0);
    });

    for (const sub of descriptor.subActions) {
      it(`${descriptor.verb} ${sub.name} --help emits a usage body`, () => {
        const out = renderSubActionHelp(descriptor, sub.name);
        expect(out).toMatch(/^Usage:/m);
        expect(out.trim().length).toBeGreaterThan(0);
      });
    }
  }
});
