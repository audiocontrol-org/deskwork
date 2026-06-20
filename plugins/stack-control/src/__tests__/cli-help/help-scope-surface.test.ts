// US1 help-probe — scope-surface family (028; FR-001/002; SC-001).
// Every scope-discovery verb renders a conformant `--help` body (a line-anchored
// `Usage:` marker + non-empty) from the single descriptor source, with no drift
// from the verb's real flags/positionals. Sub-action help is covered too for any
// verb that grows sub-actions (today the family is entirely flat).

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';
import { SCOPE_SURFACE_VERBS } from '../../cli-help/surfaces/scope-surface.js';

const SURFACE = buildSurfaceFrom(SCOPE_SURFACE_VERBS);

describe('scope-surface --help (028 US1)', () => {
  it('projects every declared verb', () => {
    expect(SURFACE.length).toBe(SCOPE_SURFACE_VERBS.length);
  });

  it('every verb emits a conformant usage body', () => {
    for (const descriptor of SURFACE) {
      const help = renderVerbHelp(descriptor);
      expect(help.trim().length, `${descriptor.verb} help is empty`).toBeGreaterThan(0);
      expect(help, `${descriptor.verb} help has no Usage: line`).toMatch(/^Usage:/m);
    }
  });

  it('every sub-action (if any) emits a conformant usage body', () => {
    for (const descriptor of SURFACE) {
      for (const sub of descriptor.subActions) {
        const help = renderSubActionHelp(descriptor, sub.name);
        expect(help.trim().length, `${descriptor.verb} ${sub.name} help is empty`).toBeGreaterThan(0);
        expect(help, `${descriptor.verb} ${sub.name} help has no Usage: line`).toMatch(/^Usage:/m);
      }
    }
  });
});
