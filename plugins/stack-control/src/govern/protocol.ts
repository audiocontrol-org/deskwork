/**
 * plugins/stack-control/src/govern/protocol.ts
 *
 * The single-sourced audit-protocol orchestration shared by both govern modes.
 * Ported from the COMMON half of govern.sh + govern-spec.sh (the per-stage
 * difference is ONLY the payload — see payload-implement.ts / payload-spec.ts).
 *
 * The protocol composes the EXISTING bundled stackctl primitives by shelling
 * out exactly as the bash did (render → barrage → lift → slush → gate) — it does
 * NOT reimplement them. render/barrage/lift dispatch through the barrage bin
 * (GOVERN_BARRAGE_BIN test seam); slush/gate dispatch through the real bundled
 * stackctl (mirrors govern-spec.sh, where BARRAGE_BIN and STACKCTL are distinct).
 *
 * Ported edge-case fixes (keep the AUDIT-ids):
 *   - AUDIT-20260604-24: derive the feature slug generically from the
 *     `feature/<slug>` branch; never hardcode a project default. Explicit
 *     override wins; if neither resolves, fail loud (no silent wrong-target).
 *   - AUDIT-20260604-30: an empty derived slug (`feature/` strips to "") must
 *     fail loud — the exact silent-wrong-target failure the FATAL branch exists
 *     to prevent.
 *   - FR-005 / Principle V: the barrage bin absent is FATAL (no silent skip).
 *   - AUDIT-20260607-07: a non-zero barrage exit is an OUTAGE (zero healthy
 *     model families) → fail loud and do NOT lift; an empty run must never be
 *     scored as a clean/converged result.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeFleetReportFromParsedLanes,
  IndexLaneParseError,
  parseIndexLaneStates,
} from '../scope-discovery/audit-barrage/run-artifacts.js';
import { completedNonConvergedAnnotation } from '../scope-discovery/audit-barrage/types.js';

/** Thrown for any fail-loud protocol condition; carries a process exit code. */
export class GovernProtocolError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 2) {
    super(message);
    this.name = 'GovernProtocolError';
    this.exitCode = exitCode;
  }
}

export interface ResolveSlugArgs {
  readonly explicit?: string | undefined;
  readonly branch?: string | undefined;
}

/**
 * Derive the feature slug. AUDIT-20260604-24: explicit override wins; otherwise
 * derive from a `feature/<slug>` branch. AUDIT-20260604-30: an empty derived
 * slug is fatal.
 */
export function resolveSlug(args: ResolveSlugArgs): string {
  if (args.explicit !== undefined && args.explicit.length > 0) {
    return args.explicit;
  }
  // An explicitly-supplied EMPTY override is a fail-loud condition too — the
  // operator asked for the empty-slug target the FATAL branch forbids.
  if (args.explicit !== undefined && args.explicit.length === 0) {
    throw new GovernProtocolError(
      'govern: FATAL — feature slug resolved to empty; set --feature/GOVERN_FEATURE_SLUG explicitly (AUDIT-20260604-30).',
    );
  }
  const branch = args.branch ?? '';
  if (branch.startsWith('feature/')) {
    const slug = branch.slice('feature/'.length);
    if (slug.length === 0) {
      throw new GovernProtocolError(
        `govern: FATAL — derived an empty feature slug (branch '${branch}'); set --feature explicitly (AUDIT-20260604-30).`,
      );
    }
    return slug;
  }
  throw new GovernProtocolError(
    `govern: FATAL — cannot derive feature slug from branch '${branch}' (expected 'feature/<slug>'). Set --feature/GOVERN_FEATURE_SLUG (AUDIT-20260604-24).`,
  );
}

/**
 * FR-005 / Principle V: the barrage entrypoint must be present. A missing
 * capability NEVER silently skips the governance pass.
 */
export function assertBarrageBinPresent(barrageBin: string): void {
  if (!existsSync(barrageBin)) {
    throw new GovernProtocolError(
      `govern: FATAL — barrage entrypoint '${barrageBin}' not found; cannot govern (no silent skip; FR-005).`,
    );
  }
}

export interface BarrageVars {
  readonly feature_slug: string;
  readonly workplan_summary: string;
  readonly diff: string;
  readonly audit_log_excerpt: string;
  readonly commit_subjects: string;
  /**
   * Mode-aware lens for the prompt's "What to look for" section. Implement mode
   * supplies CODE_AUDIT_LENS (code-quality / edge-case checklist); spec mode
   * supplies SPEC_AUDIT_LENS (promise / decision / contradiction / ambiguity
   * altitude). Keeping the lens as data keeps the render mode-agnostic.
   */
  readonly audit_lens: string;
  /**
   * Mode-aware framing for the prompt's "Under audit" section — how to read the
   * folded artifact (code-with-line-anchors vs. spec-as-promises). CODE_* for
   * implement, SPEC_* for spec.
   */
  readonly artifact_framing: string;
}

/**
 * Resolve the current git branch (used to derive the slug). Returns '' when not
 * in a git tree — the caller turns that into the fail-loud slug error.
 */
