// Atomic transition engine (022 US4 / T021, FR-016, research D6). `advance --apply`
// fires a transition's ordered effect manifest as one transaction: it requires the
// advance-touched paths clean (refuse loud on a dirty tree so uncommitted operator
// work is never clobbered), validates every effect can fire, applies all non-commit
// bookkeeping mutations, then fires `commit` LAST as the atomic boundary. On ANY
// failure before/at the commit it restores the touched paths from their pre-state —
// no partial application. git provides the commit point; a content snapshot provides
// the rollback (no bespoke transaction engine).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  applyEffect,
  effectTouchedPath,
  validateEffect,
  type EffectContext,
} from './effects.js';
import { WorkflowError, type Effect, type Transition } from './workflow-types.js';

export interface AdvanceOutcome {
  readonly applied: boolean;
  readonly committed: boolean;
  readonly effects: readonly Effect[];
  readonly touchedPaths: readonly string[];
  readonly message: string;
}

export interface ApplyHooks {
  /** Fault-injection seam: called before applying each non-commit effect (test-only). */
  readonly onBeforeEffect?: (index: number, effect: Effect) => void;
}

interface PathSnapshot {
  readonly path: string;
  readonly existed: boolean;
  readonly content: string | null;
}

function git(root: string, args: readonly string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** The de-duplicated set of paths the transition's non-commit effects will touch. */
function touchedPathsOf(transition: Transition, ctx: EffectContext): string[] {
  const set = new Set<string>();
  for (const e of transition.effects) {
    const p = effectTouchedPath(e, ctx);
    if (p !== null) set.add(p);
  }
  return [...set];
}

/** The resolved commit message (the `commit` effect's `message`), or a default. */
function commitMessage(transition: Transition, ctx: EffectContext): string {
  const commit = transition.effects.find((e) => e.verb === 'commit');
  const raw = commit?.args.message ?? `workflow(${transition.codename}): ${ctx.item}`;
  // Fail loud on an unbound placeholder (governance MEDIUM) — consistent with
  // resolveArg; never commit a literal `{key}` message.
  return raw.replace(/\{([a-z0-9-]+)\}/gi, (_m, key: string) => {
    if (key === 'item') return ctx.item;
    const v = ctx.bindings[key];
    if (v === undefined) {
      throw new WorkflowError(`commit message references unbound template value '{${key}}'`);
    }
    return v;
  });
}

/** Dry-run preview — the exact ordered effects; writes nothing (FR-015). */
export function previewTransition(transition: Transition, ctx: EffectContext): AdvanceOutcome {
  return {
    applied: false,
    committed: false,
    effects: transition.effects,
    touchedPaths: touchedPathsOf(transition, ctx),
    message: commitMessage(transition, ctx),
  };
}

function snapshot(paths: readonly string[]): PathSnapshot[] {
  return paths.map((path) => {
    const existed = existsSync(path);
    return { path, existed, content: existed ? readFileSync(path, 'utf8') : null };
  });
}

function restore(snapshots: readonly PathSnapshot[]): void {
  for (const s of snapshots) {
    if (s.existed && s.content !== null) writeFileSync(s.path, s.content, 'utf8');
    else if (existsSync(s.path)) rmSync(s.path, { force: true });
  }
}

/** Refuse loud if any advance-touched path has uncommitted changes (FR-016). */
function assertCleanTree(root: string, paths: readonly string[]): void {
  if (paths.length === 0) return;
  const r = git(root, ['status', '--porcelain', '--', ...paths]);
  if (r.status !== 0) {
    throw new WorkflowError(`workflow advance: git status failed (${r.stderr.trim()})`);
  }
  if (r.stdout.trim().length > 0) {
    throw new WorkflowError(
      `workflow advance: refusing — the advance-touched paths have uncommitted changes ` +
        `(commit or stash them first; advance never clobbers operator work):\n${r.stdout.trim()}`,
    );
  }
}

/**
 * Apply the transition atomically. The exit-gate is NOT enforced here in v1
 * (reported elsewhere, FR-010/FR-016); advance refuses only on a dirty tree or an
 * effect that cannot fire.
 */
export function applyTransition(
  transition: Transition,
  ctx: EffectContext,
  hooks: ApplyHooks = {},
): AdvanceOutcome {
  const root = ctx.installationRoot;
  const touched = touchedPathsOf(transition, ctx);
  const message = commitMessage(transition, ctx);

  assertCleanTree(root, touched);

  // Validate-all BEFORE any mutation (an effect that cannot fire aborts cleanly).
  const nonCommit = transition.effects.filter((e) => e.verb !== 'commit');
  for (const e of nonCommit) validateEffect(e, ctx);

  const snap = snapshot(touched);
  try {
    nonCommit.forEach((effect, i) => {
      hooks.onBeforeEffect?.(i, effect);
      applyEffect(effect, ctx);
    });
  } catch (err) {
    restore(snap);
    const msg = err instanceof Error ? err.message : String(err);
    throw new WorkflowError(`workflow advance: effect failed, working tree restored, nothing committed — ${msg}`);
  }

  // commit LAST — the atomic boundary (FR-016). Stage exactly the touched paths.
  const hasCommit = transition.effects.some((e) => e.verb === 'commit');
  if (!hasCommit) {
    return { applied: true, committed: false, effects: transition.effects, touchedPaths: touched, message };
  }
  if (touched.length > 0) {
    const add = git(root, ['add', '--', ...touched]);
    if (add.status !== 0) {
      restore(snap);
      throw new WorkflowError(`workflow advance: git add failed, working tree restored — ${add.stderr.trim()}`);
    }
  }
  const commit = git(root, ['commit', '-m', message, '--', ...touched]);
  if (commit.status !== 0) {
    git(root, ['reset', '--', ...touched]);
    restore(snap);
    throw new WorkflowError(`workflow advance: git commit failed, working tree restored — ${commit.stderr.trim()}`);
  }
  return { applied: true, committed: true, effects: transition.effects, touchedPaths: touched, message };
}
