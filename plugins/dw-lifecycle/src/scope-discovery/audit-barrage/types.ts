/**
 * plugins/dw-lifecycle/src/scope-discovery/audit-barrage/types.ts
 *
 * Type contracts for the multi-model audit-barrage surface.
 *
 * The barrage fires a uniform audit prompt against N installed CLI
 * tools in parallel, captures each one's stdout/stderr into a per-run
 * directory under `.dw-lifecycle/scope-discovery/audit-runs/`, and
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
 *   (`<repoRoot>/.dw-lifecycle/scope-discovery/audit-runs/`).
 * - `featureSlug` becomes part of the run-dir name so the operator can
 *   eyeball which feature a run targeted.
 * - `prompt` is the rendered audit prompt text; written verbatim to
 *   `PROMPT.md` and substituted into each model's argsTemplate.
 * - `models` is the parallel fan-out set.
 * - `runDirOverride` lets tests target a tmpdir instead of the
 *   canonical `.dw-lifecycle/scope-discovery/audit-runs/` parent.
 */
export interface BarrageInput {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly prompt: string;
  readonly models: ReadonlyArray<ModelConfig>;
  readonly runDirOverride?: string;
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
