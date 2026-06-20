// 028 US4 T106 — check-front-door C2d: skill↔verb parity, BOTH directions (FR-031;
// contract C2d). A skill documenting a verb the tree lacks (skill → verb), OR a verb
// no skill documents (verb → skill) → gap naming the gap. A deprecated alias is not
// a gap.

import { describe, expect, it } from 'vitest';
import {
  checkFrontDoor,
  documentedPhantomOps,
  type CheckFrontDoorDeps,
  type CheckRegistry,
} from '../../subcommands/check-front-door.js';
import type { CommandDescriptor, SubActionDescriptor } from '../../cli-help/command-surface.js';

const REG: CheckRegistry = {
  id: 'test',
  operations: [
    {
      operationId: 'roadmap/next',
      requiredSkill: 'roadmap',
      mediationClass: 'read-only',
      hasHelp: true,
      source: 'command-tree',
      isFrontedBackend: false,
    },
  ],
};

const BASE: Pick<CheckFrontDoorDeps, 'skillExists' | 'helpProbe' | 'mediationRegistered'> = {
  skillExists: () => true,
  helpProbe: () => true,
  mediationRegistered: () => true,
};

describe('check-front-door C2d — skill↔verb parity both directions (028 T106)', () => {
  it('passes when each registered verb is documented and each documented verb exists', () => {
    const result = checkFrontDoor({
      registry: REG,
      verbsDocumentedBySkills: () => new Set(['roadmap/next']),
      liveVerbSubActions: () => new Set(['roadmap/next']),
      ...BASE,
    });
    const parityGaps = result.gaps.filter((g) => g.startsWith('C2d'));
    expect(parityGaps).toEqual([]);
  });

  it('verb → skill: a registered verb no skill documents → gap', () => {
    const result = checkFrontDoor({
      registry: REG,
      verbsDocumentedBySkills: () => new Set<string>(), // roadmap/next documented by nobody
      liveVerbSubActions: () => new Set(['roadmap/next']),
      ...BASE,
    });
    expect(result.ok).toBe(false);
    expect(result.gaps.join('\n')).toMatch(/roadmap\/next/);
  });

  it('skill → verb: a skill documenting a verb the tree lacks → gap naming the phantom verb', () => {
    const result = checkFrontDoor({
      registry: REG,
      // a skill documents `roadmap/phantom` which is not in the live tree.
      verbsDocumentedBySkills: () => new Set(['roadmap/next', 'roadmap/phantom']),
      liveVerbSubActions: () => new Set(['roadmap/next']),
      ...BASE,
    });
    expect(result.ok).toBe(false);
    expect(result.gaps.join('\n')).toMatch(/roadmap\/phantom/);
  });
});

// ── C2d skill → verb: SUB-ACTION phantom detection (028 codex-02) ──────────────
//
// `documentedPhantomOps` must parse literal `stackctl <verb> <sub>` forms and flag a
// `<sub>` that is NOT a known sub-action of `<verb>` — WITHOUT false-flagging a
// documented positional (`stackctl roadmap add <id>` → `<id>`) or a flag, and without
// flagging a single-action verb's positional.

function sub(name: string, positionals: readonly string[] = []): SubActionDescriptor {
  return { name, description: `${name} desc`, positionals, flags: [], mediationClass: 'mutating' };
}

function multiVerb(verb: string, subs: readonly SubActionDescriptor[]): CommandDescriptor {
  return { verb, description: `${verb} desc`, subActions: subs, flags: [], mediationClass: null, deprecatedAliasOf: null };
}

function singleVerb(verb: string): CommandDescriptor {
  return {
    verb,
    description: `${verb} desc`,
    subActions: [],
    flags: [],
    mediationClass: 'read-only',
    deprecatedAliasOf: null,
  };
}

describe('documentedPhantomOps — verb + sub-action phantoms (028 codex-02)', () => {
  const surface: readonly CommandDescriptor[] = [
    multiVerb('roadmap', [sub('add', ['<id>']), sub('next')]),
    singleVerb('version'),
  ];

  it('flags a stale `stackctl roadmap frobnicate` sub-action as `roadmap/frobnicate`', () => {
    const phantoms = documentedPhantomOps(surface, () => ['Run `stackctl roadmap frobnicate` to do the thing.']);
    expect(phantoms).toContain('roadmap/frobnicate');
  });

  it('does NOT flag a real sub-action `stackctl roadmap next`', () => {
    const phantoms = documentedPhantomOps(surface, () => ['Use `stackctl roadmap next` to find work.']);
    expect(phantoms).not.toContain('roadmap/next');
    expect(phantoms.filter((p) => p.startsWith('roadmap'))).toEqual([]);
  });

  it('does NOT false-flag a documented POSITIONAL `stackctl roadmap add <id>`', () => {
    const phantoms = documentedPhantomOps(surface, () => ['`stackctl roadmap add <id>` adds a node.']);
    // `<id>` is the positional after the real `add` sub-action — never a phantom sub-action.
    expect(phantoms).not.toContain('roadmap/<id>');
    expect(phantoms.some((p) => p.includes('id'))).toBe(false);
  });

  it('does NOT false-flag a FLAG after a verb `stackctl roadmap --json`', () => {
    const phantoms = documentedPhantomOps(surface, () => ['`stackctl roadmap --json` prints json.']);
    expect(phantoms.some((p) => p.includes('json'))).toBe(false);
  });

  it('does NOT treat a single-action verb\'s positional as a sub-action `stackctl version 1.2.3`', () => {
    const phantoms = documentedPhantomOps(surface, () => ['`stackctl version 1.2.3` (a positional, not a sub-action).']);
    expect(phantoms.some((p) => p.startsWith('version'))).toBe(false);
  });

  it('still flags a wholly-unknown VERB `stackctl frobnicate`', () => {
    const phantoms = documentedPhantomOps(surface, () => ['`stackctl frobnicate` is not a verb.']);
    expect(phantoms).toContain('frobnicate');
  });
});
