// 028 US4 (T100/T102; FR-030/050/051; contracts/fronted-operations-registry.md R1–R4).
//
// The fronted-operations registry: the DERIVED ground truth of operations that must
// be fronted, discoverable, and (where mutating) mediated. It is the surface
// `check-front-door` quantifies over. Two composed sources:
//
//   1. The command surface (`buildCommandSurface()`) → one `command-tree` entry per
//      FRONTED verb/sub-action. A verb is fronted iff a matching `/stack-control:*`
//      skill exists (verb name === `skills/<name>/SKILL.md` frontmatter `name`). A
//      verb with no matching skill is an OPERATOR/INTERNAL tool OUTSIDE the fronted
//      invariant — mirroring how `CAPABILITY_REGISTRY` keeps scope-discovery /
//      audit-barrage / roadmap outside its v1 invariant (registry.ts). This is a
//      documented derivation, NOT a silent omission: a deprecated alias is excluded
//      via `deprecatedAliasOf`; every remaining verb either resolves to a skill or is
//      a known operator tool.
//
//   2. `CAPABILITY_REGISTRY` → one `skill-declaration` entry per capability interface
//      that fronts in-session `/speckit-*` ops (e.g. `spec-definition`,
//      `spec-execution`) — the SAME declarations 026 mediation uses (FR-051). These
//      are mutating (capabilities front state-bearing backend drives).
//
// INVARIANT (FR-030): the registry is BUILT on every call from these sources. There
// is NO `fronted-operations.yaml`. Mutating the command tree changes the built
// registry with no manifest edit (proven by the T099 test).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCommandSurface, type CommandDescriptor, type MediationClass } from '../cli-help/command-surface.js';
import { CAPABILITY_REGISTRY, type CapabilityRegistry } from './registry.js';

/** Where a registry entry was derived from (data-model §2). */
export type OperationSource = 'command-tree' | 'skill-declaration';

/** A derived fronted-operation entry (data-model §2; contract R2). */
export interface FrontedOperation {
  /** verb, "verb/sub-action", OR a skill-declared capability id (e.g. "spec-execution"). */
  readonly operationId: string;
  /** The sanctioned /stack-control:* skill fronting it (frontmatter `name`). Non-empty. */
  readonly requiredSkill: string;
  /** Copied from the descriptor (command-tree) / capability (skill-declaration). */
  readonly mediationClass: MediationClass;
  /** Does `verb [sub] --help` exit 0 with usage? (Resolved live by check-front-door's
   *  C2b probe; the registry records the discoverability state it last observed; the
   *  builder defaults true and C2b re-probes — the registry never claims a help state
   *  it did not derive.) */
  readonly hasHelp: boolean;
  readonly source: OperationSource;
}

/** The built registry (data-model §2). */
export interface FrontedOperationsRegistry {
  readonly id: string;
  readonly operations: readonly FrontedOperation[];
}

/** Injectable seams (keep the builder pure + testable). All optional — production
 *  call supplies none and the registry derives from the live sources. */
export interface FrontedOperationsDeps {
  /** Override the command surface (tests inject a fixture). */
  readonly surface?: readonly CommandDescriptor[];
  /** Override the capability registry. */
  readonly capabilityRegistry?: CapabilityRegistry;
  /** Resolve a verb's required skill, or null when the verb is not fronted (operator
   *  tool). Default: match by name against the live `skills/` directory. */
  readonly requiredSkillFor?: (verb: string) => string | null;
}

const REGISTRY_ID = 'stack-control-fronted-operations-v1';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');

