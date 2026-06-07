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
 * Three principles encoded here:
 *
 *   1. **Per-model configuration is data, not code.** A `ModelConfig`
 *      names a binary, the args template (with a `{{prompt}}` token),
 *      and a timeout. New CLIs are added by appending an entry, not by
 *      editing the spawn helper.
 *
 *   2. **Per-model results are independent.** A `ModelRunResult`
 *      records spawn outcome, timing, byte counts, and the on-disk
 *      paths of the captured streams. A failed model does NOT taint
 *      its siblings.
 *
 *   3. **The run itself is a durable artifact.** A `BarrageRun`
 *      points at the run directory and its INDEX/PROMPT manifests so
 *      the operator's triage walk has a stable place to start.
 */

/**
 * Configuration for a single CLI model.
 *
 * - `name` identifies the model in the run dir (used as the per-model
 *   filename stem after `safeModelName`).
 * - `binary` is the path or PATH-resolvable name of the CLI tool.
 * - `argsTemplate` is a whitespace-delimited string with a `{{prompt}}`
 *   placeholder; the orchestrator splits the template before
 *   substitution so the prompt itself can contain whitespace.
 * - `timeoutSeconds` is the wall-clock budget; on expiry the
 *   subprocess is sent SIGTERM, then SIGKILL after a 5s grace.
 */
export interface ModelConfig {
  readonly name: string;
  readonly binary: string;
  readonly argsTemplate: string;
  readonly timeoutSeconds: number;
}

/**
 * Input to `orchestrateBarrage`.
 *
 * - `repoRoot` anchors the run-dir layout
 *   (`<repoRoot>/.stack-control/audit-runs/`).
 * - `featureSlug` becomes part of the run-dir name so the operator can
 *   eyeball which feature a run targeted.
 * - `prompt` is the rendered audit prompt text; written verbatim to
 *   `PROMPT.md` and substituted into each model's argsTemplate.
 * - `models` is the parallel fan-out set.
 * - `runDirOverride` lets tests target a tmpdir instead of the
 *   canonical `.stack-control/audit-runs/` parent.
 */
export interface BarrageInput {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly prompt: string;
  readonly models: ReadonlyArray<ModelConfig>;
  readonly runDirOverride?: string;
  /**
   * Per Phase 16 Task 2 (#383): the audit-barrage records HEAD at
   * fire-time so the new-diff guard (`check-barrage-tip`) can decide
   * on the next iteration whether new commits have accumulated since
   * this run. Defaults to `git rev-parse HEAD` against `repoRoot`;
   * tests override. Returning `null` (resolver failed) skips the
   * `tip.sha` write — the next-iteration guard then fail-safes to
   * fire (NEVER skip on missing tip; that would re-create #383).
   */
  readonly tipShaResolver?: (repoRoot: string) => Promise<string | null>;
}

/**
 * Per AUDIT-20260601-08 (claude-03): the "model produced liftable
 * output" contract was duplicated between `isHealthyModelRun`
 * (audit-barrage.ts CLI exit-code derivation) and the inline
 * `anyModelEmitted` check in `orchestrateBarrage` (tip.sha gate).
 * Same logic, two call sites — drift risk. Centralizing here makes
 * the contract structural rather than accidental: both the CLI's
 * exit-code derivation AND the orchestrator's tip.sha gate use this
 * single predicate.
 *
 * Contract: a model produced liftable output iff stdoutBytes > 0
 * AND no spawn failure. Rationale:
 *   - The audit-barrage-lift reads stdout (each model's `.md` file).
 *     Findings live there.
 *   - stderr is diagnostic / progress info, NOT findings. Not lifted.
 *   - A non-zero CLI exit with positive stdout is still triagable
 *     content (operator may want to lift); kept healthy.
 *   - A spawn error has zero captured content by definition; unhealthy.
 */
export function isModelRunHealthy(result: ModelRunResult): boolean {
  return result.stdoutBytes > 0 && result.spawnError === undefined;
}

/**
 * Outcome of one model's CLI invocation.
 *
 * Exit-code sentinels:
 *   - Non-negative integers — the CLI's own exit code.
 *   - `-1` — the process was terminated by a signal (timeout kill
 *     path, or external kill); `timedOut` distinguishes the two.
 *   - `-2` — the spawn itself failed (binary not found, ENOENT, etc.).
 *     `spawnError` carries the human-readable cause.
 */
export interface ModelRunResult {
  readonly name: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly timedOut: boolean;
  readonly spawnError?: string;
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
 * onto the verb's overall exit code:
 *
 *   - `0` — at least one model produced positive-byte stdout AND was
 *     not a spawn failure. Non-zero CLI exit codes and timeouts fall
 *     on this side of the boundary because the captured stdout is
 *     still triagable content; the operator sees the metadata in
 *     INDEX.md and walks the per-model `.md` files either way.
 *   - `1` — every model failed (spawn error OR zero stdout bytes).
 *   - `2` — usage error (caller's flag parsing rejected, `--prompt-file`
 *     unreadable, malformed config). The shim guards on these before
 *     invoking the orchestrator.
 */
export interface BarrageResult {
  readonly run: BarrageRun;
  readonly exitCode: 0 | 1 | 2;
}
