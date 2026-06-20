// US1 verb reference (028 T038/T039; FR-004; contract C3). The reference is
// DERIVED by walking the command surface — never hand-maintained.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { renderVerbReference } from '../../cli-help/verb-reference.js';

describe('renderVerbReference (T039 — derived reference of all verbs)', () => {
  it('lists every verb, every sub-action, and every flag from the surface', () => {
    const ref = renderVerbReference();
    const surface = buildCommandSurface();
    for (const verb of surface) {
      expect(ref, `verb ${verb.verb}`).toContain(verb.verb);
      for (const sub of verb.subActions) {
        expect(ref, `${verb.verb}/${sub.name}`).toContain(sub.name);
        for (const flag of sub.flags) {
          expect(ref, `${verb.verb}/${sub.name} --${flag.name}`).toContain(`--${flag.name}`);
        }
      }
      for (const flag of verb.flags) {
        expect(ref, `${verb.verb} --${flag.name}`).toContain(`--${flag.name}`);
      }
    }
  });

  it('is non-empty and names a meaningful count of verbs', () => {
    expect(renderVerbReference().trim().length).toBeGreaterThan(0);
    expect(buildCommandSurface().length).toBeGreaterThanOrEqual(40);
  });
});
