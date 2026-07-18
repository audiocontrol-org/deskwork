// specs/036-fleet-control-plane — T068 (impl), pairs with the RED test (T061).
//
// Per-command supersession rules (FR-057): data-model.md § Command →
// Supersession table (line ~104-112):
//
//   pause:       superseded by a later `resume` while un-applied
//   resume:      supersedes a pending un-applied `pause`
//   cancel:      two `cancel`s deduplicate, never queue
//   config-push: a newer revision supersedes an older un-applied one
//   reconcile:   own long-running lifecycle: does not participate in simple supersession
//
// This is PER-COMMAND semantics, not a generic "last wins" model (FR-057).
// The rules differ by kind: cancel deduplicates; config-push has revision semantics;
// pause/resume are bidirectional; reconcile is self-contained. A single generic
// rule cannot express the variation.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias — this plugin has none).
// No fallbacks / no silent defaults — an invalid case throws (fail loud).

import { isTerminalCommandState } from './command.js';
import type { Command, CommandKind } from './command.js';

// Re-export canonical types so the test's import path works.
export type { Command, CommandKind } from './command.js';

/**
 * Determine whether an incoming command supersedes an existing command,
 * applying per-command supersession rules from data-model.md § Command →
 * Supersession (FR-057). Supersession is decided per kind, never generically.
 *
 * Semantics:
 *   - `pause`: superseded by a later `resume` while un-applied
 *   - `resume`: supersedes a pending un-applied `pause`
 *   - `cancel`: two `cancel`s deduplicate, never queue
 *   - `config-push`: a newer revision supersedes an older un-applied one
 *   - `reconcile`: own lifecycle, does not participate in simple supersession
 *
 * Different-kind commands never supersede each other (return false).
 * reconcile never participates in supersession (return false).
 */
export function supersedes(existing: Command, incoming: Command): boolean {
  // Supersession is scoped to a still-UN-APPLIED existing command
  // (data-model.md § Supersession — "while un-applied", FR-057). Once the
  // existing command has reached a terminal state (applied / rejected /
  // failed / expired / superseded) it is settled — a later command cannot
  // supersede it, because doing so would erase a real, honest terminal state.
  if (existing.state !== undefined && isTerminalCommandState(existing.state)) {
    return false;
  }

  // reconcile has its own long-running lifecycle (received → started →
  // completed/failed) and does not participate in simple supersession (FR-061).
  if (existing.kind === 'reconcile' || incoming.kind === 'reconcile') {
    return false;
  }

  // pause/resume are bidirectional: resume supersedes pause, pause does not
  // supersede resume (data-model.md § Supersession table).
  if (existing.kind === 'pause' && incoming.kind === 'resume') {
    return true;
  }
  if (existing.kind === 'resume' && incoming.kind === 'pause') {
    return false;
  }

  // Supersession is decided per kind, never generically (FR-057):
  // different-kind commands do not supersede each other.
  if (existing.kind !== incoming.kind) {
    return false;
  }

  // Kinds match; apply kind-specific rules.
  switch (existing.kind) {
    case 'pause':
      // Both are pause; no supersession rule for pause→pause (already handled
      // the pause→resume case above).
      return false;

    case 'resume':
      // Both are resume; no supersession rule for resume→resume (already
      // handled the resume→pause case above).
      return false;

    case 'cancel':
      // Two `cancel`s deduplicate: the incoming cancel supersedes the existing
      // one, preventing it from queuing (PT-011, data-model.md § cancel semantics).
      return true;

    case 'config-push':
      // A newer revision supersedes an older un-applied one (FR-060).
      // Revision is mandatory for config-push; compare-and-set requires it.
      if (existing.revision === undefined || incoming.revision === undefined) {
        throw new Error(
          `supersedes: config-push commands must have a revision field; ` +
            `existing.revision=${existing.revision}, incoming.revision=${incoming.revision}`,
        );
      }
      return existing.revision < incoming.revision;

    default:
      // Exhaustiveness guard: if a new CommandKind is added without a case,
      // TypeScript will catch it here as a compile error. reconcile is ruled out
      // above, so this case covers any future additions.
      const _exhaustive: never = existing.kind;
      return _exhaustive;
  }
}
