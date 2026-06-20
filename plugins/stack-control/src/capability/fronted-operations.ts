// 028 US4 (T100/T102; FR-030/050/051; contracts/fronted-operations-registry.md R1–R4).
//
// The fronted-operations registry: the DERIVED ground truth of operations that must
// be fronted, discoverable, and (where mutating) mediated. It is the surface
// `check-front-door` quantifies over. Two composed sources:
//
//   1. The command surface (`buildCommandSurface()`) → one `command-tree` entry per
//      FRONTED verb/sub-action. A verb is fronted-BY-CONVENTION: every non-alias
//      command-surface verb requires a skill (verb name === `skills/<verb>/SKILL.md`)
//      UNLESS it is a DECLARED-INTERNAL verb (the `INTERNAL_VERBS` set — version /
//      govern / mediate-check / audit-barrage / scope-* internals, …), which is an
//      OPERATOR/INTERNAL tool OUTSIDE the fronted invariant. Crucially the fronted set
//      is STABLE: a fronted verb's op is included with its convention requiredSkill
//      REGARDLESS of whether the skill file currently exists, so deleting a skill is
//      reported by C2a (file-existence probe) rather than silently dropping the op from
//      the registry (028 codex-01). Mirrors how `CAPABILITY_REGISTRY` keeps
//      scope-discovery / audit-barrage / roadmap outside its v1 invariant (registry.ts).
//      A documented derivation, NOT a silent omission: a deprecated alias is excluded
//      via `deprecatedAliasOf`; every remaining verb is fronted-by-convention or a
//      declared-internal tool.
//
//   2. `CAPABILITY_REGISTRY` → one `skill-declaration` entry per capability interface
//      that fronts in-session `/speckit-*` ops (e.g. `spec-definition`,
//      `spec-execution`) — the SAME declarations 026 mediation uses (FR-051). These
//      are mutating (capabilities front state-bearing backend drives).
//
// INVARIANT (FR-030): the registry is BUILT on every call from these sources. There
// is NO `fronted-operations.yaml`. Mutating the command tree changes the built
// registry with no manifest edit (proven by the T099 test).

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
  /**
   * Is this operation's identity claimed as a FRONTED BACKEND by a capability —
   * i.e. an identity the 026 interceptor mediates (the operation is reach-around-able
   * and so MUST be genuinely covered by the capability registry)?
   *
   *  - command-tree: true iff the verb (first segment of operationId) is in the union
   *    of `CAPABILITY_REGISTRY` `cliArgv0` backend identities (today: `backlog`). A
   *    first-class stackctl verb that no capability claims as a backend (roadmap, inbox,
   *    scope-*) is `false` — it is NOT interceptor-mediated, and (per contract C2c) its
   *    mediation is N/A: a verb you reach only through `stackctl` is not reach-around-able.
   *  - skill-declaration: true (a capability entry IS a fronted backend — its
   *    `/speckit-*` skills are the mediated identities).
   *
   * This is the REAL signal C2c reads (replacing the vacuous `requiredSkill.length > 0`):
   * a `true` value asserts the op must be genuinely covered by the registry; a `false`
   * value asserts mediation is N/A for this first-class verb.
   */
  readonly isFrontedBackend: boolean;
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
   *  tool). Default: `conventionRequiredSkillFor` — a verb is fronted-by-convention
   *  (requiredSkill === verb name) unless it is a declared-internal verb. This does NOT
   *  consult the filesystem, so the fronted op set is STABLE against a deleted skill and
   *  C2a can report the absence (028 codex-01). */
  readonly requiredSkillFor?: (verb: string) => string | null;
}

const REGISTRY_ID = 'stack-control-fronted-operations-v1';

/** The union of every capability's `cliArgv0` backend identities — the verbs the 026
 *  interceptor mediates as fronted BACKENDS (today: `backlog`). A command-tree verb in
 *  this set is reach-around-able and so MUST be genuinely covered; a verb NOT in it is a
 *  first-class stackctl verb whose mediation is N/A (contract C2c). */
function backendVerbIdentities(registry: CapabilityRegistry): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const cap of registry.capabilities) {
    for (const argv0 of cap.backendIdentities.cliArgv0) ids.add(argv0);
  }
  return ids;
}

