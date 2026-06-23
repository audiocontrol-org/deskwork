// WORKFLOW.md grammar binding (022 T005/T006, contracts/workflow-md-grammar.md).
//
// Two layers: the generic `document-model` engine parses the heading-keyed
// document into Units (enforcing the unit boundaries + identifier shape + status,
// failing loud on a malformed structure); this binding does the SECOND-level
// parse of each unit body into typed Phase / Transition records (the derive
// predicate, work, criteria, next, exit-gate, effect manifest). The engine reads
// every predicate/effect FROM the document — none are hardcoded (FR-005). A
// malformed field fails loud naming the violation (FR-007), never a default
// fallback.
//
// Resolution (FR-005a): an installation override at
// `<root>/.stack-control/WORKFLOW.md` wins; else the plugin-bundled default at
// `templates/WORKFLOW.md`.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDocument, type LoadOptions } from '../document-model/document.js';
import type { Unit } from '../document-model/types.js';
import { grammarOptsForRoot } from '../subcommands/document-verb-shared.js';
import {
  CRITERION_KINDS,
  DERIVE_KINDS,
  EFFECT_VERBS,
  FORBIDDEN_EFFECT_VERBS,
  WorkflowError,
  type Criterion,
  type CriterionKind,
  type DeriveKind,
  type DerivePredicate,
  type Effect,
  type EffectVerb,
  type Phase,
  type Transition,
  type WorkflowDoc,
  type WorkflowDocSource,
} from './workflow-types.js';

const here = dirname(fileURLToPath(import.meta.url));
/** The plugin-bundled default lifecycle (FR-005a). */
export const BUNDLED_WORKFLOW_PATH = resolve(here, '..', '..', 'templates', 'WORKFLOW.md');
/** An installation override lives here (installation copy wins). */
export const WORKFLOW_OVERRIDE_REL = join('.stack-control', 'WORKFLOW.md');

const NONE = '(none)';

/** Read a `- <name>: <value>` body bullet; null when absent. */
function readField(body: string, name: string): string | null {
  for (const line of body.split('\n')) {
    const m = new RegExp(`^\\s*[-*]\\s+${name}\\s*:\\s*(.*)$`).exec(line);
    if (m) return m[1]!.trim();
  }
  return null;
}

/** A required `- <name>:` field; fail loud when absent. */
function requireField(unit: Unit, body: string, name: string): string {
  const v = readField(body, name);
  if (v === null) {
    throw new WorkflowError(`WORKFLOW.md unit '${unit.identifier}' is missing required field '- ${name}:'`);
  }
  return v;
}

function isCriterionKind(s: string): s is CriterionKind {
  return (CRITERION_KINDS as readonly string[]).includes(s);
}
function isDeriveKind(s: string): s is DeriveKind {
  return (DERIVE_KINDS as readonly string[]).includes(s);
}
function isEffectVerb(s: string): s is EffectVerb {
  return (EFFECT_VERBS as readonly string[]).includes(s);
}

function parseCriterion(token: string, ctx: string): Criterion {
  const parts = token.trim().split(/\s+/);
  const kind = parts[0];
  if (kind === undefined || !isCriterionKind(kind)) {
    throw new WorkflowError(
      `WORKFLOW.md ${ctx}: unknown criterion kind '${kind ?? ''}' (known: ${CRITERION_KINDS.join(', ')})`,
    );
  }
  const target = parts[1];
  if (target === undefined || target.length === 0) {
    throw new WorkflowError(`WORKFLOW.md ${ctx}: criterion '${kind}' requires a target`);
  }
  const rawParam = parts[2];
  if (kind === 'count-gte') {
    const n = Number(rawParam);
    if (rawParam === undefined || !Number.isInteger(n) || n < 0) {
      throw new WorkflowError(`WORKFLOW.md ${ctx}: criterion 'count-gte ${target}' requires a non-negative integer threshold`);
    }
    return { kind, target, param: n };
  }
  return rawParam === undefined ? { kind, target } : { kind, target, param: rawParam };
}

function parseCriterionList(value: string, ctx: string): readonly Criterion[] {
  if (value.trim() === NONE || value.trim() === '') return [];
  return value
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => parseCriterion(t, ctx));
}

function parseDerive(value: string, ctx: string): DerivePredicate {
  const parts = value.trim().split(/\s+/);
  const kind = parts[0];
  if (kind === undefined || !isDeriveKind(kind)) {
    throw new WorkflowError(
      `WORKFLOW.md ${ctx}: unknown derive kind '${kind ?? ''}' (known: ${DERIVE_KINDS.join(', ')})`,
    );
  }
  const target = parts[1];
  const needsTarget =
    kind === 'pointer-set' || kind === 'node-marker' || kind === 'record-converged' || kind === 'status-is';
  if (needsTarget && (target === undefined || target.length === 0)) {
    throw new WorkflowError(`WORKFLOW.md ${ctx}: derive '${kind}' requires a target`);
  }
  return target === undefined ? { kind } : { kind, target };
}

