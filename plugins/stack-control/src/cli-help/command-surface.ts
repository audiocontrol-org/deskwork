// The typed description of the stack-control command surface (028 US1/US4,
// data-model §1; FR-003). Generalizes the `roadmap`-only `SUBACTION_SPECS` +
// `roadmap-help.ts` pattern to ALL verbs.
//
// This module defines the descriptor TYPE CONTRACTS. The surfaces that make
// drift structurally impossible — the commander-tree walker (`buildCommandSurface`),
// the completeness guard, the mediation-class guard, the generic help renderer,
// the verb reference, the descriptor artifact, and the fronted-operations
// registry — are derived FROM these shapes and are defined alongside in this
// directory and in `src/capability/` (each landed behind its own RED test per
// specs/028 tasks T004–T011 / US4). Until those consumers exist these are the
// contracts they build against, not yet a live single source of truth.

/** A flag on a verb or sub-action (derived from the commander option definition). */
export interface FlagDescriptor {
  /** Dashed long form, e.g. "depends-on". */
  readonly name: string;
  /** Short alias without the dash, e.g. "d" for `-d, --depends-on`; null when the
   * commander option declares no short form. The walker populates it from the
   * option's short flag so the renderer can emit the canonical `-d, --depends-on`
   * shape (AUDIT-BARRAGE-claude-03, 028 Phase 1 govern). */
  readonly shortFlag: string | null;
  /** Value placeholder, e.g. "<value>"; null for a boolean flag. */
  readonly arg: string | null;
  /** Whether the flag is mandatory for the operation. */
  readonly required: boolean;
  /** One-line help text. */
  readonly description: string;
}

/** Whether an operation is state-bearing (gated by mediation) or a pure query. */
export type MediationClass = 'mutating' | 'read-only';

/** One sub-action of a multi-action verb (e.g. roadmap `add-edge`). */
export interface SubActionDescriptor {
  /** e.g. "add-edge". */
  readonly name: string;
  /** One-line summary (the `SUMMARIES` analogue). */
  readonly description: string;
  /** The sub-action's positional arguments IN ORDER (e.g. `["<from>", "<to>"]` for
   * a reparent). `[]` when the sub-action takes none. An array, not a single
   * `string | null`, so a multi-positional sub-action is representable rather than
   * silently truncated to its first arg (AUDIT-BARRAGE-claude-01, 028 Phase 1). */
  readonly positionals: readonly string[];
  readonly flags: readonly FlagDescriptor[];
  /** Declared, not inferred from `--apply` (Decision 4). */
  readonly mediationClass: MediationClass;
}

