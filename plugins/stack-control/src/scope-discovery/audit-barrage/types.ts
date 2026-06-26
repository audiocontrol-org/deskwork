/**
 * plugins/stack-control/src/scope-discovery/audit-barrage/types.ts
 *
 * Type contracts for the multi-model audit-barrage surface.
 *
 * The barrage fires a uniform audit prompt against N installed CLI
 * tools in parallel, captures each one's stdout/stderr into a per-run
 * directory under `.stack-control/audit-runs/`, and
 * emits a machine-readable run record. Operators triage the resulting
 * per-model markdown files into the canonical audit-log.
 *
 * Principles encoded here:
 *
 *   1. **Per-model configuration is data, not code.** A `ModelConfig`
 *      names a binary, the args template, an explicit model pin, the
 *      lane's read-only enforcement fragment, its output/liveness
 *      capabilities, and its timeout derivation inputs. New CLIs are
 *      added by appending an entry, not by editing the spawn helper.
 *      Capability fields — never the binary name — select behavior
 *      (Constitution Principle III).
 *
 *   2. **Per-model results are independent.** A `ModelRunResult`
 *      records spawn outcome, timing, byte counts, the on-disk paths
 *      of the captured streams, and (specs/014) the single settled
 *      `terminalState` every downstream consumer reads. A failed model
 *      does NOT taint its siblings.
 *
 *   3. **The run itself is a durable artifact.** A `BarrageRun`
 *      points at the run directory and its INDEX/PROMPT manifests so
 *      the operator's triage walk has a stable place to start.
 */

/**
 * specs/014 FR-006: the single settled outcome of one model invocation.
 * `killed-external` (AUDIT-20260611-13): the child terminated on a signal
 * the wrapper did NOT send (OOM killer, out-of-band SIGTERM/SIGKILL) —
 * neither our timeout kill, nor our watchdog kill, nor a spawn failure,
 * nor a completion. Without it such a lane settled `completed` and its
 * partial capture leaked into the lift (FR-007 violation).
 */
export type TerminalState =
  | 'completed'
  | 'timed-out'
  | 'spawn-failed'
  | 'killed-no-liveness'
  | 'killed-external';

/** specs/014 FR-004: whether the spawn ran under a mechanical read-only fragment. */
export type EnforcementState = 'enforced' | 'unenforced';

/** specs/014 FR-009: whether a liveness watchdog observed the spawn. */
export type LivenessState = 'monitored' | 'unmonitored';

/** specs/014 D1: how the lane's final report travels on the wire. */
export type OutputMode = 'text' | 'stream-json';

/** specs/014 D1: which stream carries the sign-of-life pulse. */
export type LivenessSignal = 'stdout' | 'stderr' | 'none';

/**
 * specs/014 FR-002: how a spawn's effective timeout was produced —
 * recorded on every settle so an operator can audit why a run was
 * given the budget it had. `floorSeconds`/`secsPerKb` are the
 * derivation inputs and are present only in `derived` mode.
 */
export interface TimeoutBasis {
  readonly mode: 'derived' | 'override';
  readonly payloadBytes: number;
  readonly floorSeconds?: number;
  readonly secsPerKb?: number;
  readonly effectiveTimeoutSeconds: number;
}

/**
 * Configuration for a single CLI model lane (config grammar v2 —
 * specs/014-audit-barrage-reliability/contracts/barrage-config-schema.md).
 *
 * - `name` identifies the model in the run dir (used as the per-model
 *   filename stem after `safeModelName`).
 * - `binary` is the path or PATH-resolvable name of the CLI tool.
 * - `argsTemplate` is a whitespace-delimited string carrying the
 *   `{{model}}` placeholder plus exactly one of `{{prompt}}` /
 *   `{{prompt-stdin}}`; the orchestrator splits the template before
 *   substitution so the prompt itself can contain whitespace.
 * - `model` is the explicit pin (alias or full id) — no spawn floats
 *   on the user's ambient default (FR-001).
 * - `readonlyEnforcement` is the CLI fragment injected into argv that
 *   makes the spawn mechanically read-only, or the sentinel `'none'`
 *   (the lane runs, loudly marked `unenforced`; FR-003/FR-004).
 * - `outputMode` / `livenessSignal` / `livenessWindowSeconds` select
 *   result extraction and the watchdog pulse (FR-008/FR-009).
 * - `timeoutFloorSeconds` + `timeoutSecsPerKb` are the derivation pair
 *   (D5); `timeoutSeconds` is the optional explicit operator override
 *   that displaces derivation (recorded as `override`, FR-002). The
 *   config loader guarantees at least one of the two shapes is present.
 */
