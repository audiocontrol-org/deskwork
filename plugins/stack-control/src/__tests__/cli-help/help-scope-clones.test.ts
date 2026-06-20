// US1 help-probe — scope-clones family (028 T0xx; FR-001/002; SC-001).
// Every verb in the family renders a conformant `--help` body (a `Usage:` line,
// non-empty) from its descriptor alone, with no drift from the real parser.

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';
import { SCOPE_CLONES_VERBS } from '../../cli-help/surfaces/scope-clones.js';

const SURFACE = buildSurfaceFrom(SCOPE_CLONES_VERBS);

describe('scope-clones --help (US1)', () => {
  it('the family mounts every expected verb', () => {
    expect(SURFACE.map((d) => d.verb).sort()).toEqual(
      [
        'batch-dispose',
        'check-clones',
        'check-disposition-survivor',
        'check-refactor-preconditions',
        'dispose-clone',
        'refresh-clones-baseline',
      ].sort(),
    );
  });

  it('every verb renders a conformant usage body', () => {
    for (const descriptor of SURFACE) {
      const out = renderVerbHelp(descriptor);
      expect(out, `${descriptor.verb} usage line`).toMatch(/^Usage:/m);
      expect(out.trim().length, `${descriptor.verb} non-empty`).toBeGreaterThan(0);
      expect(out, `${descriptor.verb} description`).toContain(descriptor.description);
    }
  });

  it('every sub-action (none in this family) renders a conformant usage body', () => {
    for (const descriptor of SURFACE) {
      for (const sub of descriptor.subActions) {
        const out = renderSubActionHelp(descriptor, sub.name);
        expect(out, `${descriptor.verb} ${sub.name} usage line`).toMatch(/^Usage:/m);
        expect(out.trim().length, `${descriptor.verb} ${sub.name} non-empty`).toBeGreaterThan(0);
      }
    }
  });
});
