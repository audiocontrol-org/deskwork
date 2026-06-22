// 030 US9 (T084, FR-024/026/027) — the CLI-side runtime that binds the
// vendor-neutral end-govern pipeline (end-govern-pipeline.ts) to the real
// barrage machinery.
//
// `auditChunk` renders the chunk's FR-027-sized payload as the barrage
// `{{diff}}` var — so the audited bytes ARE the partition-sized bytes (the
// dogfood's headline defect was a raw-byte measure that let an over-envelope
// single barrage through) — fires the cross-model `audit-barrage`, and EXTRACTS
// findings from the run-dir WITHOUT lifting. The per-chunk lift is exactly the
// balloon FR-026 forbids (one audit-log section + one dampener "run" per chunk);
// lift happens ONCE, from `liftedRich`, after the pipeline reconciles.
//
// `applyFixes` is intentionally absent: FR-009's autonomous worktree fix-fanout
// is deferred (TASK-424), so the pipeline surfaces `override-eligible` and the
// agent-in-the-loop fixes + re-governs (the audit system works without the
// autonomous fix backend — operator decision 2026-06-22).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChunkAuditResult, EndGovernDeps } from './end-govern-pipeline.js';
import type { Finding } from './chunk-artifacts.js';
import {
  GovernProtocolError,
  loadLaneCapabilitiesGoverned,
  reportFleetStatus,
  selectRequestedLaneCapabilities,
  type BarrageVars,
} from './protocol.js';
import type { LaneCapabilityProfile } from './lane-capabilities.js';
import { negotiateFleet } from './fleet-negotiation.js';
import {
  computeFleetReportFromParsedLanes,
  parseIndexLaneStates,
} from '../scope-discovery/audit-barrage/run-artifacts.js';
import {
  extractBarrageFindings,
  type ExtractedFinding,
} from '../scope-discovery/promote-findings/extract-barrage-findings.js';
import { SEVERITY_RANK } from '../scope-discovery/promote-findings/cluster-severity.js';
import { scopeCommittedDiff, filterDiffScope } from './payload-diff-scope.js';

/** Configuration for one chunked end-govern run's barrage-backed runtime. */
export interface EndGovernRuntimeConfig {
  /** The barrage entrypoint (GOVERN_BARRAGE_BIN seam) — render + barrage. */
  readonly barrageBin: string;
  /** Authoritative installation anchor for this govern run. */
  readonly installationRoot: string;
  readonly slug: string;
  /** Run-dir label component, scoping the barrage per checkpoint (mirrors runProtocol). */
  readonly checkpoint: string;
  /**
   * The audit vars MINUS `diff` and `workplan_summary` — the per-chunk payload
   * (which already carries the plan/spec/contracts preamble) is injected as the
   * `{{diff}}` var, and `workplan_summary` is emptied so the preamble is not
   * rendered twice. Lens / framing / commit-subjects / audit-log-excerpt are the
   * fixed audit instructions wrapped around each chunk.
   */
  readonly varsBase: Omit<BarrageVars, 'diff' | 'workplan_summary'>;
  readonly laneCapabilities?: readonly LaneCapabilityProfile[] | undefined;
  readonly models?: string | undefined;
  readonly requireModels?: number | undefined;
  /** The active fleet envelope (min lane maxPromptBytes) — the partition currency. */
  readonly envelope: number;
  /** The plan/spec/contracts context block shared across chunks (FR-005). */
  readonly planContext: string;
  /**
   * Installation-relative paths excluded from the audited committed diff —
   * the feature's own audit-log, other features' audit-logs, and the governance
   * bookkeeping store (resolveImplementExclusion().excludeDiffRels). Applied to
   * the pipeline's `scopeDiff` so the barrage audits the SAME surface
   * `buildImplementVars` would, never the spec/contract/audit-log prose the old
   * path silently folded in (AUDIT-20260622-02).
   */
  readonly excludeDiffPaths: readonly string[];
  readonly base: string;
  readonly head: string;
  readonly stderr: (s: string) => void;
}

