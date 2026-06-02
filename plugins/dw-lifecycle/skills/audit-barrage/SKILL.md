---
name: audit-barrage
description: "Fire multiple CLI audit tools (claude, codex, gemini) in parallel against a feature diff and capture per-model findings for triage"
---

# /dw-lifecycle:audit-barrage

Run a multi-model audit barrage: fire N installed CLI tools in parallel against a uniform audit prompt; capture each tool's stdout to a per-model markdown file under `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<feature>/`; emit a per-run INDEX manifest the operator walks during triage. Findings get lifted into the canonical feature audit-log via the existing `/dw-lifecycle:audit` (or `:review`) closure workflow.

The barrage is the **third independent audit surface**, additive to the in-band self-audit (orchestrator-loop) and the SDD two-reviewer cycle. Cross-model genetic diversity surfaces failure modes single-model audits miss. Per the dogfood data (Phase 12 self-audit, AUDIT-20260529-01..11 in the scope-discovery audit-log): one full barrage against an in-flight feature surfaced 4 cross-model HIGH-confidence findings that the in-band layer + the SDD cycle missed.

**Why CLIs and not direct API calls.** The verb dispatches `claude`, `codex`, `gemini`, etc. as installed CLI binaries — each tool runs against the operator's existing CLI subscription (Claude Pro, Codex, Gemini CLI), not against a metered API endpoint. The cost shape that matters in practice is "is the CLI installed + authenticated" not "how many tokens did this prompt consume." A barrage on a multi-thousand-line diff is the same operator cost as a one-line probe: zero direct API metering, bounded by the per-CLI subscription. This is the load-bearing design choice that lets the `/dw-lifecycle:implement` end-of-task hook fire unconditionally at every task boundary.

## When to run

- **After substantive task work lands on the branch.** Sub-agent dispatches that materially change behavior get a barrage pass before the next commit batches ship.
- **Before release.** The feature's `audit-log.md` gets a barrage entry between the final commit and `/dw-lifecycle:ship`.
- **On operator demand.** Triggered explicitly by the operator during `/dw-lifecycle:audit`, `/dw-lifecycle:review`, `/dw-lifecycle:complete` walks, or anywhere the diff-under-audit is interesting.

Auto-firing the barrage at lifecycle waypoints (`session-end`, `complete`, `ship`) is Design B (per [`ROADMAP.md` § Audit-barrage feature shape](../../../../ROADMAP.md)); v1 is operator-triggered only.

## Two-step workflow: render → fire

The verb pair is intentionally split so the operator can inspect and tune the rendered prompt before it consumes model budget.

### Step 1: Assemble a vars JSON file

The renderer expects a flat JSON object with these five keys (mirrors `EXPECTED_VARS` in `prompt-renderer.ts`):

```json
{
  "feature_slug": "scope-discovery",
  "workplan_summary": "...one-paragraph PRD + workplan summary...",
  "diff": "...the diff under audit, verbatim...",
  "audit_log_excerpt": "...recent feature audit-log entries...",
  "commit_subjects": "...one-line per commit in the audited range..."
}
```

The vars get substituted into the template at single-substitution sites (one `{{key}}` per var). Large inputs (e.g. a 60 KB diff) appear exactly once in the rendered prompt — there is no marker-triplet duplication.

### Step 2: Render the prompt

```
dw-lifecycle audit-barrage-render \
    --feature <slug> \
    --vars-file <path-to-vars.json> \
    --output <path-to-prompt.md>
```

The renderer resolves the template: project override at `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` takes precedence; falls back to the plugin's shipped default at `plugins/dw-lifecycle/templates/audit-barrage-prompt.md`. Writes the rendered body to `--output` (or stdout when omitted).

Exit codes:
- `0` — render succeeded.
- `1` — render failed (missing declared var, malformed template, unsubstituted EXPECTED_VARS marker survived).
- `2` — usage error (missing flag, unreadable vars file, vars file isn't valid JSON, vars-file `feature_slug` doesn't match the `--feature` flag).

### Step 3: Fire the barrage

