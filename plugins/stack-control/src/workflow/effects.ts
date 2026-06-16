// Fixed v1 effect-vocabulary dispatch (022 US4 / T020, FR-018). Every effect is a
// call to a governed verb from the fixed palette — never a prose instruction. An
// effect mutates at most one bookkeeping path; `commit` is the atomic boundary and
// is dispatched by the transition engine (it needs the touched-path set), not here.
// Heavy/interactive verbs are rejected at PARSE time (workflow-grammar); this
// module is the apply side.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { LoadOptions } from '../document-model/document.js';
import { advance, setField } from '../roadmap/mutations.js';
import { WorkflowError, type Effect } from './workflow-types.js';

/** Everything an effect needs to fire, resolved by the transition engine. */
export interface EffectContext {
  readonly installationRoot: string;
  readonly roadmapPath: string;
  readonly journalPath: string;
  readonly grammarOpts: LoadOptions;
  readonly item: string;
  /** Template values bound at advance time (`status`, `spec-dir`, `design-doc`, `message`, ...). */
  readonly bindings: Readonly<Record<string, string>>;
}

/** Resolve an effect arg, substituting `{key}` placeholders from the bindings (`{item}` is implicit). */
function resolveArg(value: string, ctx: EffectContext, effectVerb: string): string {
  return value.replace(/\{([a-z0-9-]+)\}/gi, (_m, key: string) => {
    if (key === 'item') return ctx.item;
    const v = ctx.bindings[key];
    if (v === undefined) {
      throw new WorkflowError(`effect '${effectVerb}': unbound template value '{${key}}'`);
    }
    return v;
  });
}

function requireArg(effect: Effect, key: string): string {
  const v = effect.args[key];
  if (v === undefined) {
    throw new WorkflowError(`effect '${effect.verb}': missing required arg '${key}='`);
  }
  return v;
}

function anchored(installationRoot: string, p: string): string {
  return isAbsolute(p) ? p : join(installationRoot, p);
}

/**
 * The single bookkeeping path an effect modifies (for the clean-tree precondition,
 * the pre-state snapshot, and the trailing commit). `commit` and `roadmap-reconcile`
 * touch nothing the engine must stage/restore.
 */
export function effectTouchedPath(effect: Effect, ctx: EffectContext): string | null {
  switch (effect.verb) {
    case 'roadmap-advance':
    case 'workflow-link-design':
    case 'workflow-link-spec':
      return ctx.roadmapPath;
    case 'journal-append':
      return ctx.journalPath;
    case 'doc-set-status-field':
      return anchored(ctx.installationRoot, resolveArg(requireArg(effect, 'path'), ctx, effect.verb));
    case 'roadmap-reconcile':
    case 'commit':
      return null;
    default: {
      const exhaustive: never = effect.verb;
      throw new WorkflowError(`unknown effect verb '${String(exhaustive)}'`);
    }
  }
}

/** Validate that an effect can fire (without mutating) — used by the validate-all pass. */
export function validateEffect(effect: Effect, ctx: EffectContext): void {
  switch (effect.verb) {
    case 'roadmap-advance':
      requireArg(effect, 'to');
      return;
    case 'journal-append':
      requireArg(effect, 'message');
      return;
    case 'doc-set-status-field':
      requireArg(effect, 'path');
      requireArg(effect, 'field');
      requireArg(effect, 'value');
      return;
    case 'workflow-link-design':
      requireArg(effect, 'design-doc');
      return;
    case 'workflow-link-spec':
      requireArg(effect, 'spec-dir');
      return;
    case 'roadmap-reconcile':
    case 'commit':
      return;
    default: {
      const exhaustive: never = effect.verb;
      throw new WorkflowError(`unknown effect verb '${String(exhaustive)}'`);
    }
  }
}

/** Set or update a `<field>: <value>` line in a markdown doc's leading frontmatter. */
function setFrontmatterField(path: string, field: string, value: string): void {
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, 'utf8') : '';
  const lines = text.split('\n');
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      const fieldRe = new RegExp(`^${field}\\s*:`);
      const idx = lines.slice(1, end).findIndex((l) => fieldRe.test(l));
      if (idx >= 0) lines[idx + 1] = `${field}: ${value}`;
      else lines.splice(end, 0, `${field}: ${value}`);
      writeFileSync(path, lines.join('\n'), 'utf8');
      return;
    }
  }
  // No frontmatter — prepend one.
  writeFileSync(path, `---\n${field}: ${value}\n---\n${text}`, 'utf8');
}

/**
 * Apply one non-commit effect, mutating its bookkeeping path. `commit` MUST NOT
 * reach here (the engine fires it last); fail loud if it does.
 */
export function applyEffect(effect: Effect, ctx: EffectContext): void {
  switch (effect.verb) {
    case 'roadmap-advance': {
      const to = resolveArg(requireArg(effect, 'to'), ctx, effect.verb);
      advance(ctx.roadmapPath, ctx.item, to, ctx.grammarOpts, true);
      return;
    }
    case 'roadmap-reconcile':
      // Reconcile is report-only (no on-disk mutation); a no-op within an advance.
      return;
    case 'journal-append': {
      const message = resolveArg(requireArg(effect, 'message'), ctx, effect.verb);
      appendFileSync(ctx.journalPath, `${message}\n`, 'utf8');
      return;
    }
    case 'doc-set-status-field': {
      const path = anchored(ctx.installationRoot, resolveArg(requireArg(effect, 'path'), ctx, effect.verb));
      const field = resolveArg(requireArg(effect, 'field'), ctx, effect.verb);
      const value = resolveArg(requireArg(effect, 'value'), ctx, effect.verb);
      setFrontmatterField(path, field, value);
      return;
    }
    case 'workflow-link-design': {
      const designDoc = resolveArg(requireArg(effect, 'design-doc'), ctx, effect.verb);
      setField(ctx.roadmapPath, ctx.item, 'design', designDoc, ctx.grammarOpts, true);
      return;
    }
    case 'workflow-link-spec': {
      const specDir = resolveArg(requireArg(effect, 'spec-dir'), ctx, effect.verb);
      setField(ctx.roadmapPath, ctx.item, 'spec', specDir, ctx.grammarOpts, true);
      return;
    }
    case 'commit':
      throw new WorkflowError(
        "effect 'commit' must be fired last by the transition engine, not applyEffect",
      );
    default: {
      const exhaustive: never = effect.verb;
      throw new WorkflowError(`unknown effect verb '${String(exhaustive)}'`);
    }
  }
}
