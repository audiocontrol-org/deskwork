// TASK-425 — pure retention-selection logic for `stackctl audit-runs prune`.
//
// audit-barrage persists a run dir per run under
// `<install>/.stack-control/audit-runs/<YYYYMMDDTHHMMSSsssZ>-<slug>/` and never
// deletes them — they grow without bound (observed: 279 dirs / 108 MB). This
// module owns the SELECTION (which dirs to keep vs prune); the CLI owns the IO
// (readdir, recursive byte count, rm). Selection is pure so it is unit-testable
// without touching the filesystem, and only ever names dirs whose name matches the
// run-dir timestamp grammar — a foreign directory is never a prune candidate.

/** Matches the `YYYYMMDDTHHMMSSsssZ-` prefix `generateRunDirName` stamps. */
const RUN_DIR_TS_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-/;

/**
 * Parse the encoded timestamp prefix of a run-dir name back to a Date, or null
 * when the name does not carry the run-dir grammar (a foreign dir — never ours to
 * prune). Inverse of `run-artifacts.ts`'s `encodeTimestamp`.
 */
export function parseRunDirTimestamp(name: string): Date | null {
  const m = RUN_DIR_TS_RE.exec(name);
  if (m === null) return null;
  const [, y, mo, d, h, mi, s, ms] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface PruneSelection {
  /** Run dirs retained (newest first). */
  readonly keep: readonly string[];
  /** Run dirs selected for removal (newest first). */
  readonly prune: readonly string[];
}

export interface PruneOptions {
  /** Keep the N newest run dirs; prune the rest. Mutually exclusive with olderThanDays. */
  readonly keepLast?: number;
  /** Prune run dirs older than this many days from `now`. Mutually exclusive with keepLast. */
  readonly olderThanDays?: number;
  /** The reference instant for olderThanDays (injected for testability). */
  readonly now: Date;
}

/**
 * Select which run dirs to keep vs prune. Only names carrying the run-dir
 * timestamp grammar are considered — a foreign directory is ignored entirely
 * (never kept-as-candidate, never pruned). Exactly ONE retention rule must be
 * given; the CLI enforces that before calling here.
 */
export function selectForPrune(names: readonly string[], opts: PruneOptions): PruneSelection {
  // Newest first: the encoded timestamp sorts lexicographically == chronologically.
  const valid = names.filter((n) => parseRunDirTimestamp(n) !== null).sort().reverse();

  if (opts.keepLast !== undefined) {
    return { keep: valid.slice(0, opts.keepLast), prune: valid.slice(opts.keepLast) };
  }
  if (opts.olderThanDays !== undefined) {
    const cutoff = opts.now.getTime() - opts.olderThanDays * 86_400_000;
    const keep: string[] = [];
    const prune: string[] = [];
    for (const name of valid) {
      // parseRunDirTimestamp is non-null here (valid filter), but re-derive to keep
      // the function total; a dir AT or NEWER than the cutoff is kept.
      const ts = parseRunDirTimestamp(name);
      if (ts !== null && ts.getTime() < cutoff) prune.push(name);
      else keep.push(name);
    }
    return { keep, prune };
  }
  throw new Error('selectForPrune requires exactly one of keepLast / olderThanDays');
}
