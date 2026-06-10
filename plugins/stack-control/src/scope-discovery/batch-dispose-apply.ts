/**
 * plugins/stack-control/src/scope-discovery/batch-dispose-apply.ts
 *
 * Apply / verify / render helpers extracted from batch-dispose.ts so both
 * files stay under the 300-500 line cap (010 split — the dw-lifecycle
 * source was a single 522-line file). Behavior is unchanged: this file
 * owns id classification, the disposition apply, the verify-after-write
 * re-read, and the stdout/stderr rendering; batch-dispose.ts owns the
 * arg parser + top-level orchestration + the CLI entrypoint.
 */

import {
  type CloneGroup,
  type ClonesYaml,
  type Disposition,
  dispositionToStatus,
  hasRefactorDisposition,
  parseClonesYaml,
  serializeClonesYaml,
} from './clones-yaml.js';
import { errorMessage } from './util/typeguards.js';

/** Per-id classification computed during planning. */
export type IdPlan =
  | { readonly kind: 'apply'; readonly id: string; readonly group: CloneGroup }
  | {
      readonly kind: 'skip';
      readonly id: string;
      readonly group: CloneGroup;
      readonly existingDisposition: Disposition;
      readonly existingReason: string | null;
    }
  | { readonly kind: 'unknown'; readonly id: string };

export interface BatchDisposeResult {
  readonly code: 0 | 1 | 2;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly unknown: readonly string[];
  readonly verified: boolean;
}

/**
 * Injectable filesystem operations so the adversarial validator can
 * simulate a forged-write scenario (writer flips one entry's reason
 * between write and re-read) without monkey-patching fs.
 */
