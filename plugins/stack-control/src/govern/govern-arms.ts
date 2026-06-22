/**
 * plugins/stack-control/src/govern/govern-arms.ts
 *
 * The three focused arm bodies of `stackctl govern`, extracted from
 * `subcommands/govern.ts` (030 T086 / FR-022 / SC-007) so the command file stays
 * under the 500-line cap:
 *
 *   - maybeOverrideGraduate — the `--override` SHORT-CIRCUIT (zero render/barrage/
 *     lift/slush; records the attributable override graduation + convergence record).
 *   - runImplementArm — the implement-mode end-govern pipeline drive.
 *   - runSpecArm — the spec-mode convergence loop.
 *
 * Each takes an explicit context object for the shared locals `runGovern` resolves
 * up front. Pure file-size decomposition — every arm body, comment, and exit code
 * is preserved verbatim; the arms run inside `runGovern`'s try/catch (they throw
 * GovernProtocolError / GovernPayloadError exactly as before).
 */

import {
  GovernProtocolError,
  runProtocol,
  type GovernTerminalKind,
} from './protocol.js';
import { recordGovernConvergence } from './convergence-record.js';
import { recordOverrideGraduation } from './override-graduate.js';
import { resolveConvergenceItem } from './feature-resolution.js';
import { runCloneDetectionStep } from './clone-step.js';
import { runConvergenceLoop } from './convergence-loop.js';
import { resolveImplementExclusion } from './payload-diff-scope.js';
import { runEndGovern } from './end-govern-pipeline.js';
import { makeEndGovernRuntime } from './end-govern-runtime.js';
import { writeWholeFeatureConvergenceRecord } from './chunk-artifacts.js';
import { liftEndGovernFindingsOnce } from './lift-once.js';
import type { ConvergenceOutcome } from './convergence-types.js';
import type { LaneCapabilityProfile } from './lane-capabilities.js';
import type { Installation } from '../config/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import {
  buildImplementVars,
  buildSpecVars,
  formatScopeExclusionSummary,
  pick,
  resolveCeiling,
  resolveGovernFeatureRoot,
  type GovernFlags,
} from './govern-vars.js';

/**
 * Emit the single machine-readable terminal line (T028 / US5 — AUDIT-BARRAGE-codex-01,
 * 021 phase-2 cross-model finding). Every govern EXECUTION exit routes through
 * here so a consumer keying on `govern: terminal-outcome=<kind>` sees exactly one
 * line — the pre-try usage/preflight `process.exit(2)` paths, the gated
 * success/blocked exits, and the unexpected-exception fallthrough. The `--help`
 * early return is the ONE deliberate non-emitter (it does no governance work, so it
 * has no outcome to report).
 */
export function emitTerminalOutcome(kind: GovernTerminalKind): void {
  process.stderr.write(`govern: terminal-outcome=${kind}\n`);
}

/** The shared locals `runGovern` resolves before dispatching to the implement / spec arms. */
export interface GovernRunContext {
  installation: Installation;
  repoRoot: string;
  flags: GovernFlags;
  requireModels: number;
  slug: string;
  barrageBin: string;
  stackctl: string;
  requestedModels: string | undefined;
  laneCapabilities: readonly LaneCapabilityProfile[] | undefined;
  auditLogExcerpt: string;
  featureRoot: string | undefined;
  excludeRoots: readonly string[] | undefined;
  excludePaths: readonly string[] | undefined;
}

/**
 * specs/029 US4 (FR-017/018): the `--override` SHORT-CIRCUIT. When an override
 * reason is supplied, govern graduates THIS invocation with ZERO
 * render/barrage/lift/slush — it records the attributable override graduation
 * (the "OPEN by override" line + the convergence record) and exits 0. Detected
 * AFTER slug resolution but BEFORE the barrage bin / fleet preflight / payload /
 * loop — so none of the barrage work fires.
 *
 * 030 US2 (clean break): a whole-feature override writes NO per-phase checkpoint
 * (there is no single phase to record) — it graduates on the whole-feature
 * convergence record alone. Returns normally (no override) so the caller falls
 * through to the normal barrage path.
 */
