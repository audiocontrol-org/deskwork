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
 *   GOVERN_REPO_ROOT, GOVERN_BARRAGE_BIN (test stub), GOVERN_NO_SLUSH,
 *   GOVERN_PAYLOAD_BUDGET.
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
import { readFileSync } from 'node:fs';
import {
  discoverFeatureRoots,
  resolveFeatureRoot,
} from '../scope-discovery/util/feature-root.js';
import { backlogRoot } from '../backlog/root.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// src/subcommands → src → plugin root → bin/stackctl
const PLUGIN_ROOT = resolve(HERE, '..', '..');

const USAGE = [
  'Usage: stackctl govern --mode <implement|spec> [flags]',
  '',
  '  --mode <implement|spec>   Required.',
  '  --feature <slug>          Feature slug (else derived from feature/<slug>).',
  '  --repo-root <path>        Project root (else git toplevel / cwd).',
  '  --ceiling <N>             Convergence iteration ceiling.',
  '  --override "<reason>"      Record an explicit override.',
  '  --require-models <n>      Minimum emitting models for the barrage fleet',
  '                            (default 2 — the cross-model agreement signal',
  '                            is what protocol runs exist for; specs/014 US1).',
  '  --no-slush                Disable the slush step (address every finding).',
  '  --json                    Emit the gate verdict JSON only.',
  '  implement: --diff-base <ref>   Diff base (default HEAD~1).',
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
  repoRoot?: string;
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
}

