/**
 * plugins/stack-control/src/govern/govern-vars.ts
 *
 * The CLI-surface helpers and BarrageVars builders for `stackctl govern`,
 * extracted from `subcommands/govern.ts` (030 T086 / FR-022 / SC-007) so the
 * command file stays under the 500-line cap. Pure file-size decomposition — no
 * behavior change. The orchestration (`runGovern`) and the per-arm bodies live in
 * `subcommands/govern.ts` + `govern/govern-arms.ts`; this module owns the flag
 * grammar, the env/flag resolution helpers, and the payload-variable assembly.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GovernProtocolError,
  selectRequestedLaneCapabilities,
  type BarrageVars,
} from './protocol.js';
import {
  CODE_AUDIT_LENS,
  CODE_AUDIT_LENS_CODE_ONLY,
  CODE_ARTIFACT_FRAMING,
} from './audit-constants.js';
import {
  assembleSpecPayload,
  SPEC_AUDIT_LENS,
  SPEC_ARTIFACT_FRAMING,
} from './payload-spec.js';
import { implementCommitSubjects } from './payload-diff-scope.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import type { Installation } from '../config/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import { deriveDistinctGitToplevel } from '../scope-discovery/util/git-toplevel.js';
import { type LaneCapabilityProfile } from './lane-capabilities.js';
import { negotiateFleet } from './fleet-negotiation.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// src/govern → src → plugin root → bin/stackctl
export const PLUGIN_ROOT = resolve(HERE, '..', '..');

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
export function resolveCeiling(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export const USAGE = [
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
  '  --background              Detach the run into its own session and return',
  '                            immediately with a handle — decouples a 10+ min',
  '                            govern pass from the foreground Bash-tool timeout.',
  '                            The gate verdict lands in the handle; poll --status.',
  '  --status [--handle <id>]  Report a background run and relay its gate verdict',
  '                            (running: exit 75 EX_TEMPFAIL; completed: the govern',
  '                            exit code; crashed: 2). Default handle: newest run.',
  '  implement: --diff-base <ref>   Diff base for the whole committed feature diff (default: merge-base with the repo default branch; HEAD~1 if none).',
  '  spec:      --spec-path <p>      Spec under audit (else CLAUDE.md SPECKIT marker).',
  '             --plan-path <p>      Fold the plan (the after_plan checkpoint).',
  '             --checkpoint <name>  Override the checkpoint label.',
  '',
  'Exit: 0 may-graduate; 1 refused; 2 fatal (usage / capability / payload).',
].join('\n');

export type Mode = 'implement' | 'spec';

export interface GovernFlags {
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
  help: boolean;
  /**
   * impl:fix/audit-barrage-cc-timeout — detach govern into its own session and
   * return immediately with a handle (so a long govern run outlives the Claude
   * Code Bash-tool timeout that would otherwise kill a foreground invocation).
   */
  background: boolean;
  /** Report a background run's state + relay its eventual gate verdict. */
  status: boolean;
  /** Target a specific background run for `--status` (default: newest). */
  handle?: string;
  /** Internal runner role (`--__bg-run <dir>`): run the real govern, record result. */
  bgRun?: string;
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
  '--handle',
  '--__bg-run',
]);

export function parseFlags(
  argv: readonly string[],
): { ok: true; flags: GovernFlags } | { ok: false; error: string } {
  const flags: GovernFlags = {
    noSlush: false,
    json: false,
    help: false,
    background: false,
    status: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (tok === '--help' || tok === '-h') { flags.help = true; continue; }
    if (tok === '--no-slush') { flags.noSlush = true; continue; }
    if (tok === '--json') { flags.json = true; continue; }
    if (tok === '--background') { flags.background = true; continue; }
    if (tok === '--status') { flags.status = true; continue; }
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
      else if (tok === '--handle') flags.handle = value;
      else if (tok === '--__bg-run') flags.bgRun = value;
      continue;
    }
    return { ok: false, error: `unknown flag: ${tok}` };
  }
  return { ok: true, flags };
}

/** Flag wins over env; env wins over the built-in default. */
export function pick(flag: string | undefined, env: string | undefined): string | undefined {
  if (flag !== undefined) return flag;
  if (env !== undefined && env.length > 0) return env;
  return undefined;
}

export function resolveBarrageBin(): string {
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
  codeOnly: boolean,
): { vars: BarrageVars; checkpoint: string; skippedOutOfScope: readonly string[] } {
  const base = diffBaseFlag ?? pick(undefined, process.env.GOVERN_DIFF_BASE) ?? 'HEAD~1';
  // 030 (FR-024): the implement arm drives the end-govern pipeline, which re-scopes the
  // committed diff per CHUNK (scopeCommittedDiff + partitionDiff). The whole-feature `diff`
  // the old assembler produced is discarded, so this builder no longer assembles it — it
  // supplies only the audit metadata the per-chunk barrage prompt carries: the audit lens /
  // framing, the in-range commit subjects (installation-subtree-scoped), and the static
  // workplan summary. The audit-log excerpt is dropped from the implement payload entirely
  // (015 SC-005); the dampener/gate read the audit-log FILE directly.
  const vars: BarrageVars = {
    feature_slug: slug,
    workplan_summary: `Governance pass over the just-implemented work for feature '${slug}', diffed against ${base}. The differentiated back half audits a plan it did not author or execute.`,
    diff: '',
    audit_log_excerpt: '',
    commit_subjects: implementCommitSubjects(repoRoot, base),
    audit_lens: codeOnly ? CODE_AUDIT_LENS_CODE_ONLY : CODE_AUDIT_LENS,
    // 030 (FR-017): per-phase is retired — the whole-feature audit always uses the
    // generic framing. (The per-phase out-of-window note would be false here and
    // could suppress a real missing-impl HIGH.)
    artifact_framing: CODE_ARTIFACT_FRAMING,
  };
  const checkpoint = checkpointFlag ?? 'after_clarify';
  return { vars, checkpoint, skippedOutOfScope: [] };
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
export function resolveGovernExcludePaths(installation: Installation): readonly string[] {
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

export function preflightNegotiatedFleet(
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

export async function resolveGovernFeatureRoot(
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
  const checkpoint = checkpointFlag;
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