export interface ModelConfig {
  readonly name: string;
  readonly binary: string;
  readonly argsTemplate: string;
  readonly model: string;
  readonly readonlyEnforcement: string;
  readonly outputMode: OutputMode;
  readonly livenessSignal: LivenessSignal;
  readonly livenessWindowSeconds?: number;
  readonly timeoutFloorSeconds?: number;
  readonly timeoutSecsPerKb?: number;
  readonly timeoutSeconds?: number;
}

/**
 * Input to `orchestrateBarrage`.
 *
 * - `installationRoot` anchors the run-dir layout
 *   (`<installation>/.stack-control/audit-runs/`). Per
 *   specs/installation-isolation R1 this is the verb-entry-resolved
 *   installation root (009 resolver) — never a free repo-root parameter
 *   (the pre-isolation `repoRoot` field created this repo's root
 *   half-installation; research row 1).
 * - `featureSlug` becomes part of the run-dir name so the operator can
 *   eyeball which feature a run targeted.
 * - `prompt` is the rendered audit prompt text; written verbatim to
 *   `PROMPT.md` and substituted into each model's argsTemplate. Its
 *   byte size is the payload input to timeout derivation (FR-002).
 * - `models` is the parallel fan-out set.
 * - `runDirOverride` lets tests target a tmpdir instead of the
 *   canonical `.stack-control/audit-runs/` parent.
 */
export interface BarrageInput {
  readonly installationRoot: string;
  readonly featureSlug: string;
  readonly prompt: string;
  readonly models: ReadonlyArray<ModelConfig>;
  readonly runDirOverride?: string;
  /**
   * Per Phase 16 Task 2 (#383): the audit-barrage records HEAD at
   * fire-time so the new-diff guard (`check-barrage-tip`) can decide
   * on the next iteration whether new commits have accumulated since
   * this run. Defaults to `git rev-parse HEAD` against the
   * installation root (git is a derived external anchor — `git -C
   * <installation>`; spec FR-004); tests override. Returning `null`
   * (resolver failed) skips the `tip.sha` write — the next-iteration
   * guard then fail-safes to fire (NEVER skip on missing tip; that
   * would re-create #383).
   */
  readonly tipShaResolver?: (installationRoot: string) => Promise<string | null>;
}

/**
 * ENFORCEMENT predicate — "is this lane mechanically read-only?"
 *
 * A lane is enforced iff its `readonlyEnforcement` fragment is not the
 * sentinel `'none'` AND carries at least one real argv token after
 * trimming. A whitespace-only fragment (constructible only outside the
 * config loader, which refuses it at load) injects NOTHING into argv,
 * so marking it `enforced` would lie on every downstream surface
 * (FR-003/FR-004).
 *
 * Per AUDIT-20260611-19: centralized here so spawn-cli's enforcement
 * derivation and the fire-time unenforced-warning loop cannot diverge
 * (one predicate, every call site) — the same structural pattern as
 * `isModelRunHealthy` below.
 */
export function isLaneEnforced(model: ModelConfig): boolean {
  return (
    model.readonlyEnforcement !== 'none' &&
    model.readonlyEnforcement.trim().length > 0
  );
}

/**
 * LIFTABILITY predicate — "did this model produce output worth lifting?"
 *
 * Contract (specs/014 FR-006/FR-007 refinement of AUDIT-20260607-42):
 * a model produced liftable output iff it SETTLED `completed` AND its
 * final report artifact has bytes AND no spawn failure. A killed lane
 * (timed-out / killed-no-liveness / killed-external / spawn-failed)
 * contributes ZERO findings — its empty-or-partial output is never
 * presented as a clean no-findings run. Liftability follows the ARTIFACT (`reportBytes`,
 * the per-model `.md` lift consumes), not raw wire traffic: a
 * stream-json lane whose NDJSON capture had bytes but whose terminal
 * `result` event never arrived has no artifact (FR-010).
 *
 * Per AUDIT-20260601-08 (claude-03): centralized here so the contract
 * is structural (one predicate, every call site).
 */
export function isModelRunHealthy(result: ModelRunResult): boolean {
  return (
    result.terminalState === 'completed' &&
    result.reportBytes > 0 &&
    result.spawnError === undefined
  );
}

