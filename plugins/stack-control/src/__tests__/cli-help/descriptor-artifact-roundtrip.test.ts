// US1 descriptor artifact round-trip (028 T040/T041; FR-052; contract C4/C5).
// The artifact is DERIVED from the command tree (never authored) and must contain
// EXACTLY the verbs / sub-actions / flags the live surface exposes — no missing,
// no extra.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { emitDescriptorArtifact } from '../../cli-help/verb-reference.js';

describe('emitDescriptorArtifact (T041 — oclif-manifest-style, round-trips the tree)', () => {
  it('carries a stable id and a commands map', () => {
    const artifact = emitDescriptorArtifact();
    expect(typeof artifact.id).toBe('string');
    expect(artifact.id.length).toBeGreaterThan(0);
    expect(artifact.commands).toBeTypeOf('object');
  });

  it('contains EXACTLY the verbs the live surface exposes (no missing, no extra)', () => {
    const artifact = emitDescriptorArtifact();
    const surfaceVerbs = buildCommandSurface().map((d) => d.verb).sort();
    const artifactVerbs = Object.keys(artifact.commands).sort();
    expect(artifactVerbs).toEqual(surfaceVerbs);
  });

  it('round-trips every sub-action and flag of every verb (structural equality)', () => {
    const artifact = emitDescriptorArtifact();
    for (const descriptor of buildCommandSurface()) {
      const cmd = artifact.commands[descriptor.verb];
      expect(cmd, `command ${descriptor.verb}`).toBeDefined();
      expect(Object.keys(cmd!.flags).sort()).toEqual(descriptor.flags.map((f) => f.name).sort());
      expect(Object.keys(cmd!.subActions).sort()).toEqual(descriptor.subActions.map((s) => s.name).sort());
      for (const sub of descriptor.subActions) {
        const sa = cmd!.subActions[sub.name];
        expect(sa, `${descriptor.verb}/${sub.name}`).toBeDefined();
        expect(Object.keys(sa!.flags).sort()).toEqual(sub.flags.map((f) => f.name).sort());
        expect(sa!.mediationClass).toBe(sub.mediationClass);
      }
    }
  });
});
