// 028 T097 (US3) — RED: a shipped SKILL.md marker example must AUTHORIZE the backend
// call it illustrates (FR-026; contract T6).
//
// Each capability-interface skill documents a `front-door enter --capability <id>` block
// and drives a specific backend (a CLI argv0 or a speckit skill). This test reads the
// documented `--capability` from each skill's marker block, feeds it to the decision core
// as the active set, and asserts the illustrated backend call is PERMITTED. A skill whose
// example names a capability that does not authorize the backend it drives fails here —
// the documentation would teach an agent a marker that gets refused.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decideMediation } from '../../capability/mediate.js';
import { CAPABILITY_REGISTRY, type Surface } from '../../capability/registry.js';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

/** A shipped skill, the backend it drives (the call its marker example illustrates). */
interface SkillIllustration {
  readonly skill: string;
  readonly surface: Surface;
  /** The backend identity the skill drives behind the front door. */
  readonly backend: string;
}

const ILLUSTRATIONS: readonly SkillIllustration[] = [
  { skill: 'backlog', surface: 'bash', backend: 'backlog list' },
  { skill: 'define', surface: 'skill', backend: 'speckit-specify' },
  { skill: 'extend', surface: 'skill', backend: 'speckit-specify' },
  { skill: 'execute', surface: 'skill', backend: 'speckit-implement' },
];

/** Extract the `--capability <id>` named in the skill's `front-door enter` example. */
function documentedCapability(skill: string): string {
  const md = readFileSync(join(PLUGIN_ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
  const m = md.match(/front-door enter --capability (\S+)/);
  if (m === null) throw new Error(`skill '${skill}' has no documented 'front-door enter --capability' example`);
  return m[1]!;
}

describe('shipped SKILL.md marker examples authorize their backend call (028 T097)', () => {
  for (const { skill, surface, backend } of ILLUSTRATIONS) {
    it(`${skill}: the documented marker authorizes its '${backend}' drive`, () => {
      const cap = documentedCapability(skill);
      // The documented capability must be a real registry capability.
      expect(CAPABILITY_REGISTRY.capabilities.some((c) => c.id === cap)).toBe(true);
      // Feeding the documented marker (cap active) to the decision core PERMITS the call.
      const d = decideMediation(CAPABILITY_REGISTRY, surface, backend, new Set([cap]), 'mutating');
      expect(d.verdict).toBe('permit');
      expect(d.capability).toBe(cap);
    });
  }
});