/** Read a SKILL.md's frontmatter `name:` (the skill's declared id), or undefined. */
function frontmatterName(skillMdPath: string): string | undefined {
  const src = readFileSync(skillMdPath, 'utf8');
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match?.[1];
  if (frontmatter === undefined) return undefined;
  const nameLine = frontmatter.split(/\r?\n/).find((line) => /^name:\s*/.test(line));
  if (nameLine === undefined) return undefined;
  return nameLine.replace(/^name:\s*/, '').trim().replace(/^["']|["']$/g, '');
}

/** The set of declared skill `name`s present on disk (frontmatter, not just dir name). */
function liveSkillNames(): ReadonlySet<string> {
  if (!existsSync(SKILLS_DIR)) return new Set();
  const names = new Set<string>();
  for (const dir of readdirSync(SKILLS_DIR)) {
    const skillMd = join(SKILLS_DIR, dir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    const name = frontmatterName(skillMd);
    if (name !== undefined && name.length > 0) names.add(name);
  }
  return names;
}

/** Default requiredSkill resolver: a verb is fronted iff a `/stack-control:*` skill
 *  whose frontmatter `name` equals the verb name exists. Returns the skill name or
 *  null (not fronted — an operator/internal tool, outside the registry). */
function defaultRequiredSkillFor(skills: ReadonlySet<string>): (verb: string) => string | null {
  return (verb: string): string | null => (skills.has(verb) ? verb : null);
}

/** The capability id a skill name fronts in-session, used to resolve a
 *  skill-declaration entry's `requiredSkill`: the FIRST interface skill of the
 *  capability (`stack-control:execute` → `execute`). */
function skillForCapabilityInterface(iface: string): string {
  const prefix = 'stack-control:';
  return iface.startsWith(prefix) ? iface.slice(prefix.length) : iface;
}

/** Build the command-tree entries from the command surface. A multi-action verb
 *  contributes one entry per sub-action (operationId `verb/sub`); a single-action
 *  verb contributes one entry (operationId `verb`). A deprecated alias is excluded
 *  (it is a documented alias, not a distinct fronted op). A verb with no matching
 *  skill is excluded (operator/internal tool, outside the fronted invariant). */
function commandTreeEntries(
  surface: readonly CommandDescriptor[],
  requiredSkillFor: (verb: string) => string | null,
): FrontedOperation[] {
  const entries: FrontedOperation[] = [];
  for (const verb of surface) {
    if (verb.deprecatedAliasOf !== null) continue; // a documented alias, not a fronted op
    const skill = requiredSkillFor(verb.verb);
    if (skill === null) continue; // operator/internal tool — outside the fronted invariant
    if (verb.subActions.length === 0) {
      const cls = verb.mediationClass;
      if (cls === null) {
        throw new Error(
          `fronted-operations: single-action verb '${verb.verb}' has a null mediationClass ` +
            `(the command surface guarantees a class on single-action verbs — Decision 4)`,
        );
      }
      entries.push({
        operationId: verb.verb,
        requiredSkill: skill,
        mediationClass: cls,
        hasHelp: true,
        source: 'command-tree',
      });
      continue;
    }
    for (const sub of verb.subActions) {
      entries.push({
        operationId: `${verb.verb}/${sub.name}`,
        requiredSkill: skill,
        mediationClass: sub.mediationClass,
        hasHelp: true,
        source: 'command-tree',
      });
    }
  }
  return entries;
}

/** Build the skill-declaration entries from the capability registry — one per
 *  capability (operationId = capability id, mutating, fronted by the first interface
 *  skill). Enumerates in-session /speckit-* ops that are NOT verbs (FR-051). */
function skillDeclarationEntries(registry: CapabilityRegistry): FrontedOperation[] {
  const entries: FrontedOperation[] = [];
  for (const cap of registry.capabilities) {
    const firstInterface = cap.interface[0];
    if (firstInterface === undefined) {
      throw new Error(
        `fronted-operations: capability '${cap.id}' has an empty interface ` +
          `(validateRegistry should have caught this — registry.ts)`,
      );
    }
    entries.push({
      operationId: cap.id,
      requiredSkill: skillForCapabilityInterface(firstInterface),
      mediationClass: 'mutating',
      hasHelp: true,
      source: 'skill-declaration',
    });
  }
  return entries;
}

/**
 * Build the fronted-operations registry from the command surface + capability
 * registry. Built, never stored (FR-030). Idempotent and pure given its deps.
 */
export function buildFrontedOperationsRegistry(deps: FrontedOperationsDeps = {}): FrontedOperationsRegistry {
  const surface = deps.surface ?? buildCommandSurface();
  const capabilityRegistry = deps.capabilityRegistry ?? CAPABILITY_REGISTRY;
  const requiredSkillFor = deps.requiredSkillFor ?? defaultRequiredSkillFor(liveSkillNames());
  const operations: FrontedOperation[] = [
    ...commandTreeEntries(surface, requiredSkillFor),
    ...skillDeclarationEntries(capabilityRegistry),
  ];
  return { id: REGISTRY_ID, operations };
}
