// 028 US4 (T107; FR-031/032/033; contracts/check-front-door.md C1–C3; SC-006).
//
// `stackctl check-front-door [--json]` — the mechanical guard that prevents the front
// door from silently regressing. It reads the fronted-operations registry (derived
// from the command tree + capability declarations) and asserts the FOUR contract
// invariants over every registered operation:
//
//   C2a — Skill exists.            The op's requiredSkill resolves to skills/<name>/SKILL.md.
//   C2b — Working --help.          `verb [sub] --help` exits 0 with a usage body.
//   C2c — Mutating ops mediated.   A mutating op that is a FRONTED BACKEND (its identity
//                                  is claimed in CAPABILITY_REGISTRY backend identities)
//                                  must be genuinely covered by the registry; a first-class
//                                  non-backend verb is mediation-N/A; a skill-declaration
//                                  capability is verified in the registry (read-only exempt).
//   C2d — skill↔verb parity.       Every fronted verb is documented AND every documented
//                                  verb exists in the tree (both directions).
//
// Exit 0 on a clean surface; exit non-zero NAMING each specific gap (never a silent
// pass on a gap — Principle V / FR-030 no-fallbacks). A deprecated alias is not a gap
// (excluded from the registry already). The pure `checkFrontDoor(deps)` is the unit
// under test (fixture-injectable); `runCheckFrontDoorCli` wires the live seams.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildCommandSurface, type CommandDescriptor } from '../cli-help/command-surface.js';
import {
  buildFrontedOperationsRegistry,
  type FrontedOperation,
  type FrontedOperationsRegistry,
} from '../capability/fronted-operations.js';
import {
  CAPABILITY_REGISTRY,
  findCapabilityByIdentity,
  type CapabilityRegistry,
} from '../capability/registry.js';
import { frontmatterName } from '../skills/frontmatter.js';

/** Re-exported so tests can construct a minimal fixture registry. */
export type CheckRegistry = FrontedOperationsRegistry;

/** Injectable seams — every side-effecting dependency is a function so the four
 *  assertions are unit-testable with fixtures and live-wired in the CLI. */
export interface CheckFrontDoorDeps {
  readonly registry: CheckRegistry;
  /** C2a: does skills/<name>/SKILL.md exist for this skill name? Defaults to the
   *  live on-disk check (skills/<name>/SKILL.md or a matching frontmatter name). */
  readonly skillExists?: (skillName: string) => boolean;
  /** C2b: does `verb [sub] --help` exit 0 with a usage body? Keyed by operationId. */
  readonly helpProbe: (op: FrontedOperation) => boolean;
  /** C2c: is this MUTATING op mediation-registered? (read-only ops are not asked.) */
  readonly mediationRegistered: (op: FrontedOperation) => boolean;
  /** C2d skill → verb: the verb/sub operationIds the shipped skills document. */
  readonly verbsDocumentedBySkills: () => ReadonlySet<string>;
  /** C2d verb → skill: the verb/sub operationIds the live command tree exposes. */
  readonly liveVerbSubActions: () => ReadonlySet<string>;
}

export interface CheckFrontDoorResult {
  readonly ok: boolean;
  readonly gaps: readonly string[];
  readonly checked: number;
}