/** The barrage-backed runtime: the pipeline deps + the lift-once source. */
export interface EndGovernRuntime {
  readonly deps: EndGovernDeps;
  /**
   * The rich ExtractedFindings for the finding-ids the pipeline LIFTED — the
   * source for the single post-reconcile lift section (FR-026: one section, one
   * dampener run). Ids absent from this run's audit (closed-in-loop) drop out.
   */
  liftedRich(liftedIds: Iterable<string>): readonly ExtractedFinding[];
}

function spawnText(
  bin: string,
  args: readonly string[],
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  return {
    status: r.status ?? 1,
    stdout: typeof r.stdout === 'string' ? r.stdout : '',
    stderr: typeof r.stderr === 'string' ? r.stderr : '',
  };
}

/** Read the run's INDEX (if present) and report whether the fleet was degraded. */
function chunkFleetDegraded(runDir: string): boolean {
  const indexPath = join(runDir, 'INDEX.md');
  if (!existsSync(indexPath)) return false;
  const lanes = parseIndexLaneStates(readFileSync(indexPath, 'utf8'));
  if (lanes === null) return false;
  const fleet = computeFleetReportFromParsedLanes(lanes);
  return fleet.produced < fleet.configured;
}

/**
 * A stable finding id keyed by chunk + the model finding signature, so the
 * pipeline's by-id reconcile and `liftedRich` agree. The per-model source ids
 * (`claude-02`, …) are the most stable handle; fall back to the heading.
 */
function findingKey(chunkId: string, f: ExtractedFinding): string {
  const sig = f.sourceFindingIds.length > 0 ? f.sourceFindingIds.join('+') : f.heading;
  return `${chunkId}::${sig}`;
}