export function currentBranch(repoRoot: string): string {
  const r = spawnSync('git', ['-C', repoRoot, 'branch', '--show-current'], {
    encoding: 'utf8',
  });
  return r.status === 0 && typeof r.stdout === 'string' ? r.stdout.trim() : '';
}

/**
 * specs/014 FR-007 / US3 scenario 3: surface the round's fleet state in the
 * LOOP's own status lines, read from the run-dir INDEX the barrage just
 * wrote. Repeated same-lane kills across rounds become visible in govern
 * output without opening per-run artifact files; a round whose verdict
 * could be "0 HIGH" over a degraded fleet is annotated as degraded. A
 * missing or pre-014 INDEX (stub barrage bins, legacy runs) emits nothing —
 * readers require the new fields only for v2-writer runs. A MIXED INDEX
 * (some lane has v2 rows, some lane fails to parse completely) throws
 * GovernProtocolError — the round's INDEX is corrupt and the fleet count
 * would otherwise silently shrink (AUDIT-20260611-07).
 */
export function reportFleetStatus(runDir: string, stderr: (s: string) => void): void {
  const indexPath = join(runDir, 'INDEX.md');
  if (!existsSync(indexPath)) return;
  let lanes;
  try {
    lanes = parseIndexLaneStates(readFileSync(indexPath, 'utf8'));
  } catch (err) {
    if (err instanceof IndexLaneParseError) {
      throw new GovernProtocolError(
        `govern: FATAL — corrupt barrage INDEX at ${indexPath}: ${err.message}`,
      );
    }
    throw err;
  }
  if (lanes === null) return;
  const fleet = computeFleetReportFromParsedLanes(lanes);
  const degraded = fleet.produced < fleet.configured;
  stderr(
    `govern: fleet — configured ${fleet.configured}, produced ${fleet.produced}${degraded ? '  ⚠ DEGRADED' : ''}\n`,
  );
  for (const lane of fleet.perLane) {
    // AUDIT-20260611-11: a lane that settled `completed` but is NOT
    // converged-eligible (nonzero exit / empty report) carries the same
    // annotation the lift prints (AUDIT-20260611-09) — the govern loop is
    // the FR-007 / US3-scenario-3 surface where a bare "completed" beside
    // "⚠ DEGRADED" would be most misleading.
    stderr(
      `govern:   ${lane.name}: ${lane.terminalState} [${lane.enforcement}, ${lane.liveness}]${completedNonConvergedAnnotation(lane)}\n`,
    );
  }
  // AUDIT-20260611-15: the quorum line fires whenever quorumCollapsed holds,
  // independent of degradation — a healthy single-lane round (produced ===
  // configured === 1) still cannot deliver cross-model agreement. The
  // 0-HIGH-over-DEGRADED NOTE below stays degradation-gated.
  if (fleet.quorumCollapsed) {
    stderr('govern: quorum — cross-model agreement impossible (produced ≤ 1)\n');
  }
  if (degraded) {
    stderr(
      'govern: NOTE — any 0-HIGH verdict this round is computed over a DEGRADED fleet (FR-007).\n',
    );
  }
}

export interface RunProtocolArgs {
  /** The bundled stackctl (real) — used for slush + gate. */
  readonly stackctl: string;
  /** The barrage entrypoint (GOVERN_BARRAGE_BIN seam) — render/barrage/lift. */
  readonly barrageBin: string;
  readonly repoRoot: string;
  readonly slug: string;
  readonly checkpoint: string;
  readonly vars: BarrageVars;
  readonly models?: string | undefined;
  readonly ceiling?: string | undefined;
  readonly override?: string | undefined;
  readonly noSlush: boolean;
  readonly emitJson: boolean;
  readonly stdout: (s: string) => void;
  readonly stderr: (s: string) => void;
}

export interface ProtocolResult {
  readonly runDir: string;
  /**
   * The gate's single decision, parsed from its stdout boolean (#432): true =
   * gate OPEN (may graduate), false = BLOCKED. The consumer OBEYS this; it does
   * not re-derive policy. A could-not-evaluate gate (exit 2) throws before this.
   */
  readonly gateOpen: boolean;
}

function spawnText(
  bin: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    ...(env !== undefined ? { env } : {}),
  });
  return {
    status: r.status ?? 1,
    stdout: typeof r.stdout === 'string' ? r.stdout : '',
    stderr: typeof r.stderr === 'string' ? r.stderr : '',
  };
}

/**
 * The shared render → barrage → lift → slush → gate chain. Both modes run the
 * full chain (the intended behavior change for implement mode, which previously
 * stopped after lift). The per-codebase clone-detection step (US7 / FR-032) runs
 * in implement mode from `subcommands/govern.ts` (see govern/clone-step.ts),
 * before this gate chain — it is advisory and does not affect the gate verdict.
 */
