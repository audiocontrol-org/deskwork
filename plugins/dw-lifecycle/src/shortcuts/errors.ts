/**
 * Refusal-class errors for install-shortcuts dispatch.
 *
 * The dispatch shell maps these to exit code 2; every other thrown
 * error exits 1. Discriminating on `instanceof` rather than message
 * substring keeps the routing safe across error-message rephrasings.
 *
 * `Error` subclasses are the standard exception to the project's
 * no-class-inheritance rule — `Error` is built-in and cannot be
 * composed around without losing stack-trace semantics.
 */
export class CollisionError extends Error {
  readonly kind = 'collision' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CollisionError';
  }
}

export class PriorManifestError extends Error {
  readonly kind = 'prior-manifest' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PriorManifestError';
  }
}

/**
 * Thrown by `runUninstallShortcuts` when a shim on disk has drifted
 * from the canonical body that `install-shortcuts` originally wrote.
 * The uninstall refuses to silently overwrite operator edits; passing
 * `--force-uninstall` overrides the refusal. Discriminated as a
 * refusal-class error so the dispatch shell exits 2 (same as
 * collision / prior-manifest refusals).
 */
export class DriftError extends Error {
  readonly kind = 'drift' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DriftError';
  }
}

export function isRefusalError(err: unknown): boolean {
  return (
    err instanceof CollisionError ||
    err instanceof PriorManifestError ||
    err instanceof DriftError
  );
}
