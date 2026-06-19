// US1 help-probe — scope-checks family (028 T0xx; FR-001/002; SC-001).
// Every scope-check verb renders a conformant `--help` body, and the deprecated
// `check-editor-symmetry` alias declares its target.

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderVerbHelp } from '../../cli-help/render-help.js';
import { SCOPE_CHECKS_VERBS } from '../../cli-help/surfaces/scope-checks.js';

const surface = buildSurfaceFrom(SCOPE_CHECKS_VERBS);

describe('scope-checks --help (US1)', () => {
  it('mounts every declared scope-check verb', () => {
    expect(surface.map((d) => d.verb)).toEqual([
      'check-anti-patterns',
      'check-adopters',
      'check-module-symmetry',
      'check-editor-symmetry',
      'check-deprecations',
    ]);
  });

  it('every verb renders a non-empty usage body', () => {
    for (const descriptor of surface) {
      const help = renderVerbHelp(descriptor);
      expect(help.length, `${descriptor.verb} help is empty`).toBeGreaterThan(0);
      expect(help, `${descriptor.verb} help lacks a Usage: line`).toMatch(/^Usage:/m);
    }
  });

  it('check-editor-symmetry is a deprecated alias of check-module-symmetry', () => {
    const alias = surface.find((d) => d.verb === 'check-editor-symmetry');
    if (alias === undefined) throw new Error('test setup: check-editor-symmetry descriptor missing');
    expect(alias.deprecatedAliasOf).toBe('check-module-symmetry');
  });
});