export function runProtocol(args: RunProtocolArgs): ProtocolResult {
  const work = mkdtempSync(join(tmpdir(), 'govern.'));
  try {
    const varsPath = join(work, 'vars.json');
    const promptPath = join(work, 'prompt.md');
    // Assemble vars JSON in TS via JSON.stringify (the design doc drops the jq
    // dependency); the keys match the renderer's EXPECTED_VARS contract.
    writeFileSync(varsPath, JSON.stringify(args.vars), 'utf8');

    // --- render (barrage bin) ---
    const render = spawnText(args.barrageBin, [
      'audit-barrage-render',
      '--feature',
      args.slug,
      '--vars-file',
      varsPath,
      '--output',
      promptPath,
    ]);
    if (render.status !== 0) {
      throw new GovernProtocolError(
        `govern: FATAL — audit-barrage-render failed (exit ${render.status}): ${render.stderr.trim()}`,
      );
    }

    // --- barrage (barrage bin); tag the run-dir label with the checkpoint so
    // the gate can scope per-checkpoint (AUDIT-20260607-05). The lift + slush +
    // gate keep the bare slug for audit-log resolution. ---
    const barrageArgs = [
      'audit-barrage',
      '--feature',
      `${args.slug}-${args.checkpoint}`,
      '--prompt-file',
      promptPath,
      '--repo-root',
      args.repoRoot,
      '--output-run-dir',
    ];
    if (args.models !== undefined && args.models.length > 0) {
      barrageArgs.push('--models', args.models);
    }
    const barrage = spawnText(args.barrageBin, barrageArgs);
    // AUDIT-20260607-07: a non-zero barrage exit is an OUTAGE (zero healthy
    // model families) → fail loud and do NOT lift.
    if (barrage.status !== 0) {
      throw new GovernProtocolError(
        `govern: FATAL — audit-barrage OUTAGE (exit ${barrage.status}): zero model families were healthy. ` +
          'The work is NOT recorded as governed (FR-005). Check that the configured model-family CLIs are installed and reachable.',
      );
    }
    const runDir = barrage.stdout.trim();
    args.stderr(`govern: barrage run-dir = ${runDir}\n`);
    // specs/014 FR-007: the round's fleet state belongs to the loop's own
    // status lines, not only the per-run INDEX.
    reportFleetStatus(runDir, args.stderr);

    // --- lift (barrage bin) ---
    const lift = spawnText(args.barrageBin, [
      'audit-barrage-lift',
      '--feature',
      args.slug,
      '--run-dir',
      runDir,
      '--repo-root',
      args.repoRoot,
      '--apply',
    ]);
    if (lift.status !== 0) {
      throw new GovernProtocolError(
        `govern: FATAL — audit-barrage-lift failed (exit ${lift.status}): ${lift.stderr.trim()}`,
      );
    }

    // --- slush ALL remaining MED/LOW (real stackctl), per-checkpoint
    // (AUDIT-20260607-03 scoping + AUDIT-20260607-47 all-remaining). At
    // convergence the slush must bin EVERY still-open MED/LOW across this
    // checkpoint's runs — not just the most-recent — so an EARLIER 0-HIGH run's
    // residual MEDIUM (never slushed when it fired, the dampener not yet engaged
    // then) does not linger open at graduation. `--scope all` + the
    // checkpoint-confined flip makes "no open MEDIUM at graduation" literally
    // true (SC-007 clean absolute). Slush only ever runs when the dampener is
    // engaged (it is a no-op otherwise), so slushing 'all' here is never
    // premature. HIGH/BLOCKING are NEVER slushed. ---
    if (!args.noSlush) {
      const slush = spawnText(args.stackctl, [
        'slush-findings',
        '--feature',
        args.slug,
        '--repo-root',
        args.repoRoot,
        '--checkpoint',
        args.checkpoint,
        '--scope',
        'all',
        '--apply',
      ]);
      // Mirror the bash `|| true`: slush is best-effort (no-op until the
      // dampener engages); a non-zero here must not abort the gate.
      if (slush.status !== 0) {
        args.stderr(`govern: slush-findings non-fatal exit ${slush.status}: ${slush.stderr.trim()}\n`);
      }
    }

    // --- convergence gate (real stackctl), scoped to this checkpoint ---
    // The gate owns the FR-010 policy and returns a single boolean on stdout
    // (#432). We OBEY it — never re-derive. Exit 2 = could-not-evaluate (fatal).
    const gateArgs = [
      'spec-governance-gate',
      '--feature',
      args.slug,
      '--repo-root',
      args.repoRoot,
      '--checkpoint',
      args.checkpoint,
    ];
    if (args.override !== undefined && args.override.length > 0) {
      gateArgs.push('--override', args.override);
    }
    const gate = spawnText(args.stackctl, gateArgs);
    args.stderr(gate.stderr);
    args.stderr(`govern: run-dir=${runDir}\n`);

    if (gate.status === 2) {
      throw new GovernProtocolError(
        'govern: FATAL — gate could not evaluate (capability/audit-log absent).',
      );
    }

    const gateOpen = gate.stdout.trim() === 'true';
    return { runDir, gateOpen };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
