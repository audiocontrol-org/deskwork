# Audit-barrage — CLI invocation contract per model

Phase 12 Task 1 deliverable: probe + document the invocation contract for each CLI in the v1 model battery.

Probed 2026-05-29 on macOS (Darwin 24.6.0) against installed CLIs in the operator's PATH. Findings are operator-environment-specific (auth surface, model defaults, sandbox flags). The `args_template` strings derived here become the v1 defaults in `plugins/dw-lifecycle/templates/audit-barrage-config.yaml` (Phase 12 Task 3).

## Installed versions probed

| CLI | Path | Version |
|---|---|---|
| `claude` | `~/.local/bin/claude` | `2.1.156 (Claude Code)` |
| `codex` | `~/.nvm/versions/node/v22.19.0/bin/codex` | `codex-cli 0.133.0` |
| `gemini` | `~/.nvm/versions/node/v22.19.0/bin/gemini` | `0.17.1` |

All three on PATH. All three resolve from operator-owned install locations (no system-wide install). Adopters' environments will differ in version + install path; the audit-barrage config YAML accepts arbitrary `binary:` paths so the verb works against whichever resolution the adopter has.

## Invocation pattern per CLI

### `claude` (Anthropic, headless mode)

```
claude -p "<prompt>" < /dev/null
```

- Flag: `-p, --print` switches from interactive to non-interactive. Without it, claude opens an interactive REPL.
- Prompt: passed as positional after `-p`. Quoting handled by shell.
- Stdin: must be closed (`< /dev/null`) or claude waits 3 seconds for piped input and emits a warning on stderr. Closing stdin suppresses the warning.
- Stdout: model response, plain text.
- Stderr: stdin-timeout warning when stdin not closed; otherwise empty on success.
- Exit: `0` on success.
- Round-trip wall time: ~3–7 seconds for small prompts (< 200 chars); ~4–5 seconds for 5 KB prompts.

**Audit-barrage args_template:** `"-p {{prompt}}"`. Subprocess invocation must pipe `< /dev/null` from the spawn-cli helper (Phase 12 Task 2 — `spawn-cli.ts`).

**Caveat — instruction adherence on long prompts.** Probed a 5.4 KB prompt with a strict instruction "reply with the literal text X and nothing else." `claude -p` responded "I'll respond as requested" instead of the literal. Codex + Gemini both emitted the literal. The divergence likely traces to claude's `-p` flag putting the entire prompt in the user message slot (empty system prompt by default), which gives weaker steering on response shape. Not a blocker for audit prompts (which want findings, not literal echo), but noted so future tuning has the data.

### `codex` (OpenAI, non-interactive subcommand)

```
codex exec "<prompt>" < /dev/null
```

- Subcommand: `exec` (alias: `e`) runs non-interactively. Without it, `codex` opens an interactive CLI.
- Prompt: positional argument after `exec`.
- Stdin: should be closed (`< /dev/null`). Without it, codex emits `"Reading additional input from stdin..."` on stderr while waiting.
- Stdout: model response, plain text. No banner / leading metadata.
- Stderr: operational banner (workdir / model / provider / approval / sandbox / reasoning effort). ~430 bytes for the small probe. Non-fatal informational; can be redirected to `stderr/codex.txt` per the audit-barrage layout.
- Exit: `0` on success.
- Round-trip wall time: ~3.5 seconds for both small + 5 KB prompts (lowest variance of the three).
- Default model: `gpt-5.5`. Default sandbox: `workspace-write` (cwd + /tmp + $TMPDIR).
- Default reasoning effort: `medium`. Override via flags if needed (we use defaults for v1).

**Audit-barrage args_template:** `"exec {{prompt}}"`. Subprocess pipes `< /dev/null`.

### `gemini` (Google, positional prompt)

```
gemini "<prompt>" < /dev/null
```

- Bare positional: the prompt is the default positional argument. No subcommand needed.
- Alternative flag `-p`/`--prompt` is deprecated (per `gemini --help`); use the positional.
- Stdin: should be closed (`< /dev/null`); `gemini`'s default `[default]` behavior is "Launch Gemini CLI" and it may interpret an open stdin as interactive input.
- Stdout: model response, plain text.
- Stderr: brief operational lines ("Loaded cached credentials", "Loading extension: <name>"). ~60 bytes for the small probe.
- Exit: `0` on success.
- Round-trip wall time: ~7 seconds for small prompts; **~15 seconds for 5 KB prompts** (slowest of the three on long input).
- Default model: per gemini CLI's installed default (overridable via `-m` flag).

**Audit-barrage args_template:** `"{{prompt}}"` (the prompt IS the positional, no leading subcommand or flag). Subprocess pipes `< /dev/null`.

## Common contract across all three

| Property | Behavior |
|---|---|
| stdin handling | All three need `< /dev/null` on the spawn (else they wait for piped input) |
| stdout shape | All three emit the model response as plain text; no leading banner |
| stderr shape | Operational metadata only (banners, warnings, credential-loading); no model output |
| exit code | `0` on success across all three for normal prompts |
| prompt shape | All three accept the prompt as a single argument; no chunking / streaming needed for typical audit-prompt sizes (5–50 KB) |

This common contract means the v1 spawn-cli helper (Phase 12 Task 2) can use a uniform shape: spawn with `stdin: 'ignore'` (Node's `child_process.spawn` equivalent of `< /dev/null`), capture `stdout` to a per-model `<model>.md`, capture `stderr` to `stderr/<model>.txt`, treat non-zero exit as a per-model failure.

## Per-CLI timing implications for the v1 config

Default timeout in Phase 12 Task 3's config YAML: **300 seconds (5 minutes)**.

- Small prompt round-trip: 3–7 seconds (well below the limit).
- 5 KB prompt round-trip: 4–15 seconds (still well below).
- Audit-prompt round-trip (multi-KB workplan + diff + audit-log excerpt): unknown until Phase 12 Task 6's live verification. The 300s default gives 20–60× headroom over what we've measured so far; if real audit prompts trend toward 60–120s (plausible for deep-reasoning models), the default still has 2.5–5× headroom.

Operator can tune per-model via the override config when calibration data accrues.

## Auth surface

All three CLIs handle auth themselves; the plugin does NOT store or rotate credentials. Probed CLI invocations on the operator's machine completed without any prompt for auth — the operator has previously authenticated each CLI (`claude` via Claude Code's account; `codex` via `codex login`; `gemini` via Google account flow). The audit-barrage's failure-loud posture covers the absent-CLI case (Phase 12 Task 2 acceptance criterion); auth failures will surface on stderr with the CLI's native error format.

## Open items for downstream tasks

These notes feed Phase 12 Task 2 (CLI verb + library) + Task 3 (prompt template + config) directly:

- The v1 `audit-barrage-config.yaml` model entries match the three `args_template` strings above.
- `spawn-cli.ts` must close stdin on every spawn (`stdin: 'ignore'`).
- The per-run directory layout (`stderr/<model>.txt`) captures the operational banners separately from the model response, so the operator's triage walk only sees model-relevant content in `<model>.md`.
- Live verification (Phase 12 Task 6) will produce real timing + prompt-size data for the override-config tuning section in the operator-facing docs.