function parseEffect(token: string, ctx: string): Effect {
  const parts = token.trim().split(/\s+/);
  const verb = parts[0];
  if (verb !== undefined && (FORBIDDEN_EFFECT_VERBS as readonly string[]).includes(verb)) {
    throw new WorkflowError(
      `WORKFLOW.md ${ctx}: '${verb}' is a heavy/interactive verb and MUST NOT be an advance effect (FR-017) — ` +
        `it is the explicit phase work named by 'workflow next', not lightweight bookkeeping`,
    );
  }
  if (verb === undefined || !isEffectVerb(verb)) {
    throw new WorkflowError(
      `WORKFLOW.md ${ctx}: unknown effect verb '${verb ?? ''}' (vocabulary: ${EFFECT_VERBS.join(', ')}); ` +
        `a missing effect is resolved by ADDING a verb, never a prose effect (FR-020)`,
    );
  }
  const args: Record<string, string> = {};
  for (const kv of parts.slice(1)) {
    const eq = kv.indexOf('=');
    if (eq < 0) {
      throw new WorkflowError(`WORKFLOW.md ${ctx}: effect arg '${kv}' must be 'key=value'`);
    }
    args[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  return { verb, args };
}

function parseEffectList(value: string, ctx: string): readonly Effect[] {
  if (value.trim() === NONE || value.trim() === '') return [];
  const effects = value
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => parseEffect(t, ctx));
  // FR-018: `commit` is ALWAYS last when present.
  const commitIdx = effects.findIndex((e) => e.verb === 'commit');
  if (commitIdx >= 0 && commitIdx !== effects.length - 1) {
    throw new WorkflowError(`WORKFLOW.md ${ctx}: the 'commit' effect must be LAST (the atomic boundary, FR-018)`);
  }
  return effects;
}

function optionalPhaseRef(value: string): string | null {
  return value.trim() === NONE ? null : value.trim();
}

function bindPhase(unit: Unit): Phase {
  const body = unit.body;
  const id = unit.identifier.slice('phase:'.length);
  const ctx = `phase '${id}'`;
  return {
    id,
    derive: parseDerive(requireField(unit, body, 'derive'), `${ctx} derive`),
    work: requireField(unit, body, 'work'),
    entrance: parseCriterionList(requireField(unit, body, 'entrance'), `${ctx} entrance`),
    exit: parseCriterionList(requireField(unit, body, 'exit'), `${ctx} exit`),
    next: optionalPhaseRef(requireField(unit, body, 'next')),
  };
}

function bindTransition(unit: Unit): Transition {
  const body = unit.body;
  const codename = unit.identifier.slice('transition:'.length);
  const ctx = `transition '${codename}'`;
  return {
    codename,
    from: requireField(unit, body, 'from'),
    to: requireField(unit, body, 'to'),
    exitGate: parseCriterionList(requireField(unit, body, 'exit-gate'), `${ctx} exit-gate`),
    effects: parseEffectList(requireField(unit, body, 'effects'), `${ctx} effects`),
  };
}

/** Bind a loaded WORKFLOW.md document's units into typed phases + transitions. */
export function bindWorkflowUnits(
  units: readonly Unit[],
  source: WorkflowDocSource,
  path: string,
): WorkflowDoc {
  const phases: Phase[] = [];
  const transitions: Transition[] = [];
  for (const unit of units) {
    if (unit.identifier.startsWith('phase:')) phases.push(bindPhase(unit));
    else if (unit.identifier.startsWith('transition:')) transitions.push(bindTransition(unit));
    else {
      throw new WorkflowError(
        `WORKFLOW.md unit '${unit.identifier}' is neither a 'phase:' nor a 'transition:' unit`,
      );
    }
  }
  if (phases.length === 0) {
    throw new WorkflowError(`WORKFLOW.md at ${path} declares no phases; a lifecycle needs at least one phase`);
  }
  // Every transition `to`/`from` (other than `*`) must name a declared phase.
  const phaseIds = new Set(phases.map((p) => p.id));
  for (const t of transitions) {
    if (!phaseIds.has(t.to)) {
      throw new WorkflowError(`WORKFLOW.md transition '${t.codename}' targets unknown phase '${t.to}'`);
    }
    if (t.from !== '*' && !phaseIds.has(t.from)) {
      throw new WorkflowError(`WORKFLOW.md transition '${t.codename}' sources unknown phase '${t.from}'`);
    }
  }
  // Every phase `next` (when set) must name a declared phase.
  for (const p of phases) {
    if (p.next !== null && !phaseIds.has(p.next)) {
      throw new WorkflowError(`WORKFLOW.md phase '${p.id}' names unknown next phase '${p.next}'`);
    }
  }
  return { phases, transitions, source, path };
}

/**
 * Resolve + parse the governed WORKFLOW.md for an installation: the override at
 * `<root>/.stack-control/WORKFLOW.md` wins; else the bundled default. The
 * heading-keyed document is parsed by the document-model engine, then bound.
 */
export function loadWorkflowDoc(installationRoot: string): WorkflowDoc {
  const overridePath = join(installationRoot, WORKFLOW_OVERRIDE_REL);
  const isOverride = existsSync(overridePath);
  const path = isOverride ? overridePath : BUNDLED_WORKFLOW_PATH;
  const source: WorkflowDocSource = isOverride ? 'override' : 'bundled';
  const opts: LoadOptions = grammarOptsForRoot(installationRoot);
  const { doc } = loadDocument(path, opts);
  return bindWorkflowUnits(doc.units, source, path);
}
