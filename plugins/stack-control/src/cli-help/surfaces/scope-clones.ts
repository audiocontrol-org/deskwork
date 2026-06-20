// Mounted-verb registry — the `scope-clones` family (028 US1; FR-003).
//
// Six single-action verbs around the per-codebase clone-detection gate and its
// disposition/baseline lifecycle. Each is a FLAT (flags + positionals) verb —
// none dispatches on `args[0]` into sub-actions — so every one is built with
// `buildFlatSurfaceCommand`. Flags + positionals are transcribed verbatim from
// each verb's real parser (src/scope-discovery/*.ts), never invented, so the
// help surface cannot drift from what the parser accepts.
//
// Mediation classes (Decision 4 — declared, never inferred):
//   - check-clones / dispose-clone / batch-dispose / refresh-clones-baseline:
//     'mutating' — they write the per-codebase clones.yaml baseline or its
//     dispositions.
//   - check-disposition-survivor / check-refactor-preconditions: 'read-only' —
//     pure gates that report (HEAD-vs-working diff; precondition runtime checks)
//     and never write.

import type { MediationClass, MountedVerb } from '../command-surface.js';
import { buildFlatSurfaceCommand } from '../surface-builder.js';

const MUTATING: MediationClass = 'mutating';
const READ_ONLY: MediationClass = 'read-only';

/** The `scope-clones` family of mounted verbs. */
export const SCOPE_CLONES_VERBS: readonly MountedVerb[] = [
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-clones',
        description:
          'Per-codebase TypeScript/TSX clone-detection gate scoped to the nearest-enclosing installation; diffs against the committed baseline.',
        flags: [
          { name: 'root', arg: 'path', description: 'scan-root override (default: the resolved installation root)' },
          { name: 'quiet', description: 'suppress per-clone output; print the summary line only' },
          { name: 'json', description: 'emit the groups + diff as JSON' },
          { name: 'diff', description: 'print only the NEW/DROPPED baseline diff' },
          { name: 'baseline', arg: 'path', description: 'override the per-codebase clones.yaml path' },
          { name: 'refresh-baseline', description: 'rewrite the baseline from a fresh run, carrying forward dispositions' },
          { name: 'gate-mode', description: 'accepted for symmetry with the other check-* verbs (no-op here)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: MUTATING },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'dispose-clone',
        description:
          'Single-clone disposition wrapper around batch-dispose: mark one clone group keep-with-reason or ignore-with-justification.',
        positionals: [{ name: 'id', required: true }],
        flags: [
          { name: 'as', arg: 'kind', description: 'disposition: keep-with-reason | ignore-with-justification | refactor (gated)' },
          { name: 'reason', arg: 'text', description: 'rationale (required for keep-with-reason / ignore-with-justification)' },
          { name: 'clones', arg: 'path', description: 'override the per-codebase clones.yaml path' },
          { name: 'dry-run', description: 'plan only; do not write' },
          { name: 'canonical-side', arg: 'existing|new', description: 'refactor precondition: which side is canonical' },
          { name: 'canonical-reason', arg: 'text', description: 'refactor precondition: why that side is canonical' },
          { name: 'new-shape-summary', arg: 'text', description: 'refactor precondition: required when --canonical-side new' },
          { name: 'tests', arg: 'paths', description: 'refactor precondition: comma-separated test paths' },
          { name: 'tests-proof-sha', arg: 'sha7+', description: 'refactor precondition: commit sha proving the tests' },
          { name: 'tests-proof-demonstration', arg: 'text', description: 'refactor precondition: how the tests demonstrate parity' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: MUTATING },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'batch-dispose',
        description:
          'Apply a single (disposition, reason) to N clone-group ids at once, with verify-after-write.',
        flags: [
          { name: 'ids', arg: 'id1,id2,...', description: 'comma-separated content-hashed clone-group ids (required)' },
          { name: 'disposition', arg: 'kind', description: 'pending | keep-with-reason | ignore-with-justification (required)' },
          { name: 'reason', arg: 'text', description: 'rationale applied to every id (required)' },
          { name: 'show-existing', description: 'for ids already non-pending, print the existing disposition + reason' },
          { name: 'clones', arg: 'path', description: 'override the per-codebase clones.yaml path' },
          { name: 'dry-run', description: 'load, plan, summarize; skip the write + verify' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: MUTATING },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'refresh-clones-baseline',
        description:
          'Rewrite the clones.yaml baseline from a fresh run, carrying forward operator-authored dispositions for surviving groups.',
        flags: [
          { name: 'baseline', arg: 'path', description: 'override the per-codebase clones.yaml path' },
          { name: 'quiet', description: 'suppress per-clone output; print the summary only' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: MUTATING },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-disposition-survivor',
        description:
          'Pre-commit gate that fails when a curated disposition silently reverts to `pending` in the working tree (HEAD-vs-working diff).',
        flags: [
          { name: 'allow-disposition-loss', description: 'accept the losses with a warning (operator-conscious override)' },
          { name: 'baseline', arg: 'path', description: 'override the per-codebase clones.yaml path' },
          { name: 'head-ref', arg: 'ref', description: 'git ref the working tree is compared against (default: HEAD)' },
          { name: 'repo', arg: 'path', description: 'override the repo root (default: cwd)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: READ_ONLY },
  },
  {
    build: () =>
      buildFlatSurfaceCommand({
        verb: 'check-refactor-preconditions',
        description:
          'Gate that enforces the refactor-precondition protocol on commits naming clones.yaml entries (Closes clones.yaml <id>).',
        flags: [
          { name: 'commit-msg-file', arg: 'path', description: 'read the commit message from a file' },
          { name: 'commit-msg', arg: 'text', description: 'inline commit message (test-only)' },
          { name: 'baseline', arg: 'path', description: 'override the per-codebase clones.yaml path' },
          { name: 'repo', arg: 'path', description: 'override the repo root (test-only)' },
          { name: 'test-timeout-seconds', arg: 'n', description: 'per-test timeout in seconds (default: 300)' },
          { name: 'skip-test-run', description: 'skip running the named tests (test-only)' },
          { name: 'gate-mode', description: 'exit 1 on precondition failures (default: informational, exit 0)' },
        ],
      }),
    meta: { deprecatedAliasOf: null, verbMediation: READ_ONLY },
  },
];
