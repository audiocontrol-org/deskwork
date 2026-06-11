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
 * - `installationRoot` anchors the run-dir layout
 *   (`<installation>/.stack-control/audit-runs/`). Per
 *   specs/installation-isolation R1 this is the verb-entry-resolved
 *   installation root (009 resolver) — never a free repo-root parameter
 *   (the pre-isolation `repoRoot` field created this repo's root
 *   half-installation; research row 1).
 * - `featureSlug` becomes part of the run-dir name so the operator can
 *   eyeball which feature a run targeted.
 * - `prompt` is the rendered audit prompt text; written verbatim to
 *   `PROMPT.md` and substituted into each model's argsTemplate.
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
 * LIFTABILITY predicate — "did this model produce output worth lifting?"
 *
 * Contract: a model produced liftable output iff stdoutBytes > 0 AND no
 * spawn failure. This governs ONLY what the lift step extracts; it does
 * NOT decide whether the run as a whole is governed-clean. We NEVER
 * discard liftable output — a non-zero-exit family that emitted real
 * findings is still lifted when the run has coverage.
 *
 * Per AUDIT-20260601-08 (claude-03): the liftability contract was
 * duplicated between the CLI's exit-code derivation and the inline
 * `anyModelEmitted` tip.sha gate in `orchestrateBarrage` — same logic,
 * two call sites, drift risk. Centralizing here makes the contract
 * structural. Rationale:
 *   - The audit-barrage-lift reads stdout (each model's `.md` file).
 *     Findings live there.
 *   - stderr is diagnostic / progress info, NOT findings. Not lifted.
 *   - A non-zero CLI exit with positive stdout is still triagable
 *     content — the operator may want to lift it; kept LIFTABLE.
 *   - A spawn error has zero captured content by definition; not liftable.
 *
 * Per AUDIT-20260607-42: liftability is deliberately the LOOSER of the
 * two predicates. It is split from COVERAGE (`isModelRunCovering`) so
 * that a crash-after-emitting-bytes family's findings still get lifted
 * (liftability) WITHOUT that family counting as a covering run that
 * could mask an outage as governed-clean (coverage).
 */
export function isModelRunHealthy(result: ModelRunResult): boolean {
  return result.stdoutBytes > 0 && result.spawnError === undefined;
}

/**
 * COVERAGE predicate — "did this model run to completion and count as a
 * covering family?" (AUDIT-20260607-42).
 *
 * Contract: liftability AND `exitCode === 0` (ran to completion). The
 * `exitCode === 0` clause also correctly excludes the timeout sentinel
 * (`-1`) and the spawn-failure sentinel (`-2`), closing a latent gap
 * where FR-008's prose said "no spawn/timeout error" but the code only
 * checked `spawnError`.
 *
 * Coverage — NOT liftability — governs: the FR-008 healthy-coverage
 * count, the FR-005 zero-coverage OUTAGE determination, the clean-run
 * claim, the stderr summary line, and the tip.sha gate.
 *
 * Why the split is load-bearing: for the LLM CLIs this barrage drives
 * (claude/codex/gemini headless), a non-zero exit usually means
 * something went wrong (rate-limit, auth expiry, mid-stream drop). A
 * family that prints a banner then dies `exit 1` satisfies liftability
 * (bytes>0, no spawnError) — but under the OLD single predicate it was
 * counted a HEALTHY family contributing a "clean" 0 findings. In the
 * single-family floor that was INDISTINGUISHABLE from a legitimate
 * clean run — an outage masquerading as governed-clean, defeating the
 * fail-loud guarantee (FR-005/US3/SC-003). Requiring `exitCode === 0`
 * for coverage closes that hole; the family's bytes are still lifted
 * (liftability) when the run has coverage from some other family.
 */
export function isModelRunCovering(result: ModelRunResult): boolean {
  return isModelRunHealthy(result) && result.exitCode === 0;
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
 * onto the verb's overall exit code (per AUDIT-20260607-42, gated on
 * COVERAGE — `isModelRunCovering` — not liftability):
 *
 *   - `0` — at least one COVERING family (positive-byte stdout, no
 *     spawn failure, AND exit 0). Non-zero-exit / timed-out families
 *     are still LIFTED for findings when the run has coverage, but they
 *     do not by themselves make the run governed-clean.
 *   - `1` — OUTAGE: zero covering families (every family was a spawn
 *     error, a timeout, a non-zero exit, or emitted zero bytes). The
 *     run-dir `.md` artifacts remain on disk for manual triage.
 *   - `2` — usage error (caller's flag parsing rejected, `--prompt-file`
 *     unreadable, malformed config). The shim guards on these before
 *     invoking the orchestrator.
 */
export interface BarrageResult {
  readonly run: BarrageRun;
  readonly exitCode: 0 | 1 | 2;
}
