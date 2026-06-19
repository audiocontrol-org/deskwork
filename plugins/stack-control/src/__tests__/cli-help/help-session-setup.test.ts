// US1 help-probe — session-setup family (028; FR-001/002; SC-001).
// Every verb (session-start / session-end / setup / config-domain /
// release-check / release-helper / version) and every sub-action emits a
// conformant help body (a `Usage:` line + non-empty content). buildSurfaceFrom
// runs the completeness + mediation guards — a bad declaration throws here.

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';
import { SESSION_SETUP_VERBS } from '../../cli-help/surfaces/session-setup.js';

const surface = buildSurfaceFrom(SESSION_SETUP_VERBS);

describe('session-setup --help (028 US1)', () => {
  it('builds the surface (completeness + mediation guards pass)', () => {
    expect(surface.length).toBe(SESSION_SETUP_VERBS.length);
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