/** One top-level verb (e.g. `roadmap`, `backlog`, `check-front-door`). */
export interface CommandDescriptor {
  /** e.g. "roadmap". */
  readonly verb: string;
  readonly description: string;
  /** [] for a single-action verb. */
  readonly subActions: readonly SubActionDescriptor[];
  /**
   * Verb-level flags for a SINGLE-action verb. For a MULTI-action verb
   * (`subActions.length > 0`) this is `[]` by contract — per-sub-action flags live
   * on each `SubActionDescriptor.flags`. (No current verb has cross-cutting flags
   * shared across all sub-actions; if one is added, a dedicated `sharedFlags` field
   * lands then — the flat-shape vs discriminated-union question is tracked as
   * backlog TASK-300, AUDIT-BARRAGE-claude-02.)
   */
  readonly flags: readonly FlagDescriptor[];
  /**
   * The verb's mediation class for a SINGLE-action verb. For a MULTI-action verb
   * (`subActions.length > 0`) this is `null` — the meaningful class lives on each
   * `SubActionDescriptor.mediationClass`. Typed `| null` (not a default) so the
   * compiler FORCES every consumer to branch: a guard that reads this field
   * without first handling the multi-action `null` case fails to type-check
   * rather than silently classifying a mutating sub-action as read-only
   * (AUDIT-BARRAGE-claude-01, 028 Phase 1 govern).
   */
  readonly mediationClass: MediationClass | null;
  /** e.g. check-editor-symmetry → check-module-symmetry; null when not an alias. */
  readonly deprecatedAliasOf: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The commander-tree walker (T005; FR-003).
//
// `buildCommandSurface()` projects every MOUNTED commander verb into a
// `CommandDescriptor`. Structure (sub-actions, flags, positionals) is DERIVED
// from commander introspection — never a hand-written string — so the descriptor
// cannot drift from what the parser accepts. The declared metadata commander does
// not carry natively (each node's `mediationClass`, Decision 4) comes from a
// per-verb `VerbMetadata`. At this phase only `roadmap` is mounted (the 027
// migration); Phase 3 mounts the remaining families and they appear here for free.

import type { Command, Option } from 'commander';
import { buildRoadmapCommand } from '../subcommands/roadmap-command.js';

/** Declared, non-derivable metadata for a mounted verb (Decision 4). `commander`
 * carries flags/positionals/sub-actions but not the mediation class, so it is
 * declared here per node and projected onto the descriptor. */
export interface VerbMetadata {
  /** This verb is a deprecated alias of the named verb (else null). */
  readonly deprecatedAliasOf: string | null;
  /** Mediation class for a SINGLE-action verb; ignored for a multi-action verb
   * (whose class is per-sub-action via `subActionMediation`). */
  readonly verbMediation?: MediationClass;
  /** Mediation class per sub-action name (multi-action verbs). */
  readonly subActionMediation?: Readonly<Record<string, MediationClass>>;
  /**
   * When true, the verb's positional arguments are SEMANTICALLY required even
   * though commander declares them optional (`[id]`). roadmap does this on
   * purpose — it declares `[identifier]` so its own `requireId` owns the
   * missing-arg error shape (FR-006), but the operation requires the id. Without
   * this the descriptor would render `<verb> [id]` and mislead that the id is
   * optional (AUDIT-BARRAGE-codex-01, Phase 2). Default (undefined/false): trust
   * commander's declared `<req>` / `[opt]` syntax.
   */
  readonly positionalsRequired?: boolean;
}

/** One mounted verb: its live commander `Command` plus the declared metadata.
 * Exported so tests can project a fixture verb through `buildSurfaceFrom`. */
export interface MountedVerb {
  readonly build: () => Command;
  readonly meta: VerbMetadata;
}

/** Declared mediation class per roadmap sub-action (read-only query vs mutating
 * write). Single-sourced here as the roadmap verb's `VerbMetadata`. */
const ROADMAP_SUBACTION_MEDIATION: Readonly<Record<string, MediationClass>> = {
  next: 'read-only',
  blocked: 'read-only',
  blocks: 'read-only',
  order: 'read-only',
  graph: 'read-only',
  reconcile: 'read-only',
  add: 'mutating',
  advance: 'mutating',
  decompose: 'mutating',
  reclassify: 'mutating',
  defer: 'mutating',
  cluster: 'mutating',
  group: 'mutating',
  'close-related': 'mutating',
};

/** The mounted commander verbs. Phase 3 appends each migrated family here. */
const MOUNTED: readonly MountedVerb[] = [
  {
    build: buildRoadmapCommand,
    meta: {
      deprecatedAliasOf: null,
      subActionMediation: ROADMAP_SUBACTION_MEDIATION,
      // roadmap declares `[identifier]` in commander (so requireId owns the
      // error) but every id-taking subaction requires it (AUDIT-BARRAGE-codex-01).
      positionalsRequired: true,
    },
  },
];

/** Extract a flag's value placeholder (`<path>` / `[value]`) from a commander
 * option's flags string, or null for a boolean flag that takes no value. */
function flagArg(option: Option): string | null {
  const match = /([<[][^>\]]+[>\]])/.exec(option.flags);
  return match?.[1] ?? null;
}

/** Project one commander `Option` into a `FlagDescriptor`. */
function projectFlag(option: Option): FlagDescriptor {
  const long = option.long ?? option.flags;
  return {
    // Strip ANY leading dashes: `--long` → `long`, and a short-only option whose
    // fallback is `-v` → `v` (not `-v`) — AUDIT-BARRAGE-claude-04, Phase 2.
    name: long.replace(/^-+/, ''),
    shortFlag: option.short ? option.short.replace(/^-+/, '') : null,
    arg: flagArg(option),
    required: option.mandatory === true,
    description: option.description,
  };
}

/** Flag long-names commander adds to EVERY command as framework implementation
 * detail, not part of the verb's declared API — filtered out of the descriptor so
 * they never pollute help / the verb reference / the mediation guard
 * (AUDIT-BARRAGE-claude-02, Phase 2). */
const FRAMEWORK_FLAGS: ReadonlySet<string> = new Set(['help', 'version']);

/** Project a command's commander options into `FlagDescriptor[]`, dropping the
 * framework-owned `--help` / `--version` options. */
function projectFlags(options: readonly Option[]): FlagDescriptor[] {
  return options
    .filter((o) => !FRAMEWORK_FLAGS.has((o.long ?? '').replace(/^-+/, '')))
    .map(projectFlag);
}

/** Render one commander positional argument preserving its actual syntax: `<req>`
 * vs `[opt]`, and a `...` variadic suffix (AUDIT-BARRAGE-codex-02/claude-01/05).
 * `forceRequired` overrides commander's declared optionality when the verb's
 * metadata declares its positionals semantically required (AUDIT-BARRAGE-codex-01). */
