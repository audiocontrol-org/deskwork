// US1 help-surface — capability family (028; FR-001/002/003; SC-001).
// Every verb's renderVerbHelp and every sub-action's renderSubActionHelp emit a
// non-empty, line-anchored `Usage:` body. Builds the descriptors directly via
// buildSurfaceFrom(CAPABILITY_VERBS) (no spawn) so the surface declaration itself
// is the unit under test.

import { describe, expect, it } from 'vitest';
import { buildSurfaceFrom } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';
import { CAPABILITY_VERBS } from '../../cli-help/surfaces/capability.js';

const SURFACE = buildSurfaceFrom(CAPABILITY_VERBS);

const USAGE = /^Usage:/m;

describe('capability family --help (028 US1)', () => {
  it('mounts every expected verb', () => {
    expect(SURFACE.map((d) => d.verb).sort()).toEqual(
      ['capability', 'front-door', 'intercept', 'mediate-check', 'speckit-guard'],
    );
  });

  for (const descriptor of SURFACE) {
    it(`${descriptor.verb} emits a conformant usage body`, () => {
      const body = renderVerbHelp(descriptor);
      expect(body.length).toBeGreaterThan(0);
      expect(body).toMatch(USAGE);
    });

    for (const sub of descriptor.subActions) {
      it(`${descriptor.verb} ${sub.name} emits a conformant usage body`, () => {
        const body = renderSubActionHelp(descriptor, sub.name);
        expect(body.length).toBeGreaterThan(0);
        expect(body).toMatch(USAGE);
      });
    }
  }

  it('declares the expected sub-actions and mediation classes', () => {
    const byVerb = new Map(SURFACE.map((d) => [d.verb, d]));

    const capability = byVerb.get('capability');
    expect(capability?.mediationClass).toBeNull();
    expect(capability?.subActions.map((s) => `${s.name}:${s.mediationClass}`).sort()).toEqual([
      'list:read-only',
      'reconcile:read-only',
    ]);

    const frontDoor = byVerb.get('front-door');
    expect(frontDoor?.subActions.map((s) => `${s.name}:${s.mediationClass}`).sort()).toEqual([
      'enter:mutating',
      'exit:mutating',
      'mediate-list:read-only',
      'mediate-recover:mutating',
    ]);

    expect(byVerb.get('mediate-check')?.mediationClass).toBe('read-only');
    expect(byVerb.get('intercept')?.mediationClass).toBe('read-only');

    const speckitGuard = byVerb.get('speckit-guard');
    expect(speckitGuard?.mediationClass).toBe('read-only');
    expect(speckitGuard?.deprecatedAliasOf).toBe('mediate-check');
  });
});