/**
 * CONVERGED-ELIGIBILITY predicate — "did this model run count as a
 * producing lane?" (specs/014 data-model § FleetReport `produced`;
 * successor name for AUDIT-20260607-42's coverage predicate).
 *
 * Contract: liftability AND `exitCode === 0`. A fast non-zero exit
 * (e.g. a CLI-rejected model pin) is degradation, not production —
 * its bytes remain liftable evidence, but the lane never counts
 * toward the fleet's `produced` count, the clean-run claim, the
 * FR-008 healthy-coverage count, the stderr summary line, or the
 * tip.sha gate. Only `completed` lanes can converge (FR-006/FR-007):
 * the 17-round silent degradation this feature kills happened because
 * the synthesis layer had no terminal-state vocabulary to consume.
 */
export function isModelRunConverged(result: ModelRunResult): boolean {
  return isModelRunHealthy(result) && result.exitCode === 0;
}

/**
 * Back-compat alias for `isModelRunConverged` (the pre-014 name; kept
 * so existing call sites and the AUDIT-20260607-42 paper trail stay
 * valid). New code uses `isModelRunConverged`.
 */
export function isModelRunCovering(result: ModelRunResult): boolean {
  return isModelRunConverged(result);
}

/**
 * Outcome of one model's CLI invocation.
 *
 * Exit-code sentinels:
 *   - Non-negative integers — the CLI's own exit code.
 *   - `-1` — the process was terminated by a signal (timeout kill →
 *     `timed-out`, watchdog kill → `killed-no-liveness`, external
 *     out-of-band kill → `killed-external`); `terminalState`
 *     distinguishes them (AUDIT-20260611-13).
 *   - `-2` — the spawn itself failed (binary not found, ENOENT, etc.).
 *     `spawnError` carries the human-readable cause.
 *
 * specs/014 additions (data-model § ModelRunResult):
 *   - `terminalState` — exactly one, set at settle, the single source
 *     of downstream truth (FR-006).
 *   - `enforcement` / `liveness` — the lane's mechanical-read-only and
 *     watchdog states, surfaced on every consuming surface.
 *   - `timeoutBasis` — always recorded (FR-002).
 *   - `reportBytes` — bytes of the final per-model report artifact
 *     (`<model>.md`). Text lanes: equals `stdoutBytes`. Stream-json
 *     lanes: the extracted terminal-result text length (0 when no
 *     result event arrived — the artifact is then ABSENT, never
 *     fabricated; FR-010).
 *   - `stalenessAtKillMs` — present on a `killed-no-liveness` settle:
 *     how stale the pulse was when the watchdog fired.
 *   - `eventsPath` — stream-json lanes: the NDJSON forensic capture.
 *     Present only when a capture was actually written — the file is
 *     created lazily on the first captured line, so a spawn-failed
 *     stream lane or one that settled with zero stdout bytes records
 *     NO path for a file that does not exist (AUDIT-20260611-21).
 */
export interface ModelRunResult {
  readonly name: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly reportBytes: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly timedOut: boolean;
  readonly spawnError?: string;
  readonly terminalState: TerminalState;
  readonly enforcement: EnforcementState;
  readonly liveness: LivenessState;
  readonly livenessWindowSeconds?: number;
  readonly stalenessAtKillMs?: number;
  readonly timeoutBasis: TimeoutBasis;
  readonly eventsPath?: string;
}

/**
 * Durable record of one complete barrage.
 *
 * - `runDir` is the absolute path to the per-run directory.
 * - `timestamp` is the ISO basic-format UTC stamp embedded in the
 *   run-dir name.
 * - `promptPath` / `indexPath` are absolute paths to the PROMPT.md /
 *   INDEX.md manifests inside the run dir.
 * - `results` carries one `ModelRunResult` per configured model.
 */
export interface BarrageRun {
  readonly runDir: string;
  readonly timestamp: string;
  readonly featureSlug: string;
  readonly promptPath: string;
  readonly indexPath: string;
  readonly results: ReadonlyArray<ModelRunResult>;
}