export async function maybeOverrideGraduate(ctx: {
  installation: Installation;
  repoRoot: string;
  flags: GovernFlags;
  slug: string;
}): Promise<void> {
  const { installation, repoRoot, flags, slug } = ctx;
  // specs/029 US4 (FR-017/018; AUDIT-BARRAGE codex-02/claude-02): a SUPPLIED-but-blank
  // override reason — from the `--override` flag OR the `GOVERN_OVERRIDE` env var —
  // must FAIL LOUD, never silently graduate with a blank attribution NOR fall through
  // to a full barrage. A genuinely-absent override (both undefined) is unchanged (the
  // normal barrage path). Guard the PICKED value so BOTH sources are covered,
  // trim-based so whitespace is rejected on either surface.
  const overrideReasonRaw = pick(flags.override, process.env.GOVERN_OVERRIDE);
  if (overrideReasonRaw !== undefined && overrideReasonRaw.trim().length === 0) {
    process.stderr.write(
      'govern: FATAL — --override / GOVERN_OVERRIDE requires a non-empty reason (an ' +
        'empty or whitespace-only reason is rejected so a blank override cannot ' +
        'silently short-circuit into — or fall through to — a full barrage).\n',
    );
    emitTerminalOutcome('fatal');
    process.exit(2);
  }
  // Store the TRIMMED reason so the durable attribution carries no surrounding blank.
  // AUDIT-BARRAGE claude-02: the blank-reason FATAL above already eliminated every
  // empty/whitespace case, so a defined `overrideReason` is necessarily non-empty —
  // no redundant `.length > 0` re-check.
  const overrideReason = overrideReasonRaw?.trim();
  if (overrideReason === undefined) return;

  // AUDIT-BARRAGE claude-03 (not a redundant resolve): the normal-path `featureRoot`
  // is resolved LATER (in runGovern), and the override path `process.exit`s before
  // reaching it — the two resolves are mutually exclusive, so exactly ONE runs per
  // invocation.
  const { root: overrideRoot } = await resolveGovernFeatureRoot(repoRoot, slug);
  // specs/029 US4 (FINDING 2, codex HIGH): the override's CLI success MUST NOT
  // diverge from the durable convergence record (the `governing -> shipped` gate
  // signal). Resolve the canonical roadmap node FIRST — before any write, so nothing
  // is half-written — and FAIL LOUD when it cannot resolve (throws OR yields undefined:
  // orphan/legacy/standalone with no node). A clean override graduation now ALWAYS
  // leaves a durable `override: true` record.
  let convergenceItem: string | undefined;
  try {
    convergenceItem = resolveConvergenceItem(installation, overrideRoot, slug);
  } catch (err) {
    process.stderr.write(
      `govern: FATAL — --override could not resolve a roadmap node for '${slug}' ` +
        `(${errorMessage(err)}); the durable convergence record (the governing -> ` +
        `shipped gate signal) cannot be written, so this override does NOT graduate. ` +
        `Capture the feature on the roadmap (a node whose spec: pointer names the ` +
        `feature dir) before overriding.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(2);
  }
  if (convergenceItem === undefined) {
    process.stderr.write(
      `govern: FATAL — --override could not resolve a roadmap node for '${slug}'; ` +
        `the durable convergence record (the governing -> shipped gate signal) cannot ` +
        `be written, so this override does NOT graduate. Capture the feature on the ` +
        `roadmap (a node whose spec: pointer names the feature dir) before overriding.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(2);
  }
  // AUDIT-BARRAGE codex-01 (HIGH) / claude-01: record-first ordering. The record is
  // written and a write failure FATALs with "nothing written, gate closed" so the
  // failure never wrongly advances the lifecycle.
  try {
    recordOverrideGraduation({
      installationRoot: repoRoot,
      mode: flags.mode === 'spec' ? 'spec' : 'impl',
      convergenceItem,
      scopePaths: overrideRoot !== undefined ? [overrideRoot] : [],
      feature: slug,
      reason: overrideReason,
      recordedAt: new Date().toISOString(),
      stderr: (s) => process.stderr.write(s),
    });
  } catch (err) {
    process.stderr.write(
      `govern: FATAL — override graduation could not write the durable convergence ` +
        `record (${errorMessage(err)}); nothing was written, the governing -> shipped gate ` +
        `stays CLOSED, and this override does NOT graduate. Fix the write error and re-run.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(1);
  }
  // 030 US2 (clean break): no per-phase checkpoint is written — the override
  // graduates on the whole-feature convergence record alone (written above).
  process.stderr.write(
    flags.mode === 'spec'
      ? 'govern: spec may graduate (overridden).\n'
      : 'govern: implementation governed (overridden).\n',
  );
  emitTerminalOutcome('graduated');
  process.exit(0);
}

/**
 * 030 US9 (FR-024/026, SC-008): implement mode drives the end-govern pipeline
 * (runEndGovern) as its SINGLE execution path — cluster → audit → (fix) →
 * re-audit → seam → reconcile-ONCE → one WholeFeatureConvergenceRecord. The
 * pipeline partitions the committed diff internally and audits each chunk via
 * the barrage-backed runtime WITHOUT a per-chunk lift; this CLI lifts ONCE
 * (FR-026). applyFixes is absent (FR-009 autonomous fix deferred, TASK-424), so a
 * feature with open findings reconciles to `override-eligible` and the agent
 * fixes + re-governs. Always process.exits.
 */
export async function runImplementArm(ctx: GovernRunContext): Promise<void> {
  const {
    installation,
    repoRoot,
    flags,
    requireModels,
    slug,
    barrageBin,
    requestedModels,
    laneCapabilities,
    featureRoot,
    excludeRoots,
    excludePaths,
  } = ctx;
  if (laneCapabilities === undefined) {
    throw new GovernProtocolError(
      'govern: FATAL — implement-mode fleet capabilities did not resolve (internal invariant).',
    );
  }
  // US7 (FR-032): the per-codebase clone step runs once (advisory).
  await runCloneDetectionStep({ repoRoot, write: (s) => process.stderr.write(s) });

  // The graduation signal is keyed by the canonical roadmap node id; resolve it
  // FIRST and fail loud — a record we cannot key is a record the gate cannot
  // read (mirrors the override path's record-first ordering).
  let convergenceItem: string;
  try {
    const resolved = resolveConvergenceItem(installation, featureRoot, slug);
    if (resolved === undefined) {
      throw new Error(`no roadmap node resolves feature '${slug}'`);
    }
    convergenceItem = resolved;
  } catch (err) {
    process.stderr.write(
      `govern: FATAL — could not resolve a roadmap node for the whole-feature convergence ` +
        `record (${errorMessage(err)}); the governing -> shipped gate cannot be keyed, so this ` +
        `run does NOT graduate. Capture the feature on the roadmap (a node whose spec: pointer ` +
        `names the feature dir) and re-run.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(2);
  }

  const base = flags.diffBase ?? pick(undefined, process.env.GOVERN_DIFF_BASE) ?? 'HEAD~1';
  const envelope = Math.min(...laneCapabilities.map((lane) => lane.envelope.maxPromptBytes));
  // Reuse buildImplementVars for the audit lens / framing / commit-subjects /
  // workplan summary; the assembled whole `diff` is DISCARDED — the pipeline
  // re-scopes per chunk (scopeCommittedDiff + partitionDiff), rendering the
  // FR-027-sized payload the barrage actually audits.
  // AUDIT-20260622-04: pass the SAME resolved `base` the pipeline scopes over —
  // not `flags.diffBase` — so the audit metadata (commit_subjects / workplan
  // summary) can never describe a different range than the chunks audited.
  // (flags.diffBase is already resolved to `base` at the top of runGovern via
  // resolveImplementDiffBase, so this is also the single base-resolution site.)
  const { vars } = buildImplementVars(repoRoot, slug, base, flags.checkpoint);
  const { diff: _discardedWholeDiff, workplan_summary: planContext, ...varsBase } = vars;
  void _discardedWholeDiff;
  // AUDIT-20260622-02: thread the SAME resolved exclusion set buildImplementVars
  // derives so the pipeline's per-chunk scopeDiff filters spec/contract/audit-log
  // prose out of the audited surface (was silently auditing the whole diff).
  const { excludeDiffRels } = resolveImplementExclusion(
    repoRoot,
    featureRoot,
    excludeRoots,
    excludePaths,
  );

  const runtime = makeEndGovernRuntime({
    barrageBin,
    installationRoot: repoRoot,
    slug,
    checkpoint: flags.checkpoint ?? 'after_implement',
    varsBase,
    excludeDiffPaths: excludeDiffRels,
    laneCapabilities,
    models: requestedModels,
    requireModels,
    envelope,
    planContext,
    base,
    head: 'HEAD',
    stderr: (s) => process.stderr.write(s),
  });

  const { record } = await runEndGovern(
    { installationRoot: repoRoot, item: convergenceItem, base, head: 'HEAD' },
    runtime.deps,
  );

  // Persist the ONE whole-feature record the impl graduate gate reads (FR-025).
  // A record-write failure is FATAL — never report graduation the durable gate
  // signal does not back (mirrors the override path's record-first FATAL).
  try {
    writeWholeFeatureConvergenceRecord(repoRoot, record);
  } catch (err) {
    process.stderr.write(
      `govern: FATAL — could not write the whole-feature convergence record ` +
        `(${errorMessage(err)}); the governing -> shipped gate stays CLOSED and this run does ` +
        `NOT graduate. Fix the write error and re-run.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(1);
  }

  // Lift ONCE (FR-026): the reconciled lifted findings become a single audit-log
  // section, counting as one dampener run — never one section per chunk.
  // AUDIT-20260622-03: lift runs AFTER the convergence record is persisted, so a
  // lift failure leaves an inconsistent state (the durable gate signal is on disk
  // but the surfaced findings were never recorded). Surface that explicitly —
  // name BOTH halves so the operator knows the record was written and to re-run —
  // rather than letting a bare fs error propagate to the generic outer catch.
  const liftDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    await liftEndGovernFindingsOnce({
      installationRoot: repoRoot,
      slug,
      findings: runtime.liftedRich(record.liftedFindings.map((f) => f.id)),
      date: liftDate,
      runLabel: `end-govern-${flags.checkpoint ?? 'after_implement'}`,
      stderr: (s) => process.stderr.write(s),
    });
  } catch (err) {
    process.stderr.write(
      `govern: FATAL — the whole-feature convergence record was written, but recording the ` +
        `surfaced findings (lift) failed (${errorMessage(err)}). The audit-log section was NOT ` +
        `appended; the gate reads the record, so re-run govern after fixing the write error to ` +
        `record the findings.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(1);
  }

  if (record.outcome !== 'converged') {
    // AUDIT-20260622-10: a degraded-fleet outcome is not a findings problem — the
    // run was quiet because fewer lanes than the configured fleet produced it, so
    // "fix the findings" advice would mislead. Point at fleet reachability instead.
    const advice =
      record.outcome === 'degraded-fleet-surfaced'
        ? `the audit fleet was degraded for the convergence-determining round (a quiet round from ` +
          `fewer lanes is not full cross-model convergence). Ensure every configured model CLI is ` +
          `installed/reachable & re-govern, or record --override to accept the weakened audit.`
        : `Fix the surfaced findings & re-govern, or record --override.`;
    process.stderr.write(
      `govern: implementation NOT done — end-govern reconciled to '${record.outcome}' ` +
        `(${record.liftedFindings.length} open finding(s) over ${record.chunkIds.length} chunk(s), ` +
        `${record.rounds} round(s)). ${advice}\n`,
    );
    emitTerminalOutcome('blocked');
    process.exit(1);
  }
  process.stderr.write(
    `govern: implementation governed (end-govern converged over ${record.chunkIds.length} chunk(s)).\n`,
  );
  emitTerminalOutcome('graduated');
  process.exit(0);
}

/**
 * 030 (FR-024): only spec mode reaches this convergence loop — implement mode drove
 * the end-govern pipeline above and exited. Spec mode audits a single whole payload
 * scope (the chunk partition lives entirely inside the implement-mode pipeline now).
 * Always process.exits.
 */
export async function runSpecArm(ctx: GovernRunContext): Promise<void> {
  const {
    installation,
    repoRoot,
    flags,
    requireModels,
    slug,
    barrageBin,
    stackctl,
    requestedModels,
    laneCapabilities,
    auditLogExcerpt,
    featureRoot,
  } = ctx;
  const noSlush = flags.noSlush || process.env.GOVERN_NO_SLUSH === '1';
  const protocolBase = {
    stackctl,
    barrageBin,
    installationRoot: repoRoot,
    slug,
    laneCapabilities,
    models: requestedModels,
    requireModels,
    ceiling: pick(flags.ceiling, process.env.GOVERN_CEILING),
    override: pick(flags.override, process.env.GOVERN_OVERRIDE),
    noSlush,
    emitJson: flags.json,
    stdout: (s: string) => process.stdout.write(s),
    stderr: (s: string) => process.stderr.write(s),
  };

  // Build + audit the spec payload via the protocol pass. 030 (FR-024): only spec mode
  // reaches this loop — implement mode drove the end-govern pipeline above and exited.
  const auditChunkPass = async (): Promise<boolean> => {
    const built = buildSpecVars(repoRoot, slug, flags.specPath, flags.planPath, flags.checkpoint, auditLogExcerpt);
    const exclusionSummary = formatScopeExclusionSummary(built.skippedOutOfScope);
    if (exclusionSummary !== undefined) process.stderr.write(`${exclusionSummary}\n`);
    return (await runProtocol({ ...protocolBase, checkpoint: built.checkpoint, vars: built.vars })).gateOpen;
  };

  // specs/015 US2 (FR-004/005): delegate the convergence loop to the code driver.
  const ceiling = resolveCeiling(pick(flags.ceiling, process.env.GOVERN_CEILING));
  const outcome: ConvergenceOutcome = await runConvergenceLoop({
    ceiling,
    runPass: async () => ({ gateOpen: await auditChunkPass() }),
    dispatchFix: async () => {
      process.stderr.write(
        'govern: convergence gate BLOCKED — fix the surfaced findings; the loop ' +
          're-barrages on the next round and never auto-edits the work (FR-005).\n',
      );
    },
  });

  // Map the recorded terminal to govern's exit: `converged` may graduate
  // (exit 0); `non-converged` is a bounded refusal (exit 1). An operator
  // `--override` never reaches here — it short-circuits above (FR-017). The
  // agent never held the iterate/stop decision (SC-004).
  if (outcome.kind === 'non-converged') {
    process.stderr.write(
      (flags.mode === 'spec'
        ? 'govern: spec graduation REFUSED — convergence gate BLOCKED'
        : 'govern: implementation NOT done — convergence gate BLOCKED') +
        ` after ${outcome.rounds} round(s) (ceiling ${outcome.ceiling}); fix findings & re-govern, or record --override.\n`,
    );
    emitTerminalOutcome('blocked');
    process.exit(1);
  }
  // 022 US6 / T029 (FR-028/FR-029): on convergence, write the durable, mode-keyed
  // govern-convergence record inside the installation so the workflow's
  // `governing → shipped` gate (impl) — and the opt-in `specifying → implementing`
  // gate (spec) — is mechanical, not agent say-so. 024 FR-013 / TASK-139: keyed by
  // the CANONICAL node id (`resolveConvergenceItem`), matching the workflow read-side.
  // T041 (caveat): a node-less govern (orphan/legacy/standalone fixture) cannot key
  // the record; that case WARNS + still exits 0 (the workflow gate stays closed, so
  // no un-governed graduation actually occurs) — distinguishing a workflow-driven
  // orphan from a legitimate standalone govern is deferred to T041.
  let convergenceItem: string | undefined;
  try {
    convergenceItem = resolveConvergenceItem(installation, featureRoot, slug);
  } catch (err) {
    process.stderr.write(
      `govern: WARNING — could not resolve a roadmap node for the convergence record ` +
        `(${errorMessage(err)}); the governing -> shipped gate stays CLOSED until it is ` +
        `recorded (the feature cannot graduate in the workflow regardless of this exit ` +
        `code; see T041).\n`,
    );
  }
  if (convergenceItem !== undefined) {
    // AUDIT-BARRAGE codex-01 (HIGH) / claude-03: a record-WRITE failure is FATAL — the
    // CLI must not report graduation the durable gate signal does not back (US4
    // Finding-2). Nothing else is written yet, so the message is "nothing written".
    try {
      recordGovernConvergence(
        repoRoot,
        flags.mode === 'spec' ? 'spec' : 'impl',
        convergenceItem,
        featureRoot !== undefined ? [featureRoot] : [],
        new Date().toISOString(),
      );
    } catch (err) {
      process.stderr.write(
        `govern: FATAL — could not write the govern-convergence record (${errorMessage(err)}); ` +
          `nothing was written, the governing -> shipped gate stays CLOSED, and this run does ` +
          `NOT graduate. Fix the write error and re-run.\n`,
      );
      emitTerminalOutcome('fatal');
      process.exit(1);
    }
  }
  // 030 US2 (clean break): no per-phase checkpoint is written — graduation rests
  // solely on the whole-feature convergence record written above (FR-018).
  // AUDIT-BARRAGE claude-04: the override path short-circuits earlier (FR-017), so an
  // override never reaches here — the success message names only convergence.
  process.stderr.write(
    flags.mode === 'spec'
      ? 'govern: spec may graduate (convergence gate satisfied).\n'
      : 'govern: implementation governed (convergence gate satisfied).\n',
  );
  emitTerminalOutcome('graduated');
  process.exit(0);
}