export interface BatchDisposeIO {
  readonly readFile: (path: string) => Promise<string>;
  readonly writeFile: (path: string, contents: string) => Promise<void>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/** The parsed-args view this helper needs (subset of batch-dispose's ParsedArgs). */
export interface ApplyArgs {
  readonly disposition: Exclude<Disposition, 'refactor'>;
  readonly reason: string;
  readonly showExisting: boolean;
  readonly dryRun: boolean;
}

export function emptyResult(code: 0 | 1 | 2): BatchDisposeResult {
  return { code, applied: [], skipped: [], unknown: [], verified: false };
}

export async function loadClones(
  absPath: string,
  io: BatchDisposeIO,
): Promise<ClonesYaml> {
  let text: string;
  try {
    text = await io.readFile(absPath);
  } catch (err) {
    throw new Error(`failed to read clones file at ${absPath}: ${errorMessage(err)}`);
  }
  const parsed = parseClonesYaml(text);
  if (parsed === null) {
    throw new Error(
      `clones file at ${absPath} has malformed shape (missing top-level keys or wrong types)`,
    );
  }
  return parsed;
}

/**
 * Classify each id as apply / skip / unknown. Preserves input order in
 * the returned array so summary output is predictable.
 */
export function classify(
  clones: readonly CloneGroup[],
  ids: readonly string[],
): readonly IdPlan[] {
  const byId = new Map<string, CloneGroup>();
  for (const g of clones) byId.set(g.id, g);
  return ids.map((id): IdPlan => {
    const group = byId.get(id);
    if (group === undefined) return { kind: 'unknown', id };
    if (group.disposition === 'pending') return { kind: 'apply', id, group };
    return {
      kind: 'skip',
      id,
      group,
      existingDisposition: group.disposition,
      existingReason: group.reason,
    };
  });
}

export function printSkipMessages(
  plan: readonly IdPlan[],
  args: ApplyArgs,
  io: BatchDisposeIO,
): void {
  for (const p of plan) {
    if (p.kind !== 'skip') continue;
    if (args.showExisting) {
      const reasonText = p.existingReason ?? '(null)';
      io.stdout(
        `id=${p.id}: already disposed as ${p.existingDisposition}: ${reasonText}\n`,
      );
    } else {
      io.stdout(
        `id=${p.id}: skipped (already ${p.existingDisposition}; use --show-existing for details)\n`,
      );
    }
  }
}

export function printDryRun(
  applyPlans: ReadonlyArray<Extract<IdPlan, { kind: 'apply' }>>,
  args: ApplyArgs,
  io: BatchDisposeIO,
): void {
  io.stdout(`dry-run: would apply disposition=${args.disposition} reason=${JSON.stringify(args.reason)} to ${applyPlans.length} id(s):\n`);
  for (const p of applyPlans) {
    io.stdout(`  - ${p.id}\n`);
  }
}

/**
 * Build a new ClonesYaml document with the applied dispositions in
 * place. Non-affected groups are passed through unchanged. The
 * refactor-disposition variant cannot appear in applyPlans (refactor
 * groups would be kind=skip), so the rebuilt group is always the
 * non-refactor shape.
 */
export function applyDispositions(
  doc: ClonesYaml,
  applyPlans: ReadonlyArray<Extract<IdPlan, { kind: 'apply' }>>,
  args: ApplyArgs,
): ClonesYaml {
  const applySet = new Set(applyPlans.map((p) => p.id));
  return {
    generated_at: doc.generated_at,
    clones: doc.clones.map((g) => {
      if (!applySet.has(g.id)) return g;
      // Defensive: refactor groups are filtered upstream (they have
      // disposition !== 'pending' and thus end up in skip plans). If
      // one ever reached here, the disposition switch would silently
      // drop the refactor-only fields — throw instead.
      if (hasRefactorDisposition(g)) {
        throw new Error(
          `internal error: tried to apply non-refactor disposition to refactor group ${g.id}`,
        );
      }
      // re-derive `status` from the new
      // disposition per the fixed mapping in `dispositionToStatus()`
      // (the operator is explicitly transitioning the disposition;
      // status should track unless the operator has authored an
      // explicit non-default status). Preserve provenance verbatim —
      // it records authorship history regardless of the disposition
      // transition. If the operator wants to keep the previous
      // status (e.g., transition to keep-with-reason while keeping
      // status: tracked-holdout), they hand-edit the file.
      return {
        id: g.id,
        lines: g.lines,
        members: g.members,
        disposition: args.disposition,
        reason: args.reason,
        status: dispositionToStatus(args.disposition),
        provenance: g.provenance,
        // preserve the existing audit history when
        // transitioning the disposition. The auditor's record of past
        // findings against this group is provenance, not operational
        // state.
        auditHistory: g.auditHistory,
      };
    }),
  };
}

/**
 * Re-read the file we just wrote and confirm each applied id ended up
 * with the expected (disposition, reason). The function is robust
 * against simultaneous external edits: if the re-read parses but a row
 * doesn't match, we report the mismatch — silent miswrite is the
 * failure mode this task exists to prevent.
 */
export async function verifyAfterWrite(
  absPath: string,
  applyPlans: ReadonlyArray<Extract<IdPlan, { kind: 'apply' }>>,
  args: ApplyArgs,
  io: BatchDisposeIO,
): Promise<boolean> {
  let doc: ClonesYaml;
  try {
    doc = await loadClones(absPath, io);
  } catch (err) {
    io.stderr(`error: verify-after-write re-read failed: ${errorMessage(err)}\n`);
    return false;
  }
  const byId = new Map(doc.clones.map((g) => [g.id, g] as const));
  const mismatches: string[] = [];
  for (const p of applyPlans) {
    const after = byId.get(p.id);
    if (after === undefined) {
      mismatches.push(`${p.id}: missing after write`);
      continue;
    }
    if (after.disposition !== args.disposition) {
      mismatches.push(
        `${p.id}: disposition expected ${args.disposition}, got ${after.disposition}`,
      );
    }
    if (after.reason !== args.reason) {
      mismatches.push(
        `${p.id}: reason expected ${JSON.stringify(args.reason)}, got ${JSON.stringify(after.reason)}`,
      );
    }
  }
  if (mismatches.length > 0) {
    io.stderr(
      `error: verify-after-write detected ${mismatches.length} mismatch(es):\n` +
        mismatches.map((m) => `  - ${m}\n`).join(''),
    );
    return false;
  }
  return true;
}

export function summarize(
  result: BatchDisposeResult,
  io: BatchDisposeIO,
  args: ApplyArgs,
): BatchDisposeResult {
  const verifiedText = args.dryRun
    ? 'N/A (dry-run)'
    : result.verified
      ? 'Y'
      : 'N';
  io.stdout(
    `\nApplied: ${result.applied.length}` +
      (result.applied.length > 0 ? ` [${result.applied.join(', ')}]` : '') +
      '\n',
  );
  io.stdout(
    `Skipped (already-disposed): ${result.skipped.length}` +
      (result.skipped.length > 0 ? ` [${result.skipped.join(', ')}]` : '') +
      '\n',
  );
  io.stdout(
    `Unknown ids: ${result.unknown.length}` +
      (result.unknown.length > 0 ? ` [${result.unknown.join(', ')}]` : '') +
      '\n',
  );
  io.stdout(`Verified: ${verifiedText}\n`);
  return result;
}

export { serializeClonesYaml };
