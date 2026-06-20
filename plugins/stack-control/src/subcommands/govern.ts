/**
 * plugins/stack-control/src/subcommands/govern.ts
 *
 * `stackctl govern --mode <implement|spec>` — the single-sourced audit-protocol
 * orchestration. Consolidates the two divergent bash scripts
 * (deskwork-governance/govern.sh + spec-governance/govern-spec.sh) into one
 * TS command; the bash shims now exec `stackctl govern --mode …`.
 *
 * The per-stage difference is ONLY the payload (mode strategy). The common
 * render → barrage → lift → slush → gate chain lives in src/govern/protocol.ts.
 *
 * Env parity (preserved for the shims; flags win over env when both are set):
 *   GOVERN_FEATURE_SLUG, GOVERN_DIFF_BASE, GOVERN_SPEC_PATH, GOVERN_PLAN_PATH,
 *   GOVERN_CHECKPOINT, GOVERN_CEILING, GOVERN_OVERRIDE, GOVERN_MODELS,
 *   GOVERN_BARRAGE_BIN (test stub), GOVERN_NO_SLUSH, GOVERN_PAYLOAD_BUDGET,
 *   GOVERN_FLEET_AVAILABLE (test stub: bypass the real `which` lane-availability
 *   probe so a CLI-less environment can exercise downstream govern behavior).
 *   GOVERN_REPO_ROOT is RETIRED (specs/installation-isolation R2): setting it
 *   is a loud FATAL naming the --at replacement — never a silent no-op.
 *
 * Exit codes: govern relays the gate's single decision (#432) — 0 when the gate
 * is OPEN (may graduate), 1 when the gate is BLOCKED (graduation refused), 2
 * fatal (usage error / capability or payload FATAL). govern does NOT re-derive
 * policy; it obeys the boolean the gate prints on stdout.
 *
 * Implement-mode also runs the per-codebase clone-detection step (US7 / FR-032):
 * it surfaces NEW intra-codebase duplication introduced by the governed change,
 * advisory alongside the convergence-gate verdict. See govern/clone-step.ts.
 */

import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { recordGovernConvergence } from '../govern/convergence-record.js';
import { recordOverrideGraduation } from '../govern/override-graduate.js';
import { fileURLToPath } from 'node:url';
import {
  GovernProtocolError,
  assertBarrageBinPresent,
  currentBranch,
  loadLaneCapabilitiesGoverned,
  runProtocol,
  type BarrageVars,
  type GovernTerminalKind,
} from '../govern/protocol.js';
import {
  branchDerivedSlug,
  readActiveFeatureSlug,
  resolveConvergenceItem,
  resolveFeatureFromItem,
  resolveFeatureSlug,
} from '../govern/feature-resolution.js';
import {
  assembleImplementPayload,
  CODE_AUDIT_LENS,
  CODE_ARTIFACT_FRAMING,
} from '../govern/payload-implement.js';
import {
  assembleSpecPayload,
  GovernPayloadError,
  SPEC_AUDIT_LENS,
  SPEC_ARTIFACT_FRAMING,
} from '../govern/payload-spec.js';
import { runCloneDetectionStep } from '../govern/clone-step.js';
import { runConvergenceLoop } from '../govern/convergence-loop.js';
import {
  carriedFilesForComposition,
  resolvePhaseUnit,
  resolvePrePhaseDiffBase,
} from '../govern/incremental-audit.js';
import {
  featureCheckpointKey,
  normalizeGovernedPaths,
  resolvePhaseCheckpointStatuses,
  type PhaseCheckpointStatus,
} from '../govern/phase-checkpoint-status.js';
import type { AuditUnit } from '../govern/audit-unit-types.js';
import type { ConvergenceOutcome } from '../govern/convergence-types.js';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  discoverFeatureRoots,
  resolveFeatureRoot,
} from '../scope-discovery/util/feature-root.js';
import { resolveInstallation } from '../config/installation.js';
import type { Installation } from '../config/types.js';
import { checkLifecyclePrecondition } from '../lifecycle-precondition.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import { deriveDistinctGitToplevel } from '../scope-discovery/util/git-toplevel.js';
import { computePhaseHunkBlocks, writePhaseCheckpoint } from '../govern/checkpoint-state.js';
import { type LaneCapabilityProfile } from '../govern/lane-capabilities.js';
import { negotiateFleet } from '../govern/fleet-negotiation.js';
import { selectRequestedLaneCapabilities } from '../govern/protocol.js';

/**
 * specs/015 US2 (FR-004): the per-invocation convergence ceiling govern hands the
 * loop driver. Default 1 — govern runs a SINGLE barrage pass per invocation
 * because its `dispatchFix` cannot edit code in-process (FR-005, no auto-edit);
 * the agent is the cross-invocation fixer (fix the surfaced findings, re-invoke
 * govern → a fresh bounded driver run). Raising --ceiling / GOVERN_CEILING lets
 * the driver run multiple in-process rounds, which is only useful once a real
 * in-process fixer is wired (the future autonomous loop). The driver — not skill
 * prose — owns the iterate/stop decision in every case.
 */
