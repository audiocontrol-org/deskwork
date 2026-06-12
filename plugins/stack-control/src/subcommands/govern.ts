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
 *   GOVERN_BARRAGE_BIN (test stub), GOVERN_NO_SLUSH, GOVERN_PAYLOAD_BUDGET.
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
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GovernProtocolError,
  assertBarrageBinPresent,
  currentBranch,
  resolveSlug,
  runProtocol,
  type BarrageVars,
} from '../govern/protocol.js';
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
import { resolvePhaseUnit } from '../govern/incremental-audit.js';
import type { AuditUnit } from '../govern/audit-unit-types.js';
import type { ConvergenceOutcome } from '../govern/convergence-types.js';
import { readFileSync } from 'node:fs';
import {
  discoverFeatureRoots,
  resolveFeatureRoot,
} from '../scope-discovery/util/feature-root.js';
import { resolveInstallation } from '../config/installation.js';
import type { Installation } from '../config/types.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import { deriveDistinctGitToplevel } from '../scope-discovery/util/git-toplevel.js';

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
    // specs/015 (FR-006/D7): bound the untracked fold to the audit unit's path
    // scope so unrelated parked-feature scaffolds are excluded. Empty/undefined
    // for a whole-feature unit (folds all untracked — pre-015 behavior).
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
  if (seam !== undefined && seam !== '') {
    return [join(seam, 'backlog')];
  }
  return [join(dirname(installation.resolved.backlog), 'backlog')];
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

export async function runGovern(args: string[]): Promise<void> {
  const parsed = parseFlags(args);
  if (parsed.ok && parsed.flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`govern: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const flags = parsed.flags;
  if (flags.mode === undefined) {
    process.stderr.write(`govern: --mode <implement|spec> is required\n${USAGE}\n`);
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
    process.exit(2);
  }

  try {
    const repoRoot = installation.root;
    const slug = resolveSlug({
      explicit: pick(flags.feature, process.env.GOVERN_FEATURE_SLUG),
      branch: currentBranch(repoRoot),
    });

    const barrageBin = resolveBarrageBin();
    assertBarrageBinPresent(barrageBin);
    const stackctl = join(PLUGIN_ROOT, 'bin', 'stackctl');

    // specs/015 US4 (FR-007 / T025): a `--phase <id>` selector audits ONE
    // tasks.md phase as a bounded unit — the SAME convergence protocol/loop, a
    // smaller payload. Resolve the phase unit from the feature's tasks.md, scope
    // the untracked fold + committed diff to the phase's files, and run the loop
    // under the per-phase checkpoint (`phase-<id>`). `--phase` is implement only.
    let phaseUnit: AuditUnit | undefined;
    if (flags.mode === 'implement' && flags.phase !== undefined) {
      const { root } = await resolveFeatureRoot({ repoRoot, slug });
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
      const diffBase =
        flags.diffBase ?? pick(undefined, process.env.GOVERN_DIFF_BASE) ?? 'HEAD~1';
      phaseUnit = resolvePhaseUnit({ tasksPath, phaseId: flags.phase, diffBase });
    }

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
      process.exit(2);
    }
    // AUDIT-20260611-04: implement mode REFUSES to run without a resolved feature
    // root (an undefined root used to revert the assembler to the pre-014
    // self-referential repo-wide payload, silently). Fail loud at the decision site.
    if (flags.mode === 'implement' && featureRoot === undefined) {
      process.stderr.write(
        `govern: FATAL — feature '${slug}' not found under ${join(repoRoot, 'specs')}/<NNN>-${slug} (speckit) or ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/${slug} (legacy-docs).\n`,
      );
      process.exit(2);
    }
    // AUDIT-20260611-08: thread the governance backlog store so its bookkeeping
    // commits/files are excluded from both payload arms.
    const excludePaths =
      flags.mode === 'implement' && featureRoot !== undefined
        ? resolveGovernExcludePaths(installation)
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
            phaseUnit?.diffScope.files,
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
      repoRoot,
      slug,
      checkpoint: built.checkpoint,
      vars: built.vars,
      models: pick(undefined, process.env.GOVERN_MODELS),
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
    // catch below (no silent stop). The `--override` path stays routed through
    // the gate (it records the override in the audit trail and returns gateOpen),
    // so an overridden run still produces a barrage record.
    const ceiling = resolveCeiling(pick(flags.ceiling, process.env.GOVERN_CEILING));
    const outcome: ConvergenceOutcome = await runConvergenceLoop({
      ceiling,
      runPass: async () => ({ gateOpen: runProtocol(protocolArgs).gateOpen }),
      dispatchFix: async () => {
        process.stderr.write(
          'govern: convergence gate BLOCKED — fix the surfaced findings; the loop ' +
            're-barrages on the next round and never auto-edits the work (FR-005).\n',
        );
      },
    });

    // Map the recorded terminal to govern's exit: `converged` may graduate
    // (exit 0) — an operator `--override` reaches here as `converged` because it
    // is routed through the gate (records the reason, returns OPEN with a barrage
    // record), not a driver terminal; `non-converged` is a bounded refusal
    // (exit 1). The agent never held the iterate/stop decision (SC-004).
    if (outcome.kind === 'non-converged') {
      process.stderr.write(
        (flags.mode === 'spec'
          ? 'govern: spec graduation REFUSED — convergence gate BLOCKED'
          : 'govern: implementation NOT done — convergence gate BLOCKED') +
          ` after ${outcome.rounds} round(s) (ceiling ${outcome.ceiling}); fix findings & re-govern, or record --override.\n`,
      );
      process.exit(1);
    }
    process.stderr.write(
      flags.mode === 'spec'
        ? 'govern: spec may graduate (convergence gate satisfied or overridden).\n'
        : 'govern: implementation governed (convergence gate satisfied or overridden).\n',
    );
    process.exit(0);
  } catch (err) {
    if (err instanceof GovernProtocolError || err instanceof GovernPayloadError) {
      process.stderr.write(`${err.message}\n`);
      const code = err instanceof GovernProtocolError ? err.exitCode : 2;
      process.exit(code);
    }
    throw err;
  }
}
