/**
 * /release skill helpers — TypeScript implementations called by SKILL.md
 * via tsx. See ../SKILL.md for the operator-facing flow.
 *
 * Test coverage: ./test/release-helpers.test.ts (vitest).
 */

export type ValidateVersionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Validate that `version` is a strict-semver MAJOR.MINOR.PATCH AND is
 * strictly greater than `lastTag` (after stripping a leading 'v').
 *
 * Pure function — no I/O, no subprocesses.
 */
export function validateVersion(version: string, lastTag: string): ValidateVersionResult {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    return {
      ok: false,
      reason: `Version "${version}" is not in MAJOR.MINOR.PATCH format (regex: ${SEMVER_RE}).`,
    };
  }
  const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const stripped = lastTag.replace(/^v/, '');
  const lastMatch = SEMVER_RE.exec(stripped);
  if (!lastMatch) {
    return {
      ok: false,
      reason: `Last tag "${lastTag}" is not in MAJOR.MINOR.PATCH format (optional leading 'v').`,
    };
  }
  const [la, lb, lc] = [Number(lastMatch[1]), Number(lastMatch[2]), Number(lastMatch[3])];

  // Strictly-greater numeric tuple compare.
  if (a > la) return { ok: true };
  if (a < la) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (b > lb) return { ok: true };
  if (b < lb) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (c > lc) return { ok: true };
  return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
}
