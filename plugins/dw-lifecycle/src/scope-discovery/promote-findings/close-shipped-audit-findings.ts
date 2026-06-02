/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/close-shipped-audit-findings.ts
 *
 * Phase 13 Task 4 Step 1 — propose `fixed-<sha>` → `verified-<date>`
 * flips for audit-log entries whose closing commit is in a release
 * range.
 *
 * Pure functions only — no fs, no git. The CLI verb at
 * `subcommands/close-shipped-audit-findings.ts` composes this with
 * the `git rev-list <from>..<to>` walker and the existing
 * `flipAuditLogStatus` (now accepting a `currentStatusPredicate`).
 *
 * Per the project rule "Issue closure requires verification in a
 * formally-installed release", the verb's default mode is dry-run;
 * `--apply` performs the writes only after the operator reviews the
 * proposed candidates.
 *
 * Status grammar this module recognizes:
 *   - `fixed-<hex>` — closure SHA (short or full); candidate for
 *     verified-<date> when the SHA is in range.
 *   - `open` / `acknowledged-<ref>` / `verified-<date>` /
 *     `informational` — NOT candidates (only `fixed-<sha>` graduates
 *     to verified).
 *
 * The "in range" check is prefix-match: the audit-log uses short
 * SHAs (e.g. `fixed-245f8ae`), but `git rev-list` emits full SHAs.
 * `isShaInRange` accepts a short SHA prefix matched case-insensitively
 * against any full SHA in the range.
 */

const FIXED_STATUS_RE = /^fixed-([0-9a-f]+)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AuditEntryStatusView {
  readonly findingId: string;
  readonly status: string;
  readonly heading?: string;
}

export interface VerifiedFlip {
  readonly findingId: string;
  readonly previousStatus: string;
  readonly newStatus: string;
}

export interface ProposeVerifiedFlipsArgs {
  readonly entries: ReadonlyArray<AuditEntryStatusView>;
  readonly shasInRange: ReadonlyArray<string>;
  /** ISO date the verification cycle ran; becomes the `verified-<date>` suffix. */
  readonly date: string;
}

export function isShaInRange(
  candidate: string,
  fullShasInRange: ReadonlyArray<string>,
): boolean {
  if (candidate.length === 0) return false;
  const lower = candidate.toLowerCase();
  for (const sha of fullShasInRange) {
    if (sha.toLowerCase().startsWith(lower)) return true;
  }
  return false;
}

export function proposeVerifiedFlips(
  args: ProposeVerifiedFlipsArgs,
): readonly VerifiedFlip[] {
  if (!DATE_RE.test(args.date)) {
    throw new Error(
      `close-shipped-audit-findings: date '${args.date}' must be in YYYY-MM-DD form`,
    );
  }
  const flips: VerifiedFlip[] = [];
  for (const entry of args.entries) {
    const m = FIXED_STATUS_RE.exec(entry.status);
    if (m === null) continue;
    const shaPart = m[1] ?? '';
    if (!isShaInRange(shaPart, args.shasInRange)) continue;
    flips.push({
      findingId: entry.findingId,
      previousStatus: entry.status,
      newStatus: `verified-${args.date}`,
    });
  }
  return flips;
}

/**
 * Predicate used by `flipAuditLogStatus`'s currentStatusPredicate hook:
 * accepts any `fixed-<hex>` status (the only state we permit to flip
 * to `verified-<date>`).
 */
export function isFixedStatus(current: string): boolean {
  return FIXED_STATUS_RE.test(current);
}
