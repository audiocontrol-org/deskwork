// US1 help-probe — audit-barrage family (028; FR-001/002; SC-001).
// Every verb (audit-barrage / audit-barrage-render / audit-barrage-lift /
// govern) and every sub-action emits a conformant help body (a `Usage:` line +
// non-empty content). buildSurfaceFrom runs the completeness + mediation guards
// — a bad declaration throws here.

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';
import { AUDIT_BARRAGE_VERBS } from '../../cli-help/surfaces/audit-barrage.js';

const surface = buildSurfaceFrom(AUDIT_BARRAGE_VERBS);

describe('audit-barrage --help (028 US1)', () => {
  it('builds the surface (completeness + mediation guards pass)', () => {
    expect(surface.length).toBe(AUDIT_BARRAGE_VERBS.length);
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
