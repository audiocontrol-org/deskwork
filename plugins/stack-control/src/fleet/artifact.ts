// specs/036-fleet-control-plane — T049 [US2] [tier:fast] (impl), pairs with
// tests/fleet/artifact-refs.test.ts's RED test.
//
// Artifact reference validation per contracts/plane-client-api.md § C5 and
// research.md PT-009: "artifacts are referenced as opaque identifiers plus
// installation-relative paths, never `file://` URLs and never absolute host
// paths. A remote client refers to a filesystem it cannot reach, so
// 'quick-access' means copy-path, not open-link."
//
// This module owns ONLY the validation seam: a candidate string either
// passes (becomes an `ArtifactRef`) or is rejected with a descriptive,
// PT-009-citing error (Principle V — fail loud, no coercion, no silent
// default). Callers (src/plane/http/api.ts's per-run detail, C5) run any
// artifact reference they intend to surface through this function before
// attaching it to a response.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). This module has no
// imports of its own — it is a pure string-shape validator.

/**
 * A validated artifact reference: either an opaque identifier (UUID, hash
 * digest, ...) or an installation-relative path. Never a `file://` URL,
 * never an absolute host path (POSIX or Windows), never a Windows UNC
 * network path (PT-009). The wrapper type exists so a caller cannot pass an
 * unvalidated `string` where an artifact ref is expected — the only way to
 * construct one is through `validateArtifactRef`.
 */
export interface ArtifactRef {
  readonly value: string;
}

/**
 * Validate a candidate artifact reference string per PT-009. Throws a
 * descriptive error (never returns a coerced/defaulted value) when the
 * candidate is not a non-empty string, or matches one of the forbidden
 * shapes: `file://` URL, absolute POSIX path, Windows absolute path
 * (`C:\` / `C:/`), or Windows UNC network path (`\\server\share`).
 *
 * Order matters: UNC (`\\...`) and Windows-drive (`X:\` / `X:/`) shapes are
 * checked before the bare-leading-`/` POSIX check so a Windows path is
 * reported as `Windows`/`UNC`, never misreported as `POSIX`.
 */
export function validateArtifactRef(candidate: string): ArtifactRef {
  if (typeof candidate !== 'string') {
    throw new Error(
      `validateArtifactRef (PT-009): expected a string artifact reference, got ${typeof candidate}. ` +
        'Refusing to coerce — fail loud (Principle V).',
    );
  }

  if (candidate.length === 0) {
    throw new Error(
      'validateArtifactRef (PT-009): artifact reference must not be empty. ' +
        'Refusing to default — fail loud (Principle V).',
    );
  }

  if (/^file:\/\//i.test(candidate)) {
    throw new Error(
      `validateArtifactRef (PT-009): artifact reference must never be a file:// URL — a remote ` +
        `client refers to a filesystem it cannot reach. Got: ${candidate}`,
    );
  }

  if (candidate.startsWith('\\\\')) {
    throw new Error(
      `validateArtifactRef (PT-009): artifact reference must never be a Windows UNC network path ` +
        `(\\\\server\\share) — a remote client refers to a filesystem it cannot reach. Got: ${candidate}`,
    );
  }

  if (/^[A-Za-z]:[\\/]/.test(candidate)) {
    throw new Error(
      `validateArtifactRef (PT-009): artifact reference must never be a Windows absolute path ` +
        `(drive letter + separator) — a remote client refers to a filesystem it cannot reach. Got: ${candidate}`,
    );
  }

  if (candidate.startsWith('/')) {
    throw new Error(
      `validateArtifactRef (PT-009): artifact reference must never be an absolute POSIX path — a ` +
        `remote client refers to a filesystem it cannot reach. Got: ${candidate}`,
    );
  }

  return { value: candidate };
}