```
dw-lifecycle audit-barrage \
    --feature <slug> \
    --prompt-file <path-to-prompt.md> \
    [--models <comma-list>] \
    [--repo-root <path>] \
    [--quiet] \
    [--output-run-dir]
```

The `--output-run-dir` flag is for bash composition (used by the
`/dw-lifecycle:implement` end-of-task audit-barrage hook). When set,
stdout becomes JUST the absolute run-dir path (newline-terminated);
the `BarrageRun` JSON is suppressed. Stderr behavior unchanged. Use
in `$()` capture:

```
RUN_DIR=$(dw-lifecycle audit-barrage \
  --feature <slug> \
  --prompt-file <prompt> \
  --output-run-dir)
dw-lifecycle audit-barrage-lift \
  --feature <slug> \
  --run-dir "$RUN_DIR" --apply
```

Default mode (without the flag) keeps the JSON-on-stdout shape used
by the existing skill triage walk.

The barrage:

1. Loads the model battery from `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` if present (and `models:` is uncommented); falls back to the plugin's shipped default at `plugins/dw-lifecycle/templates/audit-barrage-config.yaml`.
2. Optionally filters via `--models claude,codex` to run a subset.
3. Spawns each configured CLI in parallel; captures stdout to `<run-dir>/<model>.md` and stderr to `<run-dir>/stderr/<model>.txt`.
4. Writes `<run-dir>/PROMPT.md` (the rendered prompt verbatim) and `<run-dir>/INDEX.md` (per-model exit code / duration / byte counts).
5. Emits the `BarrageRun` record to stdout as JSON; emits a one-line summary to stderr (suppressed by `--quiet`).

Run directory: `<repo-root>/.dw-lifecycle/scope-discovery/audit-runs/<YYYYMMDDTHHMMSSsssZ>-<feature>/`. The timestamp resolution is milliseconds so two barrages for the same feature in the same wall-clock second land in distinct directories.

Exit codes:
- `0` — at least one model produced positive-byte stdout AND was not a spawn failure. Non-zero CLI exits and timeouts fall on this side because captured stdout is still triagable.
- `1` — every model failed (spawn error or zero stdout bytes).
- `2` — usage error (missing flag, unreadable `--prompt-file`, malformed config).

### Alternative: skip the renderer

If the operator hand-composes the audit prompt (no template substitution needed), pass it directly:

```
dw-lifecycle audit-barrage --feature <slug> --prompt-file <hand-composed-prompt.md>
```

The shim treats `--prompt-file` as opaque bytes; the renderer's substitution machinery is only relevant when the template's `{{var}}` markers need values supplied.

## Triage workflow

After the barrage settles:

1. **Read `<run-dir>/INDEX.md`.** Spot-check per-model exit codes, byte counts, timeouts, spawn errors. A model that spawn-errored (`-2`) was not installed or not on PATH; investigate before re-running.
2. **Read each `<run-dir>/<model>.md`.** Each one is the captured stdout of one CLI's audit response. Models that emitted findings will use the prompt's canonical finding-block format (`Finding-ID: AUDIT-BARRAGE-<model>-NN`, severity, surface, body).
3. **Cross-reference findings across models.** Findings that two or more models flagged independently are cross-model agreement — HIGH-confidence signals. Same-finding-different-framing is one entry in the canonical audit-log with the cross-model Finding-IDs combined in the `Finding-ID:` header (e.g. `AUDIT-20260529-04 (claude-prompt-renderer-orphaned + codex-prompt-seed-override; cross-model)`).
4. **Lift findings into the feature's `audit-log.md`.** Each surfaced finding gets a stable `AUDIT-<YYYYMMDD>-NN` ID + `Status: open` + per-finding fix guidance. Single-model findings still get lifted; the `Finding-ID:` header carries only the originating model's cite.
5. **Triage informational / clean reports.** A model that emitted no substantive findings should still appear in the run-dir; absence of findings is itself signal when paired with siblings' output.

The triage step is the same workflow `/dw-lifecycle:audit` and `/dw-lifecycle:review` already use; the barrage adds one more raw input the operator joins against the canonical audit-log.

## Override paths