/** The four assertions over the registry. Pure given its deps. */
export function checkFrontDoor(deps: CheckFrontDoorDeps): CheckFrontDoorResult {
  const gaps: string[] = [];
  const { registry } = deps;
  const skillExists = deps.skillExists ?? liveSkillExists;

  for (const op of registry.operations) {
    // C2a — skill exists.
    if (!skillExists(op.requiredSkill)) {
      gaps.push(
        `C2a skill-exists: operation '${op.operationId}' requires skill ` +
          `'${op.requiredSkill}' but skills/${op.requiredSkill}/SKILL.md is missing.`,
      );
    }
    // C2b — working --help.
    if (!deps.helpProbe(op)) {
      gaps.push(
        `C2b working-help: operation '${op.operationId}' --help does not exit 0 with a usage body.`,
      );
    }
    // C2c — mutating ops mediation-registered (read-only exempt, FR-050).
    if (op.mediationClass === 'mutating' && !deps.mediationRegistered(op)) {
      gaps.push(
        `C2c mediation-registered: mutating operation '${op.operationId}' has no mediation ` +
          `registration (not in the capability registry's backend identities and not a ` +
          `marker-bracketed fronted op).`,
      );
    }
  }

  // C2d — skill↔verb parity, both directions (command-tree ops only — skill-declaration
  // ops are capability ids, not verbs the command tree exposes).
  const documented = deps.verbsDocumentedBySkills();
  const live = deps.liveVerbSubActions();
  for (const op of registry.operations) {
    if (op.source !== 'command-tree') continue;
    if (!documented.has(op.operationId)) {
      gaps.push(
        `C2d parity (verb → skill): fronted operation '${op.operationId}' is documented by no skill.`,
      );
    }
  }
  for (const documentedOp of documented) {
    if (!live.has(documentedOp)) {
      gaps.push(
        `C2d parity (skill → verb): a skill documents '${documentedOp}' but the command ` +
          `tree exposes no such verb/sub-action.`,
      );
    }
  }

  return { ok: gaps.length === 0, gaps, checked: registry.operations.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live seams (CLI wiring).

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');
const CLI = join(PLUGIN_ROOT, 'src', 'cli.ts');

/** C2a live: the skill exists when skills/<name>/SKILL.md whose frontmatter `name`
 *  equals the requested name is on disk. */
function liveSkillExists(skillName: string): boolean {
  const direct = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (existsSync(direct)) return true;
  // Tolerate a skill dir whose name differs from its frontmatter name.
  if (!existsSync(SKILLS_DIR)) return false;
  for (const dir of readdirSync(SKILLS_DIR)) {
    const skillMd = join(SKILLS_DIR, dir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    if (frontmatterName(skillMd) === skillName) return true;
  }
  return false;
}

function resolveTsx(): string {
  let cur = PLUGIN_ROOT;
  for (;;) {
    const candidate = join(cur, 'node_modules', '.bin', 'tsx');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`check-front-door: could not locate node_modules/.bin/tsx from ${PLUGIN_ROOT}`);
}

/** C2b live: spawn `stackctl <verb> [sub] --help` and assert exit 0 with a line-anchored
 *  `Usage:` body on stdout (the descriptor renderer's header). A skill-declaration op
 *  (capability id, not a verb) is exempt — its discoverability is the skill, not --help. */
function liveHelpProbe(tsx: string): (op: FrontedOperation) => boolean {
  return (op: FrontedOperation): boolean => {
    if (op.source !== 'command-tree') return true;
    const parts = op.operationId.split('/');
    const verb = parts[0] ?? op.operationId;
    const sub = parts[1];
    const args = sub !== undefined ? [CLI, verb, sub, '--help'] : [CLI, verb, '--help'];
    const r = spawnSync(tsx, args, { encoding: 'utf8' });
    return r.status === 0 && /^usage:/im.test(r.stdout ?? '');
  };
}

/**
 * C2c live: is this MUTATING op genuinely covered by the mediation source of truth?
 * This reads a REAL signal (the registry's derived `isFrontedBackend` + the capability
 * registry's backend identities), NOT the tautological `requiredSkill.length > 0` — a
 * command-tree entry ALWAYS has a non-empty requiredSkill by construction, so that
 * predicate could never flag a mutating op (the vacuity this fix removes).
 *
 * The three classes (contract C2c):
 *
 *  1. Command-tree op that IS a fronted backend (`isFrontedBackend === true`) — its verb
 *     is claimed by a capability as a `cliArgv0` backend identity (today: `backlog`). It
 *     is reach-around-able, so it MUST be genuinely covered: verify the verb resolves to a
 *     capability via the registry's bash-surface lookup (the SAME source of truth the 026
 *     interceptor uses). A verb NAMED as a backend identity but not actually findable →
 *     gap (impossible with a consistent registry, but the assertion is now non-vacuous).
 *
 *  2. Command-tree op that is NOT a fronted backend (`isFrontedBackend === false`) — a
 *     first-class stackctl verb (roadmap, inbox, scope-*): no capability claims it as a
 *     reach-around-able backend, so mediation is N/A → conformant (a verb you reach only
 *     through `stackctl` cannot be reached around).
 *
 *  3. Skill-declaration op (a capability id) — verify the capability has a non-empty
 *     backend-identity union (validateRegistry guarantees this; re-asserted here).
 */
export function mediationRegisteredAgainst(registry: CapabilityRegistry): (op: FrontedOperation) => boolean {
  return (op: FrontedOperation): boolean => {
    if (op.source === 'command-tree') {
      if (!op.isFrontedBackend) return true; // first-class verb — mediation N/A (class 2)
      // Class 1: it is named as a backend identity — verify it is genuinely covered.
      const verb = op.operationId.split('/')[0] ?? op.operationId;
      return findCapabilityByIdentity(registry, 'bash', verb) !== null;
    }
    // Class 3: a skill-declaration capability id.
    const cap = registry.capabilities.find((c) => c.id === op.operationId);
    if (cap === undefined) return false;
    return cap.backendIdentities.skills.length + cap.backendIdentities.cliArgv0.length > 0;
  };
}

/** Live C2c wiring against the production `CAPABILITY_REGISTRY`. */
const liveMediationRegistered = mediationRegisteredAgainst(CAPABILITY_REGISTRY);

/** C2d live (verb → skill side feeds documented; skill → verb side feeds live):
 *  the operationIds the live command tree exposes (verb + verb/sub). */
function liveOperationIds(surface: readonly CommandDescriptor[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const verb of surface) {
    if (verb.deprecatedAliasOf !== null) continue;
    if (verb.subActions.length === 0) {
      ids.add(verb.verb);
    } else {
      for (const sub of verb.subActions) ids.add(`${verb.verb}/${sub.name}`);
    }
  }
  return ids;
}

/** The body text of the skill named after a verb (its frontmatter `name` === verb),
 *  or null when no such skill exists. */
function skillBodyForVerb(verb: string): string | null {
  if (!existsSync(SKILLS_DIR)) return null;
  const direct = join(SKILLS_DIR, verb, 'SKILL.md');
  if (existsSync(direct)) return readFileSync(direct, 'utf8');
  for (const dir of readdirSync(SKILLS_DIR)) {
    const skillMd = join(SKILLS_DIR, dir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    if (frontmatterName(skillMd) === verb) return readFileSync(skillMd, 'utf8');
  }
  return null;
}

/** Does `body` mention `token` as a whole word? Used to decide whether a skill
 *  documents a sub-action (skills name sub-actions in prose / tables / code blocks,
 *  not only in `stackctl <verb> <sub>` form). */
function mentionsWord(body: string, token: string): boolean {
  // word-boundary on both sides; tolerate the kebab tokens we use (`add-edge`).
  return new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?![\\w-])`).test(body);
}

/**
 * C2d live: the verb/sub operationIds the shipped skills document, computed
 * per-operation against the LIVE command surface so the granularity is exact:
 *   - a single-action fronted verb is documented when the skill named after it exists;
 *   - a multi-action op `verb/sub` is documented when the skill named after `verb`
 *     exists AND its body mentions the sub-action name as a word.
 * This avoids the false negatives of requiring a `stackctl <verb> <sub>` literal (skills
 * document sub-actions in prose/tables) and the false positives of treating a positional
 * (`stackctl customize scope-discovery <name>` → `scope-discovery`) as a sub-action.
 *
 * The skill → verb direction is checked by the caller against `liveOperationIds`; this
 * set is BOUNDED to real fronted operationIds, so a phantom token a skill mentions never
 * leaks in as a false skill→verb gap — the contract's skill→verb gap is surfaced by the
 * separate `documentedPhantomOps` probe below.
 */
function liveVerbsDocumentedBySkills(surface: readonly CommandDescriptor[]): () => ReadonlySet<string> {
  return (): ReadonlySet<string> => {
    const documented = new Set<string>();
    for (const verb of surface) {
      if (verb.deprecatedAliasOf !== null) continue;
      const body = skillBodyForVerb(verb.verb);
      if (body === null) continue; // no skill → C2d verb→skill gap surfaced by liveOperationIds
      if (verb.subActions.length === 0) {
        documented.add(verb.verb);
      } else {
        for (const sub of verb.subActions) {
          if (mentionsWord(body, sub.name)) documented.add(`${verb.verb}/${sub.name}`);
        }
      }
    }
    return documented;
  };
}

/** Is `token` a documented POSITIONAL placeholder (`<id>` / `[identifier]`) rather than
 *  a literal sub-action token? Positionals are bracketed in skill prose. */
function isPositionalPlaceholder(token: string): boolean {
  return /^[<[].*[>\]]$/.test(token);
}

/** Is `token` a flag (`--json`, `-d`) rather than a verb/sub-action token? */
function isFlagToken(token: string): boolean {
  return token.startsWith('-');
}

/** The literal `stackctl <verb> [<sub>]` invocations in a skill body. Each match
 *  captures the verb token and the FOLLOWING token (sub-action position), if any.
 *  Tokens are the whitespace-delimited words after `stackctl`. */
interface DocumentedInvocation {
  readonly verb: string;
  /** The token in the sub-action position (the next word), or null when none follows. */
  readonly next: string | null;
}

/** Extract every `stackctl <verb> [<next>]` invocation from a body. The verb token
 *  requires ≥3 leading lowercase chars (kebab tail allowed) so 2-char prose words
 *  (`stackctl to verify`) are not mistaken for verbs (028 claude-04). The `next` token
 *  is one of the three shapes that can follow a verb in documented prose — a sub-action
 *  (`[a-z]…`), a flag (`-…`), or a bracketed positional (`<id>` / `[id]`) — captured
 *  with its own delimiters so trailing markdown punctuation (backticks, periods,
 *  parens) is never folded into the token. A `next` of any OTHER shape (a quoted value,
 *  a version literal like `1.2.3`, prose) is not a command token → recorded as null so
 *  it is never mistaken for a phantom sub-action. */
function documentedInvocations(body: string): DocumentedInvocation[] {
  const invocations: DocumentedInvocation[] = [];
  const verbToken = '[a-z]{3,}(?:-[a-z]+)*';
  // a sub-action token | a flag | a bracketed positional placeholder.
  const nextToken = '([a-z][a-z0-9]*(?:-[a-z0-9]+)*|--?[a-z][a-z0-9-]*|[<[][^>\\]]+[>\\]])';
  const re = new RegExp(`\\bstackctl\\s+(${verbToken})(?:\\s+${nextToken})?`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const verb = m[1];
    if (verb === undefined) continue;
    invocations.push({ verb, next: m[2] ?? null });
  }
  return invocations;
}

/**
 * C2d skill → verb direction (028 codex-02): a skill INVOKING a literal `stackctl …`
 * form the live command tree does NOT expose. Two phantom shapes, both high-signal
 * (a documented invocation that would fail at runtime):
 *
 *   1. PHANTOM VERB — `stackctl <verb>` where `<verb>` is not in the command tree.
 *      Returned as `<verb>`.
 *   2. PHANTOM SUB-ACTION — `stackctl <verb> <sub>` where `<verb>` is a MULTI-action
 *      verb but `<sub>` is not one of its known sub-action names. Returned as
 *      `<verb>/<sub>` so it flows through the same `documented − live` gap path and
 *      names the gap as `<verb>/<sub>`.
 *
 * False-positive guards (so legitimate documentation is NOT flagged):
 *   - A documented POSITIONAL (`stackctl roadmap add <id>` → `<id>`) is bracketed →
 *     never a sub-action token. (`add`, the real sub-action, occupies the sub-action
 *     position; `<id>` is the position AFTER it, which this scan does not treat as a
 *     sub-action.)
 *   - A FLAG (`stackctl roadmap --json`) starts with `-` → not a sub-action.
 *   - A SINGLE-action verb (`stackctl version 1.2.3`) has NO sub-actions, so its next
 *     token is a positional/arg — never flagged as a phantom sub-action.
 *
 * Pure + injectable: `skillBodies` supplies the skill SKILL.md bodies (the live caller
 * reads them from disk; tests inject fixtures), so the parser is unit-testable.
 */
export function documentedPhantomOps(
  surface: readonly CommandDescriptor[],
  skillBodies: () => readonly string[],
): readonly string[] {
  const byVerb = new Map<string, CommandDescriptor>(surface.map((v) => [v.verb, v]));
  const phantoms = new Set<string>();
  for (const body of skillBodies()) {
    for (const { verb, next } of documentedInvocations(body)) {
      const descriptor = byVerb.get(verb);
      if (descriptor === undefined) {
        phantoms.add(verb); // shape 1 — phantom verb
        continue;
      }
      // shape 2 — phantom sub-action (multi-action verbs only).
      if (descriptor.subActions.length === 0) continue; // single-action: next is a positional
      if (next === null || isFlagToken(next) || isPositionalPlaceholder(next)) continue;
      const knownSubs = new Set(descriptor.subActions.map((s) => s.name));
      if (!knownSubs.has(next)) phantoms.add(`${verb}/${next}`);
    }
  }
  return [...phantoms];
}

/** The bodies of every shipped SKILL.md (the live skill-body source for C2d). */
function liveSkillBodies(): readonly string[] {
  if (!existsSync(SKILLS_DIR)) return [];
  const bodies: string[] = [];
  for (const dir of readdirSync(SKILLS_DIR)) {
    const skillMd = join(SKILLS_DIR, dir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    bodies.push(readFileSync(skillMd, 'utf8'));
  }
  return bodies;
}

/** Build the live deps for the CLI run. */
function liveDeps(): CheckFrontDoorDeps {
  const registry = buildFrontedOperationsRegistry();
  const surface = buildCommandSurface();
  const liveIds = liveOperationIds(surface);
  const phantoms = documentedPhantomOps(surface, liveSkillBodies);
  // Feed phantom verbs + phantom sub-actions into the documented set so the caller's
  // skill→verb check (documented − live) surfaces them as gaps.
  const documented = liveVerbsDocumentedBySkills(surface);
  const tsx = resolveTsx();
  return {
    registry,
    skillExists: liveSkillExists,
    helpProbe: liveHelpProbe(tsx),
    mediationRegistered: liveMediationRegistered,
    verbsDocumentedBySkills: () => new Set([...documented(), ...phantoms]),
    liveVerbSubActions: () => liveIds,
  };
}

/** Run the four assertions against the LIVE surface (the same deps the CLI uses).
 *  Exposed so the doctor rule + smoke can reuse the exact production check. */
export function runLiveCheckFrontDoor(): CheckFrontDoorResult {
  return checkFrontDoor(liveDeps());
}

/** CLI entry: `stackctl check-front-door [--json]`. */
export async function runCheckFrontDoorCli(args: readonly string[]): Promise<void> {
  const json = args.includes('--json');
  const unknown = args.find((a) => a !== '--json');
  if (unknown !== undefined) {
    process.stderr.write(`check-front-door: unexpected argument '${unknown}'\n`);
    process.stderr.write('Usage: stackctl check-front-door [--json]\n');
    process.exit(2);
  }
  const result = checkFrontDoor(liveDeps());
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `check-front-door: OK — ${result.checked} fronted operation(s) pass all four assertions.\n`,
    );
  } else {
    process.stderr.write(
      `check-front-door: ${result.gaps.length} gap(s) across ${result.checked} fronted operation(s):\n`,
    );
    for (const gap of result.gaps) process.stderr.write(`  - ${gap}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}