/**
 * Declared operator/internal/CLI verbs that are OUTSIDE the fronted invariant — they
 * have NO `/stack-control:*` front-door skill BY DESIGN (`version`, `govern`,
 * `mediate-check`, `intercept`, `audit-barrage*`, `scope-*` internals, release/spec
 * tooling, etc.). This set is the STABLE, file-independent boundary between fronted
 * verbs and internal tools (028 codex-01): a verb is fronted-by-convention iff it is
 * a non-alias command-surface verb NOT in this set, and a fronted verb's
 * `requiredSkill` is its name by convention (verb → `skills/<verb>/SKILL.md`) —
 * derived REGARDLESS of whether the file currently exists. That stability is what lets
 * C2a report a DELETED skill: removing `skills/roadmap/SKILL.md` no longer drops
 * roadmap's ops from the registry; the ops remain (bound to `requiredSkill: 'roadmap'`)
 * and C2a's on-disk existence probe fails loud. Conversely, an internal verb here never
 * becomes a false missing-skill gap.
 *
 * Mirrors how `CAPABILITY_REGISTRY` keeps scope-discovery / audit-barrage / roadmap
 * outside its v1 invariant: a documented derivation, not a silent omission. Adding a
 * new internal verb is one entry here; adding a fronted verb requires no edit (it is
 * fronted by convention and C2a enforces its skill).
 */
const INTERNAL_VERBS: ReadonlySet<string> = new Set([
  'version',
  'govern',
  'mediate-check',
  'intercept',
  'audit-barrage',
  'audit-barrage-lift',
  'audit-barrage-render',
  'capability',
  'config-domain',
  'execute-check',
  'front-door',
  'no-shortcuts-audit',
  'release-check',
  'release-helper',
  'slush-findings',
  'spec-check',
  'spec-governance-gate',
  'validate-return',
  'workflow',
  'wrap-prompt',
]);

/**
 * The DEFAULT (production) requiredSkill resolver: a verb is fronted iff it is NOT a
 * declared-internal verb, and a fronted verb's required skill is its name BY CONVENTION
 * (verb → `skills/<verb>/SKILL.md`). This deliberately does NOT consult the filesystem
 * — that is the fix for codex-01: the fronted, skill-requiring op set is STABLE against
 * a deleted/renamed skill file, so C2a (which checks file existence) can report the
 * absence instead of the op silently vanishing from the registry. Returns the
 * convention skill name, or null for a declared-internal/operator tool (outside the
 * fronted invariant — must never become a C2a gap).
 */
export function conventionRequiredSkillFor(verb: string): string | null {
  return INTERNAL_VERBS.has(verb) ? null : verb;
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
 *  (it is a documented alias, not a distinct fronted op). A DECLARED-INTERNAL verb is
 *  excluded (operator/internal tool, outside the fronted invariant). A fronted verb's
 *  requiredSkill is its convention skill name — included REGARDLESS of whether the
 *  skill file exists (the stable set codex-01 requires, so C2a can flag a deleted
 *  skill rather than the op silently vanishing). */
function commandTreeEntries(
  surface: readonly CommandDescriptor[],
  requiredSkillFor: (verb: string) => string | null,
  backendVerbs: ReadonlySet<string>,
): FrontedOperation[] {
  const entries: FrontedOperation[] = [];
  for (const verb of surface) {
    if (verb.deprecatedAliasOf !== null) continue; // a documented alias, not a fronted op
    const skill = requiredSkillFor(verb.verb);
    if (skill === null) continue; // declared-internal/operator tool — outside the fronted invariant
    // The verb is a fronted backend iff a capability claims its argv0 as a backend
    // identity (today: `backlog`). Other mutating verbs (roadmap, inbox, …) are
    // first-class — not interceptor-mediated — so mediation is N/A for them (C2c).
    const isFrontedBackend = backendVerbs.has(verb.verb);
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
        isFrontedBackend,
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
        isFrontedBackend,
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
      // A capability entry IS a fronted backend — its `/speckit-*` skills (or cliArgv0)
      // are the mediated identities; C2c verifies it against the capability registry.
      isFrontedBackend: true,
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
  const requiredSkillFor = deps.requiredSkillFor ?? conventionRequiredSkillFor;
  const backendVerbs = backendVerbIdentities(capabilityRegistry);
  const operations: FrontedOperation[] = [
    ...commandTreeEntries(surface, requiredSkillFor, backendVerbs),
    ...skillDeclarationEntries(capabilityRegistry),
  ];
  return { id: REGISTRY_ID, operations };
}
