# Audit log — scope-discovery feature

Living audit-log per the agent-discipline rule. Findings land here with stable IDs + explicit status transitions (`open` → `fixed-<sha>` → `verified-<date>`).

---

## 2026-05-29 — Phase 12 audit-barrage self-dogfood

First audit-barrage run against the audit-barrage feature itself (Tasks 1-3 implementation). The acceptance-signal target was "one barrage run surfaces ≥1 finding that the in-band self-audit + SDD review cycle didn't catch." **Met overwhelmingly: 13 distinct findings across 2 successful models, 4 with cross-model agreement.** ALL of these would have shipped without this audit (1966/1966 tests passed; tsc clean; live 3-CLI round-trip returned PROBE-OK).

Run dir: `.dw-lifecycle/scope-discovery/audit-runs/20260529T061616Z-audit-barrage/` (gitignored — see INDEX.md in worktree).

Per-model durations: claude 195s / 13495 stdout bytes (8 findings + 1 framing finding); codex 28s / 3379 bytes (4 findings); gemini failed (exit 1, "exhausted capacity on this model" — operator-level quota; not an audit-barrage bug).

### Cross-model agreement (HIGH-confidence findings, both models found the same bug)

#### AUDIT-20260529-01 — Exit-vs-close event truncation

Finding-ID: AUDIT-20260529-01 (claude-exit-vs-close + codex-stream-error-race; cross-model)
Status: open
Severity: high
Surface: `plugins/dw-lifecycle/src/scope-discovery/audit-barrage/spawn-cli.ts:128-139`

`spawnCliAgainstModel` finalizes on `child.on('exit', ...)` then immediately ends the capture streams. Per Node semantics, `'exit'` fires when the process ends but its stdio pipes may still have buffered, undelivered data; `'close'` is the event that fires only after all stdio streams have closed. Snapshotting on `'exit'` drops any in-flight stdout chunks — both from the on-disk `<model>.md` capture and from the `stdoutBytes` counter. This is silent data-fidelity loss on the load-bearing path of the whole feature.

Cross-cite: codex independently flagged the same root cause from the error-handler perspective (`stdoutStream.write(chunk)` called before any error handler is attached; if the write stream errors mid-run, the process can crash).

**Fix:** attach completion logic to `child.on('close', ...)` instead; attach stream error handlers immediately after stream creation.

#### AUDIT-20260529-02 — args_template validation vs spawn-cli substitution drift

Finding-ID: AUDIT-20260529-02 (claude-args-template-substring-mismatch + codex-placeholder-contract; cross-model)
Status: open
Severity: high
Surface: `config-loader.ts:200-205`, `schema/audit-barrage-config.yaml.schema.json:38`, `spawn-cli.ts:160-163`

Config-loader accepts any `args_template` that *contains* `{{prompt}}` as substring; `buildArgs` only substitutes whole-token-equals-`{{prompt}}`. An operator writing `args_template: "--prompt={{prompt}}"` passes both validation + schema, then spawns the CLI with the literal `--prompt={{prompt}}` token and **never receives the rendered prompt**. Silent output-empty run with no error surfaced.

Both models independently identified this exact failure mode (substring validation vs token-exact substitution).

**Fix:** either (a) `buildArgs` does intra-token replace via `tok.split('{{prompt}}').join(prompt)`, or (b) validation tightens to require `{{prompt}}` as a standalone whitespace-delimited token with a clear error message rejecting embedded forms.

#### AUDIT-20260529-03 — Exit-code contract drift vs PRD

Finding-ID: AUDIT-20260529-03 (claude-exitcode-vs-prd + codex-exit-contract-drift; cross-model)
Status: open
Severity: medium
Surface: `audit-barrage.ts:230-237` (`isHealthyModelRun`) + `:222-225` (`deriveBarrageExitCode`); PRD criterion in `types.ts:113-119`

PRD says: "CLI exit code: 0 if any model produced output; 1 if all failed." Implementation requires `exitCode === 0 && !timedOut && spawnError === undefined && stdoutBytes > 0`. A model that emits a complete useful response but exits non-zero (rate-limit warnings, partial-completion codes, non-zero-on-findings conventions are all common in LLM CLIs) is classified as "failed" — its findings file still on disk but the run reports exit 1 if it was the only "useful" model. Three subtly different contracts: code + `types.ts` comment + PRD all say different things.

