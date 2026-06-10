// T004 (012) — typed graduation-target parsing for `backlog promote --to <ref>`.
// Three kinds (FR-002): a new Spec Kit feature spec, a task in an existing
// feature's tasks.md, and a roadmap DAG node. Refs are **shape-validated only**
// — the target need not exist on disk at promote time (record-don't-create, D4);
// the verb reports a not-yet-created target as pending, it does not reject it.
// A malformed/unknown/empty ref is a usage error (TargetRefError → exit 2).

/** The three graduation-target kinds (FR-002). */
export type TargetKind = 'spec' | 'tasks' | 'roadmap';

/** A parsed, shape-validated graduation target. */
export interface PromoteTarget {
  readonly kind: TargetKind;
  /** The normalized ref string (as recorded on the item, e.g. `spec:specs/NNN-slug`). */
  readonly ref: string;
  /** The repo-relative filesystem path the target maps to, when one exists
   * (spec/tasks → the `specs/NNN-slug` dir); `undefined` for roadmap nodes,
   * which live as entries inside ROADMAP.md, not as a path. Drives the
   * pending-create advisory (D4). */
  readonly path?: string;
}

/** Fail-loud usage error the verb maps to exit 2 (malformed/unknown ref). */
export class TargetRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetRefError';
  }
}

/** `specs/NNN-slug` — a numbered Spec Kit feature directory (spec/tasks kinds). */
const SPEC_DIR = /^specs\/\d+-[a-z0-9][a-z0-9-]*$/;
/** `<phase>:<kind>/<slug>` — a roadmap DAG node id (e.g. `impl:feature/execution-engine`). */
const ROADMAP_NODE = /^[a-z]+:[a-z]+\/[a-z0-9][a-z0-9-]*$/;

/**
 * Parse + shape-validate a `--to` target ref. Returns the typed target on
 * success; throws TargetRefError (→ exit 2) on any malformed/unknown/empty ref.
 * No filesystem access — existence is the verb's separate, advisory concern (D4).
 */
export function parseTarget(ref: string): PromoteTarget {
  const colon = ref.indexOf(':');
  if (colon <= 0) {
    throw new TargetRefError(
      `malformed --to target '${ref}' — expected one of spec:specs/NNN-slug, tasks:specs/NNN-slug, roadmap:<phase>:<kind>/<slug>`,
    );
  }
  const kind = ref.slice(0, colon);
  const body = ref.slice(colon + 1);
  if (body === '') {
    throw new TargetRefError(`--to target '${ref}' has an empty '${kind}:' body`);
  }
  switch (kind) {
    case 'spec':
    case 'tasks':
      if (!SPEC_DIR.test(body)) {
        throw new TargetRefError(
          `--to ${kind}: target '${body}' is not a specs/NNN-slug feature dir`,
        );
      }
      return { kind, ref, path: body };
    case 'roadmap':
      if (!ROADMAP_NODE.test(body)) {
        throw new TargetRefError(
          `--to roadmap: target '${body}' is not a <phase>:<kind>/<slug> node id`,
        );
      }
      return { kind, ref };
    default:
      throw new TargetRefError(
        `unknown --to target kind '${kind}' — expected spec:, tasks:, or roadmap:`,
      );
  }
}

/**
 * Whether a target kind permits a multi-item batch (D5): only `tasks:` (gather
 * N related items into one existing feature's tasks.md). `spec:`/`roadmap:` are
 * single-item — one item seeds one new feature/node.
 */
export function allowsBatch(kind: TargetKind): boolean {
  return kind === 'tasks';
}