function projectPositional(
  arg: { name: () => string; required: boolean; variadic: boolean },
  forceRequired: boolean,
): string {
  const base = arg.variadic ? `${arg.name()}...` : arg.name();
  return forceRequired || arg.required ? `<${base}>` : `[${base}]`;
}

/** The DECLARED mediation class for a multi-action sub-action, failing loud when a
 * mounted sub-action carries no declaration — class is declared (Decision 4),
 * never inferred from `--apply`, and never a silent default that could mis-classify
 * a mutating write as read-only (AUDIT-BARRAGE-claude-01, Phase 1). */
function requireSubActionMediation(verb: string, name: string, meta: VerbMetadata): MediationClass {
  const cls = meta.subActionMediation?.[name];
  if (cls === undefined) {
    throw new Error(
      `command-surface: sub-action '${verb}/${name}' has no declared mediationClass ` +
        `(declared per Decision 4, never inferred — add it to the verb's subActionMediation)`,
    );
  }
  return cls;
}

/** The DECLARED mediation class for a single-action verb, failing loud when absent. */
function requireVerbMediation(verb: string, meta: VerbMetadata): MediationClass {
  if (meta.verbMediation === undefined) {
    throw new Error(
      `command-surface: single-action verb '${verb}' has no declared mediationClass ` +
        `(declared per Decision 4, never inferred — set the verb's verbMediation)`,
    );
  }
  return meta.verbMediation;
}

/** Project one sub-command into a `SubActionDescriptor`. `universalFlags` are the
 * parent verb's options (e.g. roadmap's `--doc`), accepted on every sub-action. */
function projectSubAction(
  verb: string,
  sub: Command,
  universalFlags: readonly FlagDescriptor[],
  meta: VerbMetadata,
): SubActionDescriptor {
  const name = sub.name();
  return {
    name,
    description: sub.description(),
    positionals: sub.registeredArguments.map((a) => projectPositional(a, meta.positionalsRequired === true)),
    flags: [...universalFlags, ...projectFlags(sub.options)],
    mediationClass: requireSubActionMediation(verb, name, meta),
  };
}

/** Project one mounted commander verb into a `CommandDescriptor`. */
function projectCommand(command: Command, meta: VerbMetadata): CommandDescriptor {
  const verb = command.name();
  const universalFlags = projectFlags(command.options);
  const subActions = command.commands.map((c) => projectSubAction(verb, c, universalFlags, meta));
  const isMulti = subActions.length > 0;
  return {
    verb,
    description: command.description(),
    subActions,
    // Multi-action verbs carry their flags per sub-action (the parent's universal
    // flags are folded into each sub-action above); a single-action verb keeps
    // them at the verb level.
    flags: isMulti ? [] : universalFlags,
    mediationClass: isMulti ? null : requireVerbMediation(verb, meta),
    deprecatedAliasOf: meta.deprecatedAliasOf,
  };
}

/**
 * Walk the given mounted verbs and project each into a typed `CommandDescriptor`,
 * enforcing the completeness guard. Exported (over the module-level `MOUNTED`) so
 * tests can project a fixture verb to exercise the guards.
 */
export function buildSurfaceFrom(mounted: readonly MountedVerb[]): CommandDescriptor[] {
  const surface = mounted.map(({ build, meta }) => projectCommand(build(), meta));
  assertSurfaceComplete(surface);
  return surface;
}

/**
 * Walk the live commander tree and project each mounted verb into a typed
 * `CommandDescriptor`. The single source `--help`, the verb reference, the
 * descriptor artifact, and the fronted-operations registry all read.
 */
export function buildCommandSurface(): CommandDescriptor[] {
  return buildSurfaceFrom(MOUNTED);
}

/**
 * The completeness guard (T007; FR-003), generalizing `roadmap-help.ts`'s
 * summary-completeness check to the whole surface: a registered verb OR
 * sub-action with no (non-whitespace) description fails loud. Help, the verb
 * reference, and the descriptor artifact all render a description per node, so a
 * blank one is drift between the registered surface and its documentation — a
 * defect to surface at build time, never a silently-empty help row.
 */
export function assertSurfaceComplete(surface: readonly CommandDescriptor[]): void {
  for (const verb of surface) {
    if (verb.description.trim().length === 0) {
      throw new Error(
        `command-surface: verb '${verb.verb}' has no description (completeness guard, FR-003)`,
      );
    }
    for (const sub of verb.subActions) {
      if (sub.description.trim().length === 0) {
        throw new Error(
          `command-surface: sub-action '${verb.verb}/${sub.name}' has no description (completeness guard, FR-003)`,
        );
      }
    }
  }
}