/**
 * Result returned by the CLI shim. `exitCode` maps the run outcome
 * onto the verb's overall exit code (gated on converged-eligibility —
 * `isModelRunConverged`; AUDIT-20260607-42 + specs/014 FR-007):
 *
 *   - `0` — at least one CONVERGED lane (completed settle, report
 *     artifact present, exit 0). Non-converged lanes' liftable bytes
 *     are still extracted when the run has a converged sibling, but
 *     they do not by themselves make the run governed-clean.
 *   - `1` — OUTAGE: zero converged lanes (every lane was a spawn
 *     error, a kill, a non-zero exit, or emitted no artifact). The
 *     run-dir `.md` artifacts remain on disk for manual triage.
 *   - `2` — usage error (caller's flag parsing rejected, `--prompt-file`
 *     unreadable, malformed config). The shim guards on these before
 *     invoking the orchestrator.
 */
export interface BarrageResult {
  readonly run: BarrageRun;
  readonly exitCode: 0 | 1 | 2;
}

/** specs/014 data-model § FleetReport: one lane's status line vocabulary. */
export interface FleetLaneStatus {
  readonly name: string;
  readonly terminalState: TerminalState;
  readonly enforcement: EnforcementState;
  readonly liveness: LivenessState;
  /**
   * AUDIT-20260611-11: the converged-eligibility inputs travel WITH the
   * lane status so every consumer of `perLane` (INDEX fleet block,
   * fire-time stderr, lift output, govern loop status) can annotate a
   * completed-but-non-converged lane the same way the lift's per-lane
   * narration does (AUDIT-20260611-09) — without them, a CLI-rejected
   * pin prints a bare "completed" right next to "⚠ DEGRADED".
   */
  readonly exitCode: number;
  readonly reportBytes: number;
}

/**
 * AUDIT-20260611-09 / AUDIT-20260611-11: the ONE annotation vocabulary for
 * a lane that settled `completed` yet is NOT converged-eligible (nonzero
 * exit or empty report artifact). The fleet report excludes such a lane
 * from `produced`, so every per-lane status line must say why — a bare
 * "completed" beside "⚠ DEGRADED" leaves the operator with nothing
 * connecting the two. Returns '' for non-completed lanes (their terminal
 * state already explains the exclusion) and for converged lanes.
 */
export function completedNonConvergedAnnotation(lane: {
  readonly terminalState: TerminalState;
  readonly exitCode: number;
  readonly reportBytes: number;
}): string {
  if (lane.terminalState !== 'completed') return '';
  if (lane.exitCode === 0 && lane.reportBytes > 0) return '';
  // specs/029 US2 (FR-006): name the zero-byte degraded sub-state distinctly so
  // a `completed` lane that produced nothing is never mistaken for a healthy
  // one. zero-byte (settled completed, 0 report bytes) is in the degraded set
  // alongside timed-out / killed-* — surface it by name, not just by byte count.
  // A lane can be BOTH zero-byte AND nonzero-exit; name each sub-state present so
  // the nonzero exit is never hidden behind the zero-byte label (TASK-345).
  const subStates: string[] = [];
  if (lane.reportBytes === 0) subStates.push('zero-byte');
  if (lane.exitCode !== 0) subStates.push(`nonzero-exit (${lane.exitCode})`);
  const kind = subStates.join(', ');
  return (
    ` — completed but DEGRADED [${kind}] (exit ${lane.exitCode}, ` +
    `report bytes ${lane.reportBytes}); not counted as produced`
  );
}

/**
 * specs/014 data-model § FleetReport: the synthesis-level statement of
 * configured-vs-produced lanes that every consumer (fire-time summary,
 * INDEX.md, lift output, govern loop status, dampener accounting)
 * prints from the same vocabulary (FR-007).
 */
export interface FleetReport {
  readonly configured: number;
  readonly produced: number;
  readonly perLane: ReadonlyArray<FleetLaneStatus>;
  readonly quorumCollapsed: boolean;
}

/**
 * Compute the fleet report from a run's settle records. `produced`
 * counts converged-eligible lanes only (`isModelRunConverged`) — a
 * fast non-zero exit is degradation, not production. `quorumCollapsed`
 * (produced ≤ 1) means cross-model agreement is structurally
 * impossible and must be stated wherever agreement is reported.
 */
export function computeFleetReport(
  results: ReadonlyArray<ModelRunResult>,
): FleetReport {
  const produced = results.filter(isModelRunConverged).length;
  return {
    configured: results.length,
    produced,
    perLane: results.map((r) => ({
      name: r.name,
      terminalState: r.terminalState,
      enforcement: r.enforcement,
      liveness: r.liveness,
      exitCode: r.exitCode,
      reportBytes: r.reportBytes,
    })),
    quorumCollapsed: produced <= 1,
  };
}
