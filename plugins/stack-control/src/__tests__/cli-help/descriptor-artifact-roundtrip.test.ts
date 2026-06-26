// US1 descriptor artifact round-trip (028 T040/T041; FR-052; contract C4/C5).
// The artifact is DERIVED from the command tree (never authored) and must contain
// EXACTLY the verbs / sub-actions / flags the live surface exposes — no missing,
// no extra.

import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { buildCommandSurface, buildSurfaceFrom } from '../../cli-help/command-surface.js';
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

  // AUDIT-20260619-74 (TASK-311): the artifact claims to carry EXACTLY the flags
  // the surface exposes, but the human verb reference renders `flag.shortFlag`
  // (the `-d, --depends-on` alias) while the machine artifact dropped it — so a
  // manifest consumer could not reconstruct short aliases. The round-trip must
  // carry shortFlag too.
  it('mirrors every live-surface flag shortFlag onto the artifact (structural)', () => {
    const artifact = emitDescriptorArtifact();
    for (const descriptor of buildCommandSurface()) {
      const cmd = artifact.commands[descriptor.verb]!;
      const checkFlags = (
        descFlags: ReadonlyArray<{ name: string; shortFlag: string | null }>,
        artFlags: Record<string, { shortFlag: string | null }>,
        where: string,
      ): void => {
        for (const f of descFlags) {
          expect(artFlags[f.name], `${where} flag --${f.name}`).toBeDefined();
          // The KEY must be present (RED today: absent → undefined ≠ null) and equal
          // the descriptor's value — for null AND non-null shortFlags alike.
          expect(artFlags[f.name], `${where} flag --${f.name}`).toHaveProperty('shortFlag');
          expect(artFlags[f.name]!.shortFlag, `${where} flag --${f.name} shortFlag`).toBe(f.shortFlag);
        }
      };
      checkFlags(descriptor.flags, cmd.flags, descriptor.verb);
      for (const sub of descriptor.subActions) {
        checkFlags(sub.flags, cmd.subActions[sub.name]!.flags, `${descriptor.verb}/${sub.name}`);
      }
    }
  });

  // The live surface declares no short aliases today, so the structural test above
  // only exercises the null case. This fixture proves a NON-NULL shortFlag survives
  // the round-trip — the regression that AUDIT-20260619-74 actually names (a manifest
  // consumer reconstructing `-d, --depends-on`).
  it('round-trips a non-null shortFlag through the artifact (fixture verb)', () => {
    const build = (): Command => {
      const cmd = new Command('fixv').description('a fixture verb');
      cmd.option('-d, --depends-on <id>', 'a dependency edge target');
      return cmd;
    };
    const surface = buildSurfaceFrom([
      { build, meta: { deprecatedAliasOf: null, verbMediation: 'read-only' } },
    ]);
    const artifact = emitDescriptorArtifact(surface);
    expect(artifact.commands['fixv']!.flags['depends-on']!.shortFlag).toBe('d');
  });
});