| Override | Path | Effect |
|---|---|---|
| Prompt template | `.dw-lifecycle/scope-discovery/audit-barrage-prompt.md` | Project-specific audit prompt body. Plugin default at `plugins/dw-lifecycle/templates/audit-barrage-prompt.md` is the fallback when this file is absent OR is the comment-only scaffold seeded by `install-scope-discovery`. The renderer rejects only unsubstituted EXPECTED_VARS markers (declared in `prompt-renderer.ts`); instructional `{{...}}` strings in the body pass through unchanged. |
| Model battery | `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` | Project-specific list of CLI tools + invocation args + timeout per model. Plugin default at `plugins/dw-lifecycle/templates/audit-barrage-config.yaml`. The config-loader treats a file with a parseable, non-empty `models:` list as the override; comments-only scaffold falls through to the default. Schema lives at `scope-discovery/schema/audit-barrage-config.yaml.schema.json` for editor autocomplete. |

The `install-scope-discovery` skill seeds both files as commented scaffolds so the override paths exist at discoverable locations without overriding the defaults until the operator opts in.

## Run-dir layout

```
<repo-root>/.dw-lifecycle/scope-discovery/audit-runs/
└── <YYYYMMDDTHHMMSSsssZ>-<feature-slug>/
    ├── INDEX.md             — per-model run manifest (triage starting point)
    ├── PROMPT.md            — rendered audit prompt (verbatim)
    ├── <model>.md           — captured stdout, per configured model
    └── stderr/
        └── <model>.txt      — captured stderr, per configured model
```

The run dir is permanent — the dogfood signal is preserved as evidence. Adopters who want to prune old runs can do so by hand; the verb itself never deletes a run dir.

## Composition with other audit surfaces

The barrage is the THIRD surface, additive to:

1. **In-band self-audit** (orchestrator-loop pattern in `plugins/dw-lifecycle/src/scope-discovery/orchestrator-loop/`). Same model + same context. Catches obvious correctness slips. Same-context blind to its own failure modes.
2. **SDD two-reviewer cycle** (`/dw-lifecycle:review` / `:audit`). Sub-agent dispatch — `feature-dev:code-reviewer` runs spec-compliance + quality passes. Different context from the implementer; same model class. Medium signal.
3. **Audit-barrage** (this skill). Multiple model families in parallel. Different training corpora = independent failure modes. Highest signal for the bugs single-model audits miss.

The barrage doesn't replace the other two — it composes. Implementations exercise all three at appropriate cadences.

## Cross-references

- **Discipline rule** — [`/.claude/rules/agent-discipline.md`](../../../../.claude/rules/agent-discipline.md) § "Audit-barrage: structured cross-model audit". The operator-discipline cue for when to run the barrage + how to triage findings.
- **ROADMAP** — [`ROADMAP.md`](../../../../ROADMAP.md) § "Audit-barrage feature shape". The long-term plan: Design A (this skill, shipped); Design B (lifecycle auto-fire + meta-audit synthesizer); Design C (continuous background daemon).
- **PRD** — [`docs/1.0/001-IN-PROGRESS/scope-discovery/prd.md`](../../../../docs/1.0/001-IN-PROGRESS/scope-discovery/prd.md) § Phase 12 acceptance criteria.
- **Audit-log** — [`docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`](../../../../docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md) § "2026-05-29 — Phase 12 audit-barrage self-dogfood". The canonical record of the Phase 12 dogfood findings + their dispositions.
- **CLI invocation contracts** — [`docs/1.0/001-IN-PROGRESS/scope-discovery/audit-barrage-cli-notes.md`](../../../../docs/1.0/001-IN-PROGRESS/scope-discovery/audit-barrage-cli-notes.md). Per-CLI flag set + invocation pattern + auth surface, verified live against installed claude / codex / gemini.

## Shortcut

The opt-in `install-shortcuts` skill installs `/dwab` (Scheme A), `/dw-ab` (Scheme B), or `/dw-audit-barrage` (Scheme C) as a user-level shim that forwards to `/dw-lifecycle:audit-barrage`. See [`/dw-lifecycle:install-shortcuts`](../install-shortcuts/SKILL.md) for the install flow.