/** Build the barrage-backed pipeline runtime for one chunked end-govern run. */
export function makeEndGovernRuntime(cfg: EndGovernRuntimeConfig): EndGovernRuntime {
  const richByFindingId = new Map<string, ExtractedFinding>();

  const auditChunk = async (payload: string, chunkId: string): Promise<ChunkAuditResult> => {
    const work = mkdtempSync(join(tmpdir(), 'govern-chunk.'));
    try {
      // FR-027: the audited prompt body IS the partition-sized chunk payload.
      const vars: BarrageVars = { ...cfg.varsBase, workplan_summary: '', diff: payload };
      const varsPath = join(work, 'vars.json');
      const promptPath = join(work, 'prompt.md');
      writeFileSync(varsPath, JSON.stringify(vars), 'utf8');

      const render = spawnText(cfg.barrageBin, [
        'audit-barrage-render',
        '--feature',
        cfg.slug,
        '--vars-file',
        varsPath,
        '--output',
        promptPath,
        '--repo-root',
        cfg.installationRoot,
      ]);
      if (render.status !== 0) {
        throw new GovernProtocolError(
          `govern: FATAL — audit-barrage-render failed for chunk ${chunkId} (exit ${render.status}): ${render.stderr.trim()}`,
        );
      }

      const lanes = selectRequestedLaneCapabilities(
        cfg.laneCapabilities ?? (await loadLaneCapabilitiesGoverned(cfg.installationRoot)),
        cfg.models,
      );
      const negotiated = negotiateFleet(lanes, cfg.requireModels ?? 1);
      if (negotiated.disposition !== 'accepted') {
        throw new GovernProtocolError(
          `govern: FATAL — fleet negotiation failed for chunk ${chunkId}: ` +
            `accepted ${negotiated.acceptedFleet.length}/${cfg.requireModels ?? 1} viable lane(s) ` +
            `(availability / read-only enforcement / liveness). ` +
            `Rejected lanes: ${negotiated.rejectedLanes.join(', ') || 'none'}.`,
          2,
          'negotiation-failed',
        );
      }

      const barrageArgs: string[] = [
        'audit-barrage',
        '--feature',
        `${cfg.slug}-${cfg.checkpoint}`,
        '--prompt-file',
        promptPath,
        '--at',
        cfg.installationRoot,
        '--output-run-dir',
        '--models',
        negotiated.acceptedFleet.join(','),
      ];
      if (cfg.requireModels !== undefined) {
        barrageArgs.push('--require-models', String(cfg.requireModels));
      }
      const barrage = spawnText(cfg.barrageBin, barrageArgs);
      if (barrage.status !== 0) {
        const note = barrage.stderr.trim();
        const isFloorShortfall = /^audit-barrage: FLOOR SHORTFALL\b/m.test(note);
        throw new GovernProtocolError(
          `govern: FATAL — ${isFloorShortfall ? 'fleet-floor shortfall' : 'audit-barrage OUTAGE'} ` +
            `on chunk ${chunkId} (exit ${barrage.status}). The work is NOT recorded as governed (FR-005). ` +
            'Check that the configured model-family CLIs are installed and reachable.' +
            (note.length > 0 ? `\n${note}` : ''),
          2,
          isFloorShortfall ? 'fleet-floor-shortfall' : 'barrage-outage',
        );
      }

      const runDir = barrage.stdout.trim();
      // AUDIT-20260622-01: a zero-exit barrage MUST print its run-dir. An empty
      // stdout (version mismatch making `--output-run-dir` a no-op, a stdout
      // redirect, a truncated pipe) would otherwise resolve `join('', 'INDEX.md')`
      // to the CWD and silently report "no findings, fleet healthy" — a run that
      // never audited anything counted as clean. Fail loud instead.
      if (runDir.length === 0) {
        throw new GovernProtocolError(
          `govern: FATAL — audit-barrage exited 0 for chunk ${chunkId} but printed no run-dir ` +
            `(expected the path from --output-run-dir on stdout). The work is NOT recorded as ` +
            `governed (FR-005). Check the barrage binary version supports --output-run-dir.`,
          2,
          'barrage-outage',
        );
      }
      cfg.stderr(`govern: chunk ${chunkId} barrage run-dir = ${runDir}\n`);
      reportFleetStatus(runDir, cfg.stderr);
      const degraded = chunkFleetDegraded(runDir);

      // EXTRACT (no lift): the rich findings stay in memory for the single
      // post-reconcile lift; nothing is written to the audit-log here.
      const rich = await extractBarrageFindings({
        runDir,
        warn: (m) => cfg.stderr(`${m}\n`),
      });
      // 030 (spec data-model § convergence: `converged` requires a clean/DAMPENED
      // touched set): the convergence gate counts only HIGH+ (high|blocking)
      // findings — LOW/MEDIUM are dampened, mirroring the retired gate's slush
      // behavior — so a low-severity nit never blocks graduation. Only the
      // gate-blocking findings flow to the pipeline (and to the post-reconcile
      // lift via `liftedRich`); non-blocking findings remain in the run-dir for
      // the operator (a LOW/MED slush completeness pass is a follow-on).
      const blocking = rich.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high);
      const findings: Finding[] = blocking.map((f) => {
        const id = findingKey(chunkId, f);
        richByFindingId.set(id, f);
        return { id, title: f.heading, severity: f.severity };
      });
      return { findings, degraded };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };

  const deps: EndGovernDeps = {
    scopeDiff: (installationRoot, base, head) =>
      filterDiffScope(scopeCommittedDiff(installationRoot, base, head), cfg.excludeDiffPaths),
    resolveEnvelope: () => cfg.envelope,
    auditChunk,
    planContext: () => cfg.planContext,
    // applyFixes intentionally omitted — FR-009 autonomous fix deferred (TASK-424).
  };

  return {
    deps,
    liftedRich: (ids) =>
      [...ids]
        .map((id) => richByFindingId.get(id))
        .filter((f): f is ExtractedFinding => f !== undefined),
  };
}