const VALUED = new Set([
  '--mode',
  '--feature',
  '--repo-root',
  '--ceiling',
  '--override',
  '--require-models',
  '--diff-base',
  '--spec-path',
  '--plan-path',
  '--checkpoint',
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
      else if (tok === '--repo-root') flags.repoRoot = value;
      else if (tok === '--ceiling') flags.ceiling = value;
      else if (tok === '--override') flags.override = value;
      else if (tok === '--require-models') flags.requireModels = value;
      else if (tok === '--diff-base') flags.diffBase = value;
      else if (tok === '--spec-path') flags.specPath = value;
      else if (tok === '--plan-path') flags.planPath = value;
      else if (tok === '--checkpoint') flags.checkpoint = value;
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

function resolveRepoRoot(flagValue: string | undefined): string {
  const raw = pick(flagValue, process.env.GOVERN_REPO_ROOT);
  if (raw !== undefined) {
    return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  }
  return process.cwd();
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

/** Resolve the spec path from --spec-path/env, else the CLAUDE.md SPECKIT marker. */
function resolveSpecPath(repoRoot: string, flagValue: string | undefined): string {
  const explicit = pick(flagValue, process.env.GOVERN_SPEC_PATH);
  if (explicit !== undefined) return isAbsolute(explicit) ? explicit : join(repoRoot, explicit);
  // Derive from the CLAUDE.md SPECKIT marker (the active plan path); the spec is
  // its sibling spec.md.
  const claudeMd = join(repoRoot, 'CLAUDE.md');
  let markerPath: string | undefined;
  if (existsSync(claudeMd)) {
    const text = readFileSync(claudeMd, 'utf8');
    const m = /specs\/[^\s]+\.md/.exec(text);
    if (m !== null) markerPath = m[0];
  }
  if (markerPath === undefined) {
    throw new GovernProtocolError(
      'govern: FATAL — no spec path in --spec-path/GOVERN_SPEC_PATH and no specs/<dir>/*.md in the CLAUDE.md SPECKIT marker.',
    );
  }
  return join(repoRoot, dirname(markerPath), 'spec.md');
}

export function buildImplementVars(
  repoRoot: string,
  slug: string,
  diffBaseFlag: string | undefined,
  checkpointFlag: string | undefined,
  auditLogExcerpt: string,
  featureRoot?: string,
  excludeRoots?: readonly string[],
  excludePaths?: readonly string[],
): { vars: BarrageVars; checkpoint: string } {
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
    repoRoot,
    base,
    ...(featureRoot !== undefined ? { featureRoot } : {}),
    ...(excludeRoots !== undefined ? { excludeRoots } : {}),
    ...(excludePaths !== undefined ? { excludePaths } : {}),
    ...(budgetEnv !== undefined && budgetEnv.length > 0
      ? { budgetBytes: Number.parseInt(budgetEnv, 10) }
      : {}),
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
    audit_log_excerpt: auditLogExcerpt,
    commit_subjects: payload.commitSubjects,
    audit_lens: CODE_AUDIT_LENS,
    artifact_framing: CODE_ARTIFACT_FRAMING,
  };
  const checkpoint =
    checkpointFlag ?? pick(undefined, process.env.GOVERN_CHECKPOINT) ?? 'after_clarify';
  return { vars, checkpoint };
}

/**
 * AUDIT-20260611-08: the governance backlog task store rides into the
 * implement payload's diff range via per-round bookkeeping commits — the
 * same lift-commit-in-range mechanism US5 closed for the audit-log, but
 * through a store that lives at the plugin root, outside the feature
 * root's pathspec. Implement mode threads the store into the assembler's
 * `excludePaths`; the path is owned HERE, not hardcoded in the assembler:
 * `backlogRoot()` (src/backlog/root.ts) respects the STACKCTL_BACKLOG_DIR
 * seam and otherwise resolves through the enclosing installation, and the
 * `backlog` binary hardcodes the `backlog/` subdir under that root.
 * Outside any installation (no seam) there IS no backlog store, so there
 * is nothing to exclude — that skip is announced on stderr, never silent.
 */
function resolveGovernExcludePaths(): readonly string[] {
  try {
    return [join(backlogRoot(), 'backlog')];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `govern: no backlog store resolved (${msg}) — backlog-store payload exclusion skipped (nothing to exclude).\n`,
    );
    return [];
  }
}

export function buildSpecVars(
  repoRoot: string,
  slug: string,
  specPathFlag: string | undefined,
  planPathFlag: string | undefined,
  checkpointFlag: string | undefined,
  auditLogExcerpt: string,
): { vars: BarrageVars; checkpoint: string } {
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
  return { vars, checkpoint: payload.checkpoint };
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

  try {
    const repoRoot = resolveRepoRoot(flags.repoRoot);
    const slug = resolveSlug({
      explicit: pick(flags.feature, process.env.GOVERN_FEATURE_SLUG),
      branch: currentBranch(repoRoot),
    });

    const barrageBin = resolveBarrageBin();
    assertBarrageBinPresent(barrageBin);
    const stackctl = join(PLUGIN_ROOT, 'bin', 'stackctl');

    // Spec 013 (TASK-25): resolve the audit-log excerpt through the
    // layout-aware helper here (async), then thread it into the pure
    // var-builders — so a specs/NNN-<slug> feature's audit-log is found
    // instead of silently empty under the old hardcoded docs/ path.
    // specs/014 US5: the implement payload also needs the resolved root
    // to exclude the audit-log from both diff arms, plus every feature
    // root in the repo so the untracked fold can drop OTHER features'
    // scaffolds without dropping the feature's own uncommitted code
    // (AUDIT-20260611-01 — exclusion-scoped, not inclusion-scoped).
    // AUDIT-20260611-12: the resolver THROWS (plain Error, fail-loud) on an
    // ambiguous Spec Kit slug (two specs/ dirs matching) — correct at the
    // resolver, but the outer catch only translates GovernProtocolError /
    // GovernPayloadError, so the throw used to escape as an uncaught exit-1
    // instead of a governance refusal. Translate resolver throws into the
    // same exit-2 operator-facing FATAL channel as the unresolvable-root
    // refusal below. The catch is deliberately narrow — only the
    // feature-root resolution cluster, not the protocol.
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
    // AUDIT-20260611-04: implement mode REFUSES to run without a resolved
    // feature root. An undefined root used to revert the assembler to the
    // pre-014 self-referential repo-wide payload (audit-log in the diff +
    // repo-wide untracked fold — the AUDIT-28/42/48 generator US5 closed),
    // silently, with the lift step doomed to fail later anyway AFTER the
    // payload had shipped off-box. Fail loud at the decision site instead,
    // mirroring the sibling verbs (slush-findings, scope-widen,
    // scope-inventory) that FATAL on the identical condition. Spec mode is
    // untouched — its payload doesn't use the feature root.
    if (flags.mode === 'implement' && featureRoot === undefined) {
      process.stderr.write(
        `govern: FATAL — feature '${slug}' not found under ${join(repoRoot, 'specs')}/<NNN>-${slug} (speckit) or ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/${slug} (legacy-docs).\n`,
      );
      process.exit(2);
    }
    // AUDIT-20260611-08: thread the governance backlog store so its
    // bookkeeping commits/files are excluded from both payload arms.
    const excludePaths =
      flags.mode === 'implement' && featureRoot !== undefined
        ? resolveGovernExcludePaths()
        : undefined;
    const built =
      flags.mode === 'spec'
        ? buildSpecVars(repoRoot, slug, flags.specPath, flags.planPath, flags.checkpoint, auditLogExcerpt)
        : buildImplementVars(repoRoot, slug, flags.diffBase, flags.checkpoint, auditLogExcerpt, featureRoot, excludeRoots, excludePaths);

    // US7 (FR-032): implement-mode governance runs the per-codebase clone step,
    // surfacing NEW intra-codebase duplication alongside the gate verdict
    // (advisory — does not override the convergence gate, #432).
    if (flags.mode === 'implement') {
      await runCloneDetectionStep({ repoRoot, write: (s) => process.stderr.write(s) });
    }

    const noSlush = flags.noSlush || process.env.GOVERN_NO_SLUSH === '1';
    const result = runProtocol({
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
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    });

    // Obey the gate's single decision (#432); never re-derive policy here.
    if (!result.gateOpen) {
      process.stderr.write(
        flags.mode === 'spec'
          ? 'govern: spec graduation REFUSED — convergence gate BLOCKED (fix findings & re-govern, or record --override).\n'
          : 'govern: implementation NOT done — convergence gate BLOCKED (fix findings & re-govern, or record --override).\n',
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