function resolveCeiling(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

const HERE = dirname(fileURLToPath(import.meta.url));
// src/subcommands → src → plugin root → bin/stackctl
const PLUGIN_ROOT = resolve(HERE, '..', '..');

const USAGE = [
  'Usage: stackctl govern --mode <implement|spec> [flags]',
  '',
  '  --mode <implement|spec>   Required.',
  '  --feature <slug>          Feature slug (else derived from feature/<slug>).',
  '  --item <id>               Roadmap item id — resolve the feature AUTHORITATIVELY',
  '                            from its spec: pointer (preferred over branch/marker).',
  '  --at <dir>                Resolve the installation enclosing <dir> (default: cwd).',
  '  --ceiling <N>             Convergence iteration ceiling (default 1). NOTE: govern',
  '                            applies NO in-process fix between rounds, so N>1 re-runs',
  '                            N identical barrage passes against an unchanged tree and',
  '                            stays BLOCKED — useful only once a real in-process fixer',
  '                            lands. Cross-round fixing is agent-paced: fix, re-invoke.',
  '  --override "<reason>"      Record an explicit override.',
  '  --require-models <n>      Minimum emitting models for the barrage fleet',
  '                            (default 2 — the cross-model agreement signal',
  '                            is what protocol runs exist for; specs/014 US1).',
  '  --no-slush                Disable the slush step (address every finding).',
  '  --json                    Emit the gate verdict JSON only.',
  '  implement: --diff-base <ref>   Diff base (default HEAD~1).',
  '             --phase <id>        Audit ONE tasks.md phase (per-phase unit, FR-007);',
  '                                 scopes the payload to the phase files + checkpoint phase-<id>.',
  '  spec:      --spec-path <p>      Spec under audit (else CLAUDE.md SPECKIT marker).',
  '             --plan-path <p>      Fold the plan (the after_plan checkpoint).',
  '             --checkpoint <name>  Override the checkpoint label.',
  '',
  'Exit: 0 may-graduate; 1 refused; 2 fatal (usage / capability / payload).',
].join('\n');

type Mode = 'implement' | 'spec';

interface GovernFlags {
  mode?: Mode;
  feature?: string;
  item?: string;
  at?: string;
  ceiling?: string;
  override?: string;
  requireModels?: string;
  noSlush: boolean;
  json: boolean;
  diffBase?: string;
  specPath?: string;
  planPath?: string;
  checkpoint?: string;
  phase?: string;
  help: boolean;
}

const VALUED = new Set([
  '--mode',
  '--feature',
  '--item',
  '--at',
  '--ceiling',
  '--override',
  '--require-models',
  '--diff-base',
  '--spec-path',
  '--plan-path',
  '--checkpoint',
  '--phase',
]);

function parseFlags(argv: readonly string[]): { ok: true; flags: GovernFlags } | { ok: false; error: string } {
  const flags: GovernFlags = { noSlush: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (tok === '--help' || tok === '-h') { flags.help = true; continue; }
    if (tok === '--no-slush') { flags.noSlush = true; continue; }
    if (tok === '--json') { flags.json = true; continue; }
    if (VALUED.has(tok)) {
      const value = argv[i + 1];
      // An empty-string value IS allowed (e.g. --feature "" must reach the
      // fail-loud empty-slug guard rather than be rejected as "missing value").
      if (value === undefined) {
        return { ok: false, error: `${tok} requires a value` };
      }
      i += 1;
      if (tok === '--mode') {
        if (value !== 'implement' && value !== 'spec') {
          return { ok: false, error: `--mode must be implement|spec (got '${value}')` };
        }
        flags.mode = value;
      } else if (tok === '--feature') flags.feature = value;
      else if (tok === '--item') flags.item = value;
      else if (tok === '--at') flags.at = value;
      else if (tok === '--ceiling') flags.ceiling = value;
      else if (tok === '--override') flags.override = value;
      else if (tok === '--require-models') flags.requireModels = value;
      else if (tok === '--diff-base') flags.diffBase = value;
      else if (tok === '--spec-path') flags.specPath = value;
      else if (tok === '--plan-path') flags.planPath = value;
      else if (tok === '--checkpoint') flags.checkpoint = value;
      else if (tok === '--phase') flags.phase = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${tok}` };
  }
  return { ok: true, flags };
}

/** Flag wins over env; env wins over the built-in default. */
function pick(flag: string | undefined, env: string | undefined): string | undefined {
  if (flag !== undefined) return flag;
  if (env !== undefined && env.length > 0) return env;
  return undefined;
}

function resolveBarrageBin(): string {
  const override = process.env.GOVERN_BARRAGE_BIN;
  if (override !== undefined && override.length > 0) return override;
  return join(PLUGIN_ROOT, 'bin', 'stackctl');
}

function tail(text: string, n: number): string {
  const lines = text.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

/**
 * Spec 013 (TASK-25): resolve the feature's audit-log excerpt through
 * the layout-aware `resolveFeatureRoot` helper instead of a hardcoded
 * `docs/1.0/001-IN-PROGRESS/<slug>` path. A `specs/NNN-<slug>` feature's
 * audit-log was invisible to the old hardcoded path, so the barrage
 * prompt silently carried an empty excerpt (a forbidden fallback). An
 * empty string here means there is genuinely no prior audit-log to show
 * (no findings yet) — NOT a masked wrong-path miss.
 */
export async function resolveAuditLogExcerpt(
  repoRoot: string,
  slug: string,
  tailLines = 40,
): Promise<string> {
  const { root } = await resolveFeatureRoot({ repoRoot, slug });
  if (root === undefined) return '';
  const auditLog = join(root, 'audit-log.md');
  return existsSync(auditLog) ? tail(readFileSync(auditLog, 'utf8'), tailLines) : '';
}

/**
 * Resolve the spec path from --spec-path/env, else the CLAUDE.md SPECKIT
 * marker — read at the installation root first, then at the derived git
 * toplevel (the transitional layout keeps the agent-context file at the
 * monorepo root; specs/installation-isolation R3's external-anchor rule).
 */
function resolveSpecPath(installationRoot: string, flagValue: string | undefined): string {
  const explicit = pick(flagValue, process.env.GOVERN_SPEC_PATH);
  if (explicit !== undefined) return isAbsolute(explicit) ? explicit : join(installationRoot, explicit);
  const bases = [installationRoot];
  // Realpath-aware distinctness (AUDIT-20260611-04): the shared helper
  // returns null when the toplevel IS the installation root, including
  // through a symlinked spelling (macOS /var vs /private/var) — the old
  // raw-string `top !== installationRoot` comparison read the same
  // CLAUDE.md twice via two "distinct" bases.
  const top = deriveDistinctGitToplevel(installationRoot);
  if (top !== null) bases.push(top);
  for (const base of bases) {
    const claudeMd = join(base, 'CLAUDE.md');
    if (!existsSync(claudeMd)) continue;
    const text = readFileSync(claudeMd, 'utf8');
    const m = /specs\/[^\s]+\.md/.exec(text);
    if (m !== null) return join(base, dirname(m[0]), 'spec.md');
  }
  throw new GovernProtocolError(
    'govern: FATAL — no spec path in --spec-path/GOVERN_SPEC_PATH and no specs/<dir>/*.md in the CLAUDE.md SPECKIT marker.',
  );
}

/**
 * claude-20260612-r3-01/-02: the verdict-surface summary of the audit-unit's
 * path-scope exclusions (claude-20260612-03), as a pure function so it is
 * unit-tested without spinning the protocol. Returns `undefined` when nothing was
 * excluded (no line emitted). The excluded file list is placed LAST, after a
 * single `: `, so a consumer can extract it cleanly (`sed 's/^.*: //'`) — the prose
 * rationale precedes it rather than trailing it.
 */
export function formatScopeExclusionSummary(
  skippedOutOfScope: readonly string[],
): string | undefined {
  if (skippedOutOfScope.length === 0) return undefined;
  return (
    `govern: audit-unit path-scope excluded ${skippedOutOfScope.length} untracked ` +
    `file(s) from the folded payload (FR-006 parked-scaffold/out-of-phase exclusion — ` +
    `audit them by widening the scope or committing first): ${skippedOutOfScope.join(', ')}`
  );
}

export function buildImplementVars(
  repoRoot: string,
  slug: string,
  diffBaseFlag: string | undefined,
  checkpointFlag: string | undefined,
  // specs/015 + 014 merge: pathScope (per-phase inclusion, 015) AND
  // featureRoot/excludeRoots/excludePaths (self-reference/cross-feature/bookkeeping
  // exclusion, 014 US5) are threaded together into the assembler. `auditLogExcerpt`
  // is GONE: 015 SC-005 drops the excerpt from the implement payload entirely
  // (the body sets audit_log_excerpt: ''), so there is no excerpt to pass.
  pathScope?: readonly string[],
  featureRoot?: string,
  excludeRoots?: readonly string[],
  excludePaths?: readonly string[],
): { vars: BarrageVars; checkpoint: string; skippedOutOfScope: readonly string[] } {
  const base = diffBaseFlag ?? pick(undefined, process.env.GOVERN_DIFF_BASE) ?? 'HEAD~1';
  const budgetEnv = process.env.GOVERN_PAYLOAD_BUDGET;
  // specs/014 US5: thread the resolved feature root so the payload is
  // self-reference-free (audit-log excluded from both arms), plus the
  // repo's full feature-root list (`excludeRoots`, from the async
  // discoverFeatureRoots — this builder stays sync) so the untracked
  // fold drops OTHER features' scaffolds while still folding the
  // feature's own files and new source modules (AUDIT-20260611-01),
  // plus the governance-bookkeeping store paths (`excludePaths`, from
  // the backlog root seam — AUDIT-20260611-08: per-round backlog
  // bookkeeping commits land in the diff range the same way lift
  // commits do, re-feeding prior findings through a channel the
  // feature-root pathspec misses). The labeled audit_log_excerpt block
  // below stays the ONLY audit-log content in the payload (013/TASK-25).
  const payload = assembleImplementPayload({
    installationRoot: repoRoot,
    base,
    ...(featureRoot !== undefined ? { featureRoot } : {}),
    ...(excludeRoots !== undefined ? { excludeRoots } : {}),
    ...(excludePaths !== undefined ? { excludePaths } : {}),
    ...(budgetEnv !== undefined && budgetEnv.length > 0
      ? { budgetBytes: Number.parseInt(budgetEnv, 10) }
      : {}),
    // specs/015 (FR-006/D7): bound the fold to the audit unit's explicit path
    // scope when one exists; otherwise keep the whole-feature pre-015 behavior.
    ...(pathScope !== undefined && pathScope.length > 0 ? { pathScope } : {}),
  });
  if (payload.empty) {
    process.stderr.write(
      `govern: empty diff against ${base} — running barrage over the plan context only (edge case; no defects expected).\n`,
    );
  }
  const vars: BarrageVars = {
    feature_slug: slug,
    workplan_summary: `Governance pass over the just-implemented work for feature '${slug}', diffed against ${base}. The differentiated back half audits a plan it did not author or execute.`,
    diff: payload.diff,
    // specs/015 (FR-006/D7/SC-005): the implement-mode payload DROPS the feature's
    // own prior audit-log excerpt — the self-referential generator that
    // manufactured findings about the audit-log's own prose. The dampener/gate
    // still read the audit-log FILE directly for findings; only the audited
    // payload the models read excludes it.
    audit_log_excerpt: '',
    commit_subjects: payload.commitSubjects,
    audit_lens: CODE_AUDIT_LENS,
    artifact_framing: CODE_ARTIFACT_FRAMING,
  };
  const checkpoint =
    checkpointFlag ?? pick(undefined, process.env.GOVERN_CHECKPOINT) ?? 'after_clarify';
  // claude-20260612-03: return the structured path-scope exclusions so they reach
  // the govern verdict surface as a consolidated, machine-greppable summary — not
  // only as the interleaved per-file stderr warns assembleImplementPayload emits.
  return { vars, checkpoint, skippedOutOfScope: payload.skippedOutOfScope };
}

/**
 * AUDIT-20260611-08: the governance backlog task store rides into the
 * implement payload's diff range via per-round bookkeeping commits — the
 * same lift-commit-in-range mechanism US5 closed for the audit-log, but
 * through a store that lives outside the feature root's pathspec.
 * Implement mode threads the store into the assembler's `excludePaths`.
 *
 * specs/installation-isolation US3 (TASK-40 / AUDIT-20260611-13): the
 * store derives from the RESOLVED INSTALLATION RECORD, never the cwd —
 * the recorded seam bug was exactly this exclusion silently diverging
 * from the payload's anchor when govern ran from a different shell
 * directory. The STACKCTL_BACKLOG_DIR seam still wins when set (an
 * explicit operator override; the `backlog` binary hardcodes the
 * `backlog/` subdir under whichever root applies).
 */
function resolveGovernExcludePaths(installation: Installation): readonly string[] {
  const seam = process.env.STACKCTL_BACKLOG_DIR;
  const excludes = [
    seam !== undefined && seam !== ''
      ? join(seam, 'backlog')
      : join(dirname(installation.resolved.backlog), 'backlog'),
    join(installation.root, '.stack-control', 'govern', 'phase-checkpoints'),
    // T029 / TASK-57: the barrage's own run artifacts are control-plane noise.
    // Folding them re-feeds prior rounds' prompts + findings to the fleet, so the
    // payload compounds recursively each round. Exclude as defense-in-depth —
    // independent of whether the installation gitignores the dir.
    join(installation.root, '.stack-control', 'audit-runs'),
  ];
  return excludes;
}

// PhaseCheckpointStatus, normalizeGovernedPaths, and resolvePhaseCheckpointStatuses
// were extracted to ../govern/phase-checkpoint-status.js (025 US1) so the per-phase
// graduate gate reuses the SAME currency logic this command writes (no clone).

/**
 * The files a phase's audit ACTUALLY covered: `git diff --name-only <base> --
 * <declaredScope>`. Recorded in the checkpoint so whole-feature composition carries
 * these exact files instead of the declared (possibly directory) scope — closing
 * the TASK-129 cross-cutting blind spot. Fails loud on a git error (the audit it
 * follows already ran git successfully, so a failure here is a real anomaly, not a
 * fallback case).
 */
function resolveAuditedFiles(
  repoRoot: string,
  base: string,
  declaredScope: readonly string[],
): readonly string[] {
  const r = spawnSync('git', ['-C', repoRoot, 'diff', '--name-only', base, '--', ...declaredScope], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || typeof r.stdout !== 'string') {
    throw new GovernProtocolError(
      `govern: FATAL — could not resolve audited files via 'git diff --name-only ${base}' ` +
        `(exit ${r.status ?? 'null'}): ${(r.stderr ?? '').toString().trim()}`,
    );
  }
  return r.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The current git HEAD sha at `repoRoot`, recorded on the phase checkpoint so a
 * LATER phase can resolve its diff-base to THIS phase's governed commit (029 US5,
 * FR-020). Returns undefined when git is unavailable / HEAD is unresolvable
 * (detached pre-first-commit, no git) — the checkpoint is then written WITHOUT a
 * governedSha and the next phase's resolver falls back to --diff-base/HEAD~1
 * (graceful, mirroring computePhaseHunkBlocks).
 */
function currentHeadSha(repoRoot: string): string | undefined {
  const r = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (r.status !== 0 || typeof r.stdout !== 'string') return undefined;
  const sha = r.stdout.trim();
  return sha.length > 0 ? sha : undefined;
}

/**
 * Write (or refresh) the per-phase checkpoint for a resolved `phase`-granularity
 * unit at the CURRENT tree state — the single home shared by the normal
 * convergence-graduation path AND the per-phase `--override` short-circuit
 * (specs/029 US4 + US7). A per-phase override graduates THIS phase's findings, so
 * its checkpoint must still be written/refreshed — otherwise the phase has no
 * current checkpoint and the `all-phase-checkpoints-current` gate refuses to let
 * LATER phases advance. The `checkpoint` field is derived INTERNALLY from
 * `phaseUnit.auditLogSection` (AUDIT-BARRAGE claude-04) — neither caller supplies it,
 * so the normal-graduation and `--override` paths can never write divergent values. If
 * git is unavailable, `computePhaseHunkBlocks` returns [] and we write WITHOUT
 * hunkBlocks (graceful). No-op when the phase has no resolved status.
 */
function writeResolvedPhaseCheckpoint(args: {
  readonly repoRoot: string;
  readonly phaseUnit: AuditUnit & { readonly phaseId: string };
  readonly phaseStatus: PhaseCheckpointStatus;
  readonly phaseCheckpointKey: string | undefined;
  readonly slug: string;
}): void {
  // AUDIT-20260620-124 (task-360): both call sites (now via
  // writePhaseCheckpointAfterRecordOrFatal) ignore the written path — return void
  // rather than declaring a `string` no caller consumes.
  const { repoRoot, phaseUnit, phaseStatus, phaseCheckpointKey, slug } = args;
  const auditedFiles = resolveAuditedFiles(repoRoot, phaseUnit.diffScope.base, phaseStatus.files);
  const hunkBlocks = computePhaseHunkBlocks(repoRoot, auditedFiles, phaseUnit.diffScope.base);
  // 029 US5 (FR-020): record the governed HEAD so a LATER phase resolves its
  // diff-base to this phase's pre-phase commit (the union-payload anchor).
  const governedSha = currentHeadSha(repoRoot);
  writePhaseCheckpoint(repoRoot, {
    version: 1,
    // Canonical key (AUDIT codex-01/claude-02) — what the US1 gate reads under.
    featureSlug: phaseCheckpointKey ?? featureCheckpointKey(slug),
    phaseId: phaseUnit.phaseId,
    // AUDIT-BARRAGE claude-04: derive `checkpoint` from the SINGLE source
    // (`phaseUnit.auditLogSection`) inside the shared helper, so the normal-graduation
    // and `--override` paths can NEVER write divergent checkpoint values through it.
    checkpoint: phaseUnit.auditLogSection,
    auditLogSection: phaseUnit.auditLogSection,
    scopeFingerprint: phaseStatus.scopeFingerprint,
    passedAt: new Date().toISOString(),
    governedPaths: phaseStatus.files,
    auditedFiles,
    ...(governedSha !== undefined ? { governedSha } : {}),
    ...(hunkBlocks.length > 0 ? { hunkBlocks } : {}),
  });
}

/**
 * Write the per-phase checkpoint AFTER the convergence record has landed (record-first
 * ordering — AUDIT-BARRAGE codex-01/codex-02/claude-01). A checkpoint-write failure here
 * is FATAL with an ACCURATE message: the convergence record IS already written, so the
 * failure does NOT wrongly advance the lifecycle — the `governing → shipped` gate stays
 * CLOSED because `all-phase-checkpoints-current` is unmet until the checkpoint lands.
 * Re-running writes it. A `GovernProtocolError` from the caller's contract checks is NOT
 * caught here (it propagates to the main handler).
 */
function writePhaseCheckpointAfterRecordOrFatal(args: {
  readonly repoRoot: string;
  readonly phaseUnit: AuditUnit & { readonly phaseId: string };
  readonly phaseStatus: PhaseCheckpointStatus;
  readonly phaseCheckpointKey: string | undefined;
  readonly slug: string;
}): void {
  try {
    writeResolvedPhaseCheckpoint(args);
  } catch (err) {
    process.stderr.write(
      `govern: FATAL — the convergence record IS written, but the per-phase checkpoint ` +
        `write failed (${errorMessage(err)}); the governing -> shipped gate stays CLOSED ` +
        `(all-phase-checkpoints-current is unmet) until the checkpoint lands — no wrong ` +
        `advance. Re-run to write the checkpoint.\n`,
    );
    emitTerminalOutcome('fatal');
    process.exit(1);
  }
}

function renderCheckpointRequirements(statuses: readonly PhaseCheckpointStatus[]): string {
  return statuses.map((status) => `${status.state} phase-${status.phaseId}`).join(', ');
}

function assertPriorPhaseCheckpointsCurrent(
  statuses: readonly PhaseCheckpointStatus[],
  phaseId: string,
): void {
  const phaseIndex = statuses.findIndex((status) => status.phaseId === phaseId);
  if (phaseIndex < 0) return;
  const unmet = statuses.slice(0, phaseIndex).filter((status) => status.state !== 'current');
  if (unmet.length > 0) {
    throw new GovernProtocolError(
      `govern: FATAL — phase '${phaseId}' cannot advance until earlier required checkpoints are current: ${renderCheckpointRequirements(unmet)}.`,
    );
  }
}

function preflightNegotiatedFleet(
  laneCapabilities: readonly LaneCapabilityProfile[],
  requestedModels: string | undefined,
  requireModels: number,
): readonly LaneCapabilityProfile[] {
  const selected = selectRequestedLaneCapabilities(laneCapabilities, requestedModels);
  const negotiation = negotiateFleet(selected, requireModels);
  if (negotiation.disposition !== 'accepted') {
    throw new GovernProtocolError(
      `govern: FATAL — fleet negotiation failed before payload assembly; ` +
        `accepted ${negotiation.acceptedFleet.length}/${requireModels} viable lane(s). ` +
        `Rejected lanes: ${negotiation.rejectedLanes.join(', ') || 'none'}.`,
      2,
      'negotiation-failed',
    );
  }
  return selected;
}

async function resolveGovernFeatureRoot(
  repoRoot: string,
  slug: string,
): Promise<Awaited<ReturnType<typeof resolveFeatureRoot>>> {
  try {
    return await resolveFeatureRoot({ repoRoot, slug });
  } catch (err) {
    throw new GovernProtocolError(`govern: FATAL — ${errorMessage(err)}`);
  }
}

export function buildSpecVars(
  repoRoot: string,
  slug: string,
  specPathFlag: string | undefined,
  planPathFlag: string | undefined,
  checkpointFlag: string | undefined,
  auditLogExcerpt: string,
): { vars: BarrageVars; checkpoint: string; skippedOutOfScope: readonly string[] } {
  const specPath = resolveSpecPath(repoRoot, specPathFlag);
  const planPath = pick(planPathFlag, process.env.GOVERN_PLAN_PATH);
  const checkpoint = pick(checkpointFlag, process.env.GOVERN_CHECKPOINT);
  const budgetEnv = process.env.GOVERN_PAYLOAD_BUDGET;
  const payload = assembleSpecPayload({
    specPath,
    planPath: planPath !== undefined ? (isAbsolute(planPath) ? planPath : join(repoRoot, planPath)) : undefined,
    checkpoint,
    ...(budgetEnv !== undefined && budgetEnv.length > 0
      ? { budgetBytes: Number.parseInt(budgetEnv, 10) }
      : {}),
  });
  const vars: BarrageVars = {
    feature_slug: slug,
    workplan_summary: `Definition-time governance pass over the SPEC for feature '${slug}' (${specPath}${payload.planNote}). The design-phase barrage audits a spec — internal contradictions, ambiguity, unstated assumptions, missing edge cases — not produced code.`,
    diff: payload.diff,
    audit_log_excerpt: auditLogExcerpt,
    commit_subjects: '',
    audit_lens: SPEC_AUDIT_LENS,
    artifact_framing: SPEC_ARTIFACT_FRAMING,
  };
  // Spec mode folds the spec + plan, not a path-scoped untracked tree — no
  // path-scope exclusions apply (claude-20260612-03: uniform return shape).
  return { vars, checkpoint: payload.checkpoint, skippedOutOfScope: [] };
}

/**
 * Emit the single machine-readable terminal line (T028 / US5 — AUDIT-BARRAGE-codex-01,
 * 021 phase-2 cross-model finding). Every govern EXECUTION exit routes through
 * here so a consumer keying on `govern: terminal-outcome=<kind>` sees exactly one
 * line — the pre-try usage/preflight `process.exit(2)` paths, the gated
 * success/blocked exits, and the unexpected-exception fallthrough. The `--help`
 * early return below is the ONE deliberate non-emitter (it does no governance
 * work, so it has no outcome to report).
 */
function emitTerminalOutcome(kind: GovernTerminalKind): void {
  process.stderr.write(`govern: terminal-outcome=${kind}\n`);
}

export async function runGovern(args: string[]): Promise<void> {
  const parsed = parseFlags(args);
  if (parsed.ok && parsed.flags.help) {
    // Usage-info early return — NOT a governed run, so no terminal-outcome by
    // design (the "every exit" contract is scoped to execution exits; locked by
    // the `--help emits no terminal-outcome` test).
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`govern: ${parsed.error}\n${USAGE}\n`);
    emitTerminalOutcome('usage');
    process.exit(2);
  }
  const flags = parsed.flags;
  if (flags.mode === undefined) {
    process.stderr.write(`govern: --mode <implement|spec> is required\n${USAGE}\n`);
    emitTerminalOutcome('usage');
    process.exit(2);
  }

  // specs/014 US1 (Clarification 2026-06-11): govern-driven barrages default
  // to a fleet floor of 2 — the cross-model agreement signal is what protocol
  // runs exist for. --require-models overrides in either direction
  // (1 = lenient opt-out; >2 = stricter opt-in).
  let requireModels = 2;
  if (flags.requireModels !== undefined) {
    const n = Number(flags.requireModels);
    if (!Number.isInteger(n) || n < 1) {
      process.stderr.write(
        `govern: --require-models requires a positive integer, got '${flags.requireModels}'\n${USAGE}\n`,
      );
      emitTerminalOutcome('usage');
      process.exit(2);
    }
    requireModels = n;
  }

  // specs/installation-isolation R2: GOVERN_REPO_ROOT is retired. An
  // ignored variable would be a silent no-op, so a set variable is a
  // loud refusal naming the replacement.
  const legacyEnvRoot = process.env.GOVERN_REPO_ROOT;
  if (legacyEnvRoot !== undefined && legacyEnvRoot.length > 0) {
    process.stderr.write(
      'govern: FATAL — GOVERN_REPO_ROOT is retired (specs/installation-isolation R2); ' +
        'use --at <dir> to name the installation enclosing <dir> explicitly.\n',
    );
    emitTerminalOutcome('fatal');
    process.exit(2);
  }

  // specs/installation-isolation US3 (R1): resolve the installation ONCE
  // at verb entry — the diff engine, run dirs, config reads, and the
  // bookkeeping exclusions all derive from this record. No enclosing
  // installation -> uniform loud refusal (US2).
  let installation: Installation;
  try {
    installation = resolveInstallation(flags.at ?? process.cwd());
  } catch (err) {
    process.stderr.write(`govern: FATAL — ${errorMessage(err)}\n`);
    emitTerminalOutcome('fatal');
    process.exit(2);
  }

  try {
    const repoRoot = installation.root;
    // 024 FR-011: resolve the feature from an existing feature root — explicit,
    // then the branch slug (when it resolves), then the Spec Kit active-feature
    // marker — so govern runs on the session-pinned branch (where the branch slug
    // is NOT a feature slug). Pre-compute which candidate slugs have an existing
    // feature root (resolveFeatureRoot is async), then resolve synchronously.
    //
    // 024 codex-01 (HIGH): when an explicit `--item` is supplied (the authoritative
    // hook/operator path), resolve the feature from the item's spec pointer and use
    // it as the explicit slug — never guess from the incidental branch/marker.
    const itemSlug = flags.item !== undefined ? resolveFeatureFromItem(installation, flags.item) : undefined;
    // 024 codex-01 (HIGH): when an explicit item is named (the authoritative path), gate
    // govern through the compass — govern is a lifecycle surface and MUST NOT run on an item
    // whose phase is not ready for governing (a `--item` entry bypasses execute's precondition,
    // so the gate has to live here too). Refuse loud on a non-zero verdict, before any payload
    // assembly or barrage.
    if (flags.item !== undefined) {
      const pre = checkLifecyclePrecondition({ item: flags.item, intent: 'govern', cwd: installation.root });
      if (!pre.proceed) {
        process.stderr.write(
          `govern: REFUSED — compass verdict '${pre.verdict.outcome}' for '${flags.item}': ${pre.verdict.reason}\n`,
        );
        emitTerminalOutcome('fatal');
        // Propagate the compass exit code (ahead=3 / off-rail=4), not a flat usage 2 — preserve
        // the ahead/off-rail distinction the compass contract establishes (AUDIT-BARRAGE claude-03).
        process.exit(pre.verdict.exitCode || 1);
      }
    }
    const explicitSlug = itemSlug ?? pick(flags.feature, process.env.GOVERN_FEATURE_SLUG);
    const branchForSlug = currentBranch(repoRoot);
    // Only consult the active-feature marker when it is actually a resolution candidate —
    // i.e. when no explicit slug (--item/--feature/GOVERN_FEATURE_SLUG) already resolved the
    // feature (AUDIT-BARRAGE codex-02/claude-01). readActiveFeatureSlug fails loud on a
    // malformed marker (codex-03); reading it eagerly would FATAL the explicit-override path —
    // the very escape hatch for a broken marker. resolveFeatureSlug short-circuits on explicit,
    // so the marker is unused in that case anyway.
    const markerSlug = explicitSlug !== undefined ? null : readActiveFeatureSlug(repoRoot);
    const candidateSlugs = [branchDerivedSlug(branchForSlug), markerSlug].filter(
      (s): s is string => s !== null && s.length > 0,
    );
    const existingSlugs = new Set<string>();
    for (const candidate of candidateSlugs) {
      try {
        const { root } = await resolveFeatureRoot({ repoRoot, slug: candidate });
        if (root !== undefined) existingSlugs.add(candidate);
      } catch {
        // not found — not a candidate
      }
    }
    const slug = resolveFeatureSlug({
      explicit: explicitSlug,
      branch: branchForSlug,
      markerSlug,
      featureRootExists: (s) => existingSlugs.has(s),
    });

    // specs/015 US4 (FR-007 / T025): a `--phase <id>` selector audits ONE
    // tasks.md phase as a bounded unit — the SAME convergence protocol/loop, a
    // smaller payload. Resolve the phase unit from the feature's tasks.md, scope
    // the untracked fold + committed diff to the phase's files, and run the loop
    // under the per-phase checkpoint (`phase-<id>`). `--phase` is implement only.
    //
    // 029 US4 (FR-017): this per-phase resolution runs BEFORE the `--override`
    // short-circuit below — and BEFORE the barrage-bin / fleet preflight / payload /
    // loop — so a per-phase override can write the SAME `phase-<id>` checkpoint a
    // normal graduation would, while still firing ZERO render/barrage/lift/slush. It
    // does NO barrage work (it resolves the unit + the prior-phase staleness gate).
    let phaseUnit: AuditUnit | undefined;
    let payloadPathScope: readonly string[] | undefined;
    let phaseCheckpointStatuses: readonly PhaseCheckpointStatus[] | undefined;
    // The canonical checkpoint namespace key (AUDIT codex-01/claude-02): derived from the
    // resolved feature ROOT via featureCheckpointKey — the SAME spec-anchored key the US1
    // gate reads under, NOT the (possibly branch/explicit) `slug`. Set where `root` resolves.
    let phaseCheckpointKey: string | undefined;
    // US1 true-composition (operator decision 2026-06-14): whole-feature govern
    // EXCLUDES the files of converged-and-unchanged phases from the payload (it
    // carries them) — absolute paths threaded into the assembler's excludePaths.
    let compositionExcludePaths: readonly string[] = [];
    if (flags.mode === 'implement' && flags.phase !== undefined) {
      const { root } = await resolveGovernFeatureRoot(repoRoot, slug);
      if (root === undefined) {
        throw new GovernProtocolError(
          `govern: FATAL — --phase given but feature '${slug}' root not found (cannot resolve tasks.md).`,
        );
      }
      const tasksPath = join(root, 'tasks.md');
      if (!existsSync(tasksPath)) {
        throw new GovernProtocolError(
          `govern: FATAL — --phase given but tasks.md not found at ${tasksPath}.`,
        );
      }
      const fallbackBase =
        flags.diffBase ?? pick(undefined, process.env.GOVERN_DIFF_BASE) ?? 'HEAD~1';
      phaseCheckpointKey = featureCheckpointKey(root);
      phaseCheckpointStatuses = resolvePhaseCheckpointStatuses(repoRoot, phaseCheckpointKey, tasksPath);
      assertPriorPhaseCheckpointsCurrent(phaseCheckpointStatuses, flags.phase);
      // 029 US5 (FR-020): resolve the diff-base to the PRE-PHASE commit — the
      // governed HEAD of the latest prior phase — so the payload audits the UNION
      // of this phase's changed files across ALL its commits, not just the HEAD~1
      // delta (the TASK-263 "diff omits the fix" under-scope). An explicit
      // --diff-base / GOVERN_DIFF_BASE still wins as the fallback (phase 1, or a
      // pre-US5 prior checkpoint with no governedSha).
      const diffBase = resolvePrePhaseDiffBase({
        phaseId: flags.phase,
        orderedPhaseIds: phaseCheckpointStatuses.map((status) => status.phaseId),
        governedShaByPhase: new Map(
          phaseCheckpointStatuses.map((status) => [status.phaseId, status.governedSha]),
        ),
        fallbackBase,
      });
      phaseUnit = resolvePhaseUnit({ tasksPath, phaseId: flags.phase, diffBase });
      payloadPathScope = normalizeGovernedPaths(repoRoot, phaseUnit.diffScope.files);
      if (payloadPathScope.length === 0) {
        throw new GovernProtocolError(
          `govern: FATAL — phase '${flags.phase}' resolved to an empty path scope; refine tasks.md boundaries before governing this phase.`,
        );
      }
    } else if (flags.mode === 'implement') {
      const { root } = await resolveGovernFeatureRoot(repoRoot, slug);
      if (root !== undefined) {
        const tasksPath = join(root, 'tasks.md');
        if (existsSync(tasksPath)) {
          const diffBase =
            flags.diffBase ?? pick(undefined, process.env.GOVERN_DIFF_BASE) ?? 'HEAD~1';
          phaseCheckpointKey = featureCheckpointKey(root);
          phaseCheckpointStatuses = resolvePhaseCheckpointStatuses(repoRoot, phaseCheckpointKey, tasksPath);
          // TRUE COMPOSITION (operator decision 2026-06-14, US1 — TASK-120/121):
          // whole-feature govern does NOT gate on missing/stale checkpoints. It
          // CARRIES converged-and-unchanged phases (excludes their files) and
          // re-audits everything else — changed / missing / stale phases AND
          // cross-cutting code owned by no phase. EXCLUSION (not inclusion) is what
          // makes the cross-cutting remainder visible, so all-carried audits ONLY
          // the cross-cutting diff (the whole diff minus every phase's files),
          // never the whole feature.
          // The after_implement unit is the whole-feature payload (exclusion-based
          // scope, below) under the `after_implement` checkpoint label. Construct
          // it explicitly — the scope it audits is "the diff minus carried files",
          // expressed via compositionExcludePaths, not an inclusion file list.
          phaseUnit = {
            granularity: 'feature',
            diffScope: { base: diffBase, files: [] },
            auditLogSection: 'after_implement',
          };
          // Carry only the files current phases ACTUALLY audited (their recorded
          // auditedFiles), never their declared DIRECTORY scope — so a cross-cutting
          // change under a current phase's directory is re-audited, not hidden
          // (TASK-129). A file shared with a missing/stale phase is still dropped
          // (021 phase-7 AUDIT-BARRAGE-codex-01; phase ownership is not disjoint —
          // govern.ts belongs to several phases). A current phase with no recorded
          // auditedFiles (pre-TASK-129 checkpoint) carries nothing — re-audited.
          const carriedFiles = carriedFilesForComposition(
            phaseCheckpointStatuses.map((status) => ({
              state: status.state,
              declaredFiles: status.files,
              auditedFiles: status.auditedFiles,
            })),
          );
          compositionExcludePaths = carriedFiles.map((rel) => join(repoRoot, rel));
          // Whole-feature payload (undefined scope) MINUS the carried phase files
          // (compositionExcludePaths, merged into excludePaths below).
          payloadPathScope = undefined;
        }
      }
    }

    // specs/029 US4 (FR-017/018): the `--override` SHORT-CIRCUIT. When an override
    // reason is supplied, govern graduates THIS invocation with ZERO
    // render/barrage/lift/slush — it records the attributable override graduation
    // (the "OPEN by override" line + the convergence record) and returns. Detected
    // HERE — AFTER the per-phase unit + prior-phase staleness gate resolve above, but
    // BEFORE the barrage bin / fleet preflight / payload / loop below — so none of the
    // barrage work fires. A per-phase override (`--phase <id> --override`) STILL writes
    // the `phase-<id>` checkpoint at the current tree state (029 US7 — otherwise the
    // graduated phase has no current checkpoint and the all-phase-checkpoints-current
    // gate would refuse to let LATER phases advance). A whole-feature override (no
    // `--phase`) writes no per-phase checkpoint (there is no single phase to record).
    // Per-invocation only: no fingerprint-keyed marker persists.
    // specs/029 US4 (FR-017/018; AUDIT-BARRAGE codex-02/claude-02): a SUPPLIED-but-blank
    // override reason — from the `--override` flag OR the `GOVERN_OVERRIDE` env var —
    // must FAIL LOUD, never silently graduate with a blank attribution NOR fall through
    // to a full barrage. A genuinely-absent override (both undefined) is unchanged (the
    // normal barrage path below). Guard the PICKED value so BOTH sources are covered,
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
    if (overrideReason !== undefined) {
      // AUDIT-BARRAGE claude-03 (not a redundant resolve): the normal-path `featureRoot`
      // is resolved LATER (below), and the override path `process.exit`s before reaching
      // it — the two resolves are mutually exclusive, so exactly ONE runs per invocation.
      const { root: overrideRoot } = await resolveGovernFeatureRoot(repoRoot, slug);
      // specs/029 US4 (FINDING 2, codex HIGH): the override's CLI success MUST NOT
      // diverge from the durable convergence record (the `governing -> shipped` gate
      // signal). Resolve the canonical roadmap node FIRST — before any per-phase
      // checkpoint write, so nothing is half-written — and FAIL LOUD when it cannot
      // resolve (throws OR yields undefined: orphan/legacy/standalone with no node).
      // Previously this WARNED and still graduated (printed "(overridden)", emitted
      // `graduated`, exited 0) while NO record was written, so an unattended consumer
      // saw a green CLI for a state the durable gate considers non-graduated. A clean
      // override graduation now ALWAYS leaves a durable `override: true` record.
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
      // AUDIT-BARRAGE codex-01 (HIGH) / claude-01: record-first ordering, with the two
      // durable writes in SEPARATE fail-loud blocks carrying ACCURATE messages. The
      // record is written FIRST: a record failure FATALs with "nothing written, gate
      // closed" before the checkpoint is touched (no orphan checkpoint). The checkpoint
      // is written SECOND via the shared helper: a checkpoint failure FATALs with "the
      // record IS written; the shipped gate stays CLOSED via all-phase-checkpoints-current
      // until the checkpoint lands" — the accurate state (NOT "gate closed"), and the
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
      // Per-phase override: refresh the `phase-<id>` checkpoint AFTER the record landed.
      // The whole-feature override branch (granularity !== 'phase') writes no checkpoint.
      if (phaseUnit?.granularity === 'phase' && phaseUnit.phaseId !== undefined) {
        const phaseId = phaseUnit.phaseId;
        // AUDIT-BARRAGE claude-03: a resolved phase with no status is a contract
        // violation (phase resolved + prior-phase gate passed), not a normal skip —
        // fail loud (propagates to the main handler) rather than silently omit it.
        const phaseStatus = phaseCheckpointStatuses?.find((status) => status.phaseId === phaseId);
        if (phaseStatus === undefined) {
          throw new GovernProtocolError(
            `govern: FATAL — phase '${phaseId}' resolved for --override but has no ` +
              `checkpoint status; cannot record the per-phase checkpoint.`,
          );
        }
        writePhaseCheckpointAfterRecordOrFatal({
          repoRoot,
          phaseUnit: { ...phaseUnit, phaseId },
          phaseStatus,
          phaseCheckpointKey,
          slug,
        });
      }
      process.stderr.write(
        flags.mode === 'spec'
          ? 'govern: spec may graduate (overridden).\n'
          : 'govern: implementation governed (overridden).\n',
      );
      emitTerminalOutcome('graduated');
      process.exit(0);
    }

    const barrageBin = resolveBarrageBin();
    assertBarrageBinPresent(barrageBin);
    const stackctl = join(PLUGIN_ROOT, 'bin', 'stackctl');

    const requestedModels = pick(undefined, process.env.GOVERN_MODELS);
    const laneCapabilities =
      flags.mode === 'implement'
        ? preflightNegotiatedFleet(
            await loadLaneCapabilitiesGoverned(repoRoot),
            requestedModels,
            requireModels,
          )
        : undefined;

    // specs/014 US5: resolve the audit-log excerpt (spec mode), the feature root
    // and the full feature-root list (excludeRoots) so the implement payload is
    // self-reference-free + cross-feature-clean, plus the governance backlog store
    // (excludePaths). AUDIT-20260611-12: the resolver THROWS on an ambiguous Spec
    // Kit slug — translate into the same exit-2 FATAL channel as the
    // unresolvable-root refusal below (the outer catch only handles
    // GovernProtocolError/GovernPayloadError). specs/015 SC-005: implement mode
    // drops the excerpt from its OWN payload, but the excerpt is still resolved
    // here for spec mode + the root is still needed for the exclusions.
    let auditLogExcerpt: string;
    let featureRoot: string | undefined;
    let excludeRoots: readonly string[] | undefined;
    try {
      auditLogExcerpt = await resolveAuditLogExcerpt(repoRoot, slug);
      ({ root: featureRoot } = await resolveFeatureRoot({ repoRoot, slug }));
      excludeRoots =
        flags.mode === 'implement' && featureRoot !== undefined
          ? await discoverFeatureRoots(repoRoot)
          : undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`govern: FATAL — ${msg}\n`);
      emitTerminalOutcome('fatal');
      process.exit(2);
    }
    // AUDIT-20260611-04: implement mode REFUSES to run without a resolved feature
    // root (an undefined root used to revert the assembler to the pre-014
    // self-referential repo-wide payload, silently). Fail loud at the decision site.
    if (flags.mode === 'implement' && featureRoot === undefined) {
      process.stderr.write(
        `govern: FATAL — feature '${slug}' not found under ${join(repoRoot, 'specs')}/<NNN>-${slug} (speckit) or ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/${slug} (legacy-docs).\n`,
      );
      emitTerminalOutcome('fatal');
      process.exit(2);
    }
    // AUDIT-20260611-08: thread the governance backlog store so its bookkeeping
    // commits/files are excluded from both payload arms.
    const excludePaths =
      flags.mode === 'implement' && featureRoot !== undefined
        ? [...resolveGovernExcludePaths(installation), ...compositionExcludePaths]
        : undefined;
    // specs/015 + 014 merge: buildImplementVars threads BOTH the per-phase
    // pathScope (015 US4 — phaseUnit's files, and its `phase-<id>` checkpoint when
    // present) AND the 014 US5 exclusion inputs (featureRoot/excludeRoots/excludePaths).
    const built =
      flags.mode === 'spec'
        ? buildSpecVars(repoRoot, slug, flags.specPath, flags.planPath, flags.checkpoint, auditLogExcerpt)
        : buildImplementVars(
            repoRoot,
            slug,
            flags.diffBase,
            phaseUnit !== undefined ? phaseUnit.auditLogSection : flags.checkpoint,
            payloadPathScope,
            featureRoot,
            excludeRoots,
            excludePaths,
          );

    // US7 (FR-032): implement-mode governance runs the per-codebase clone step,
    // surfacing NEW intra-codebase duplication alongside the gate verdict
    // (advisory — does not override the convergence gate, #432).
    if (flags.mode === 'implement') {
      await runCloneDetectionStep({ repoRoot, write: (s) => process.stderr.write(s) });
    }

    // claude-20260612-03: surface the audit-unit's path-scope exclusions as ONE
    // consolidated, greppable summary at the verdict surface — not only as the
    // interleaved per-file warns. A `--phase` run that silently dropped an untracked
    // sibling (the intentional per-phase contract) is now auditable in a single line
    // instead of buried mid-stream. (claude-20260612-r3-01: the line is built by the
    // pure `formatScopeExclusionSummary` so it is unit-tested without the protocol.)
    const exclusionSummary = formatScopeExclusionSummary(built.skippedOutOfScope);
    if (exclusionSummary !== undefined) {
      process.stderr.write(`${exclusionSummary}\n`);
    }

    const noSlush = flags.noSlush || process.env.GOVERN_NO_SLUSH === '1';
    const protocolArgs = {
      stackctl,
      barrageBin,
      installationRoot: repoRoot,
      slug,
      checkpoint: built.checkpoint,
      vars: built.vars,
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

    // specs/015 US2 (FR-004/005 / D4): delegate the convergence loop to the code
    // driver. govern builds the three behavioral inputs — runPass (the existing
    // protocol pass, unchanged), dispatchFix (surface the BLOCKED findings; the
    // agent's only in-loop action — never an auto-edit), and the ceiling — then
    // the driver owns the iterate/stop decision and the bound. A runProtocol
    // rejection (e.g. barrage OUTAGE) propagates loud through the driver to the
    // catch below (no silent stop). specs/029 US4 (FR-017): the `--override` path
    // NO LONGER reaches the driver — it short-circuits the whole pass above
    // (recordOverrideGraduation), so a driver run here is always a real,
    // unoverridden convergence attempt.
    const ceiling = resolveCeiling(pick(flags.ceiling, process.env.GOVERN_CEILING));
    const outcome: ConvergenceOutcome = await runConvergenceLoop({
      ceiling,
      runPass: async () => ({ gateOpen: (await runProtocol(protocolArgs)).gateOpen }),
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
    // AUDIT-BARRAGE codex-02 (HIGH): record-FIRST ordering — the convergence record is
    // written BEFORE the per-phase checkpoint (the override path does the same), so a
    // record-write failure FATALs before any checkpoint is touched (no orphan checkpoint
    // that would let a later phase advance without the feature-level record).
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
    // Phase checkpoint AFTER the record (record-first — codex-02), via the shared helper
    // so a checkpoint-write failure carries the accurate "the record IS written" message
    // and never wrongly advances the lifecycle. claude-03: a resolved phase with no
    // status fails loud (contract violation). claude-04: the invariant assert guards a
    // future buildImplementVars change that would break checkpoint === auditLogSection.
    if (
      phaseUnit?.granularity === 'phase' &&
      phaseUnit.phaseId !== undefined &&
      phaseCheckpointStatuses !== undefined
    ) {
      const phaseId = phaseUnit.phaseId;
      const phaseStatus = phaseCheckpointStatuses.find((status) => status.phaseId === phaseId);
      if (phaseStatus === undefined) {
        throw new GovernProtocolError(
          `govern: FATAL — phase '${phaseId}' resolved for graduation but has no ` +
            `checkpoint status; cannot record the per-phase checkpoint.`,
        );
      }
      if (built.checkpoint !== phaseUnit.auditLogSection) {
        throw new GovernProtocolError(
          `govern: FATAL — phase-checkpoint invariant broken: built.checkpoint ` +
            `'${built.checkpoint}' != phaseUnit.auditLogSection '${phaseUnit.auditLogSection}' ` +
            `(buildImplementVars must thread the audit-log section as the checkpoint flag).`,
        );
      }
      writePhaseCheckpointAfterRecordOrFatal({
        repoRoot,
        phaseUnit: { ...phaseUnit, phaseId },
        phaseStatus,
        phaseCheckpointKey,
        slug,
      });
    }
    // AUDIT-BARRAGE claude-04: the override path short-circuits earlier (FR-017), so an
    // override never reaches here — the success message names only convergence.
    process.stderr.write(
      flags.mode === 'spec'
        ? 'govern: spec may graduate (convergence gate satisfied).\n'
        : 'govern: implementation governed (convergence gate satisfied).\n',
    );
    emitTerminalOutcome('graduated');
    process.exit(0);
  } catch (err) {
    if (err instanceof GovernProtocolError || err instanceof GovernPayloadError) {
      process.stderr.write(`${err.message}\n`);
      // T028 (US5): one machine-readable terminal tag per exit. A payload-spec
      // failure is its own kind; a protocol error carries the specific kind it
      // was thrown with (negotiation-failed / boundary-too-large / etc.).
      const kind = err instanceof GovernProtocolError ? err.terminalKind : 'payload-error';
      emitTerminalOutcome(kind);
      const code = err instanceof GovernProtocolError ? err.exitCode : 2;
      process.exit(code);
    }
    // AUDIT-BARRAGE-codex-01 (021 phase-2 HIGH): an UNEXPECTED exception (fs
    // failure, checkpoint-write failure, uncaught child error) is a govern FATAL.
    // Emit the `fatal` terminal AND exit 2 — rethrowing let the generic CLI
    // wrapper exit 1, contradicting the tag (machine-readable `fatal` vs a
    // non-fatal exit code). Print the message so the failure is still diagnosable.
    process.stderr.write(`govern: FATAL — ${errorMessage(err)}\n`);
    emitTerminalOutcome('fatal');
    process.exit(2);
  }
}