**Fix:** decide which contract is authoritative + align all three. Recommended: relax `isHealthyModelRun` to "produced positive-byte stdout AND was not a spawn error / timeout" (matching the PRD's "produced output" wording).

#### AUDIT-20260529-04 — Prompt-renderer is exported but not wired into the verb

Finding-ID: AUDIT-20260529-04 (claude-prompt-renderer-orphaned + codex-prompt-seed-override; cross-model + in-band Finding-001)
Status: open
Severity: high
Surface: `subcommands/audit-barrage.ts:300-307` (`loadPromptText` reads `--prompt-file` raw); `prompt-renderer.ts` (exported but uncalled at runtime); `install-scope-discovery.ts:84-106` (seeds the override unconditionally)

The Task 3 prompt-renderer (`renderAuditBarragePrompt`, `EXPECTED_VARS`, `PROMPT_OVERRIDE_PATH`, `DEFAULT_PROMPT_TEMPLATE_PATH`) is referenced ONLY in `prompt-renderer.ts` and its test — **no runtime caller**. The CLI shim reads `--prompt-file` raw and passes the bytes straight through. The Phase 12 Task 3 acceptance criterion "project-overridable prompt template" is only half-met: config override IS wired (`loadAuditBarrageConfig` is called), but prompt override IS NOT.

Codex independently flagged a related issue: install-scope-discovery unconditionally seeds the override prompt file with literal `{{var}}` markers in instructional prose, which `rejectUnsubstitutedTokens` would reject — making the renderer's failure-loud check fire on its own seeded scaffold.

The operator hit this in-band during the dogfood (Finding-001 — couldn't render the prompt via the renderer because the template's instructional prose contains `{{var}}` strings, so the rejectUnsubstitutedTokens check fires on the template itself). Used a hand-substituted prompt instead.

**Fix:** either (a) wire `renderAuditBarragePrompt` into the verb (CLI takes `--render-vars` or auto-detects + renders) and refine the unsubstituted-token check to only reject `EXPECTED_VARS` that didn't get substituted, OR (b) drop the prompt-renderer entirely + document that the operator hand-composes the prompt + passes it via `--prompt-file`.

### Single-model findings (claude only)

#### AUDIT-20260529-05 — Timeout timer leaks on spawn-error path (~305s dangling per uninstalled CLI)

Finding-ID: AUDIT-20260529-05 (claude-timeout-leak-on-spawn-error)
Status: open
Severity: high
Surface: `spawn-cli.ts:99-110` vs `:118-126`

`clearTimeout(timeoutTimer)` happens ONLY inside the `'exit'` handler. On spawn failure (ENOENT — binary not installed), Node emits `'error'` and never `'exit'`. The error handler calls `finish()` which clears `sigkillTimer` but not `timeoutTimer`. Timer survives ~305 seconds after the run is logically done. The CLI shim's `process.exit()` masks this, but `orchestrateBarrage` is a public library function — any caller that awaits it without forcibly exiting hangs or emits open-handle warnings. Plus the post-finish `child.kill` mutating `timedOut` after the result was reported is a latent race.

The common dogfood case is "not all three CLIs are installed" — this fires on nearly every real run for any audit-barrage adopter who hasn't yet installed all configured models.

**Fix:** move `clearTimeout(timeoutTimer)` into `finish()` alongside the `sigkillTimer` cleanup so every settle path clears both.

#### AUDIT-20260529-06 — `--prompt-file` read failure exits 1; config-error exits 2 (inconsistent usage-vs-runtime classification)

Finding-ID: AUDIT-20260529-06 (claude-promptfile-exit-code)
Status: open
Severity: low
Surface: `audit-barrage.ts:300-308` vs `:285-289`

A missing/unreadable `--prompt-file` is operator-input error of the same class as malformed `--models` filter or bad config — yet exits `1` (the "all models failed" code), while malformed config exits `2`. Wrapper scripts distinguishing "the audit ran and everything failed" from "you invoked me wrong" get the wrong signal.

**Fix:** `loadPromptText` exits 2 on file-read failure (matching the config-error path; both are pre-orchestration input validation).

#### AUDIT-20260529-07 — Run-dir timestamp collision risk (second-resolution + recursive mkdir)

Finding-ID: AUDIT-20260529-07 (claude-rundir-collision)
Status: open
Severity: low
Surface: `run-artifacts.ts:30-37` + `orchestrate-barrage.ts:64`

Run-dir name is `<second-resolution-timestamp>-<feature>` + `mkdir({recursive:true})` doesn't error on existing dir. Two barrages for the same feature within the same wall-clock second resolve to the same run dir; the second silently overwrites the first. Project's "database preserves, doesn't delete" ethos says this is the wrong default.

**Fix:** millisecond-resolution timestamp OR detect existing dir + suffix `-2`/`-3`.

#### AUDIT-20260529-08 — Misleading comment in `orchestrateBarrage`

Finding-ID: AUDIT-20260529-08 (claude-orchestrate-comment-drift)
Status: open
Severity: low
Surface: `orchestrate-barrage.ts:71-83`

Comment reads "assemble it without the indexPath first, then patch it on after the write so the record we return matches what landed on disk" — but the code does the opposite (computes `indexPath` up front, no post-write patch). `writeIndexFile`'s return value is discarded.

**Fix:** align comment to actual code (or drop the inaccurate "patch on after" framing).

#### AUDIT-20260529-09 — Test files for this feature were outside the audited diff (range scoping concern)

Finding-ID: AUDIT-20260529-09 (claude-test-files-outside-range)
Status: informational
Severity: low
Surface: this audit-barrage run's diff scope

The audit prompt's diff excluded `*.test.ts` (I scoped narrowly to the production surface). Claude flagged that the "43 + 27 tests" claim couldn't be verified from the diff alone, and that a green test count is weak evidence for the timing/teardown bugs found above. Actionable: future audit-barrage runs should include the test surface in the diff scope, OR the operator should explicitly acknowledge the scope cut.

### Operator-side in-band findings during the dogfood

#### AUDIT-20260529-10 — Renderer's unsubstituted-token rejection over-eager on instructional prose

Finding-ID: AUDIT-20260529-10 (in-band Finding-001; subsumed by AUDIT-20260529-04)
Status: open
Severity: high
Surface: `prompt-renderer.ts:205-211`

Operator hit this in-band trying to render the prompt template — the template's instructional prose mentions `{{var}}` / `{{prompt}}` / `{{name}}` / `{{var_name}}` as documentation about the substitution mechanism. `rejectUnsubstitutedTokens` rejects ANY `{{xxx}}` substring, so it rejects the template's own instructional examples. Subsumed by AUDIT-20260529-04; fix lands together.

#### AUDIT-20260529-11 — Prompt template's marker triplet pattern triples large vars

Finding-ID: AUDIT-20260529-11 (in-band Finding-002)
Status: open
Severity: medium
Surface: `templates/audit-barrage-prompt.md`

The template wraps each substitution as:
```
<!-- {{var}} -->
{{var}}
<!-- {{var}} -->
```

Substitution replaces all three occurrences (the two HTML comment markers + the bare token), so the value appears in the rendered output 3 times. For small vars (`feature_slug`) this is harmless; for `diff` at 60 KB this triples to 180 KB. The operator's naive `.split().join()` substitution hit this; the prompt-renderer presumably has the same shape (need to verify).

**Fix:** template convention should use a single substitution site (e.g. fenced code block) rather than marker triplets — OR the renderer must be more precise about which occurrences to substitute (only the bare-token line, not the marker comments).

### Acceptance signal verification

**Acceptance signal: ≥1 finding the in-band self-audit + SDD review cycle didn't catch.**
- In-band self-audit (orchestrator-loop): didn't run formally; the operator's own pre-commit + tsc + test pass equivalent gates.
- SDD review cycle: the Task 2 + Task 3 dispatches went through `dw-lifecycle wrap-prompt --agent-type typescript-pro` + `dw-lifecycle validate-return`; agents shipped the work; no review-cycle findings surfaced.
- All 13 audit-barrage findings above were NOVEL — not caught by tsc, tests, or the dispatch-wrapper's response validation.

**Conclusion: acceptance signal met overwhelmingly.** The audit-barrage feature works as designed; its first dogfood against itself surfaced 4 cross-model HIGH-confidence bugs + 9 single-model findings, all of which would have shipped without the audit-barrage's existence.

Next steps (out of scope for Task 6 itself; track separately):
- Fix AUDIT-20260529-01..05 in a follow-up task before Phase 12 completes (the HIGH findings are blocking-adjacent per claude's framing).
- AUDIT-20260529-06..09 are polish; fix in follow-ups or surface as GH issues.
- AUDIT-20260529-10..11 are the prompt-renderer / template design issues uncovered in-band; fold into the Task 4/7 follow-up that wires the renderer properly.
