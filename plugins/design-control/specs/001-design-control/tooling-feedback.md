# Tooling Feedback — design-control

Running log of friction, pathologies, and improvement opportunities in the scope-discovery + duplication tooling, captured during this feature's implementation. Each entry is one observable friction point with a Repro / Workaround / Suggested-fix shape; the log is append-only (entries are never deleted — closed ones get a `Status` line + closing-commit reference).

## How to operate this log

- File entries the moment friction surfaces — don't batch them; the cumulative set teaches more than a single end-of-feature "audit."
- Use the category legend below; pick severity by impact on the operator (`high` blocks work or hides bugs; `medium` slows work meaningfully; `low` is a papercut).
- Never delete an entry. Closed entries stay in the log with their closing-commit SHA + a one-line summary of the fix.
- Each entry's body is **Repro → Workaround used → Suggested fix** — operator-recognizable shapes, not just "make it better."
- Promote an entry to a GitHub issue when it needs explicit triage (architecture-level concern, recurring pattern across audits, design decision). TF entries that stay tooling-internal stay in this log.

## Category legend

- **A** — anti-patterns registry
- **AM** — adopter-manifests registry
- **CL** — clones.yaml + clone-detector
- **GATE** — pre-commit / hook ergonomics
- **DSC** — discovery agents / synthesis
- **MISC** — everything else (build, packaging, agent dispatch hygiene, ergonomics)

## Severity legend

- **high** — blocks work or hides bugs
- **medium** — slows work meaningfully
- **low** — papercut

## Status summary

| TF | Status | Issue | Closing commit |
|---|---|---|---|
| TF-001 | Filed | [#426](https://github.com/audiocontrol-org/deskwork/issues/426) | — |
| TF-002 | Filed | [#427](https://github.com/audiocontrol-org/deskwork/issues/427) | — |
| TF-003 | Open | — | — |
| TF-004 | Open | — | — |

## How to add an entry

1. Hit friction or pathology or notice an improvement opportunity.
2. Pick a category (A / AM / CL / GATE / DSC / MISC) and severity (high / medium / low).
3. Append a new section at the bottom (or insert by topic if it pairs with an existing entry) with the next TF-NNN id.
4. Include: Repro (what happened), Workaround used (what unblocked), Suggested fix (the operator-recognizable shape of a fix, not just "make it better").
5. Commit alongside the work that surfaced it.

---

## TF-001 · GATE · medium · `implement-hook` aborts the whole chain when a feature's `audit-log.md` does not exist yet

**Repro:** First end-of-task barrage on a brand-new feature. `dw-lifecycle implement-hook --feature design-control` (after the engine-adapter commit `c8c19f5d`) fired the barrage cleanly (claude + codex, both exit 0, run-dir `20260605T181608913Z-design-control`) but then `audit-barrage-lift` failed with `audit-log not found at docs/1.0/001-IN-PROGRESS/design-control/audit-log.md` and the hook aborted (`implement-hook: audit-barrage-lift failed; aborting`). The audit-log.md is never created by `setup`/`define`, so the first barrage of every feature hits this. The fired barrage's findings are stranded in the run-dir; re-running `implement-hook` would skip on the no-new-diff guard (tip unchanged), so the findings would never lift without manual intervention.

**Workaround used:** Hand-created `docs/1.0/001-IN-PROGRESS/design-control/audit-log.md` from the canonical header (copied from `scope-discovery/audit-log.md`, slug + paths swapped), then ran `audit-barrage-lift --feature design-control --run-dir <run-dir> --apply` directly to lift the already-fired barrage, followed by `check-barrage-dampener` manually.

**Suggested fix:** *Light* — `implement-hook` (or `audit-barrage-lift`) should auto-initialize an empty audit-log from the bundled header template when the feature dir exists but the log is absent, then proceed, rather than aborting. *Medium* — `/dw-lifecycle:setup` seeds `audit-log.md` (+ `tooling-feedback.md`) at feature-infrastructure creation time, so the first barrage has a target. The Medium option also fixes the same first-feature gap for `tooling-feedback.md`, which likewise did not exist for this feature.

## TF-002 · DSC · medium · `audit-barrage-lift` merges distinct findings under one ID but documents only one of them

**Repro:** The barrage produced 9 structured findings (claude-01..06, codex-01..03). `audit-barrage-lift --feature design-control --run-dir <run-dir> --apply` collapsed them to 4 audit-log entries. AUDIT-20260605-01's `Finding-ID` line reads `(claude-01 + claude-03 + claude-04 + codex-01 + codex-03; cross-model)` — i.e. it merged FIVE distinct findings (EngineMethod single-sourcing, preflight remedy hardcoding the default adapter, the `[0,1]` confidence check duplicated three times, method/envelope type-binding, and deferral language in source comments) into one entry whose **body describes only the EngineMethod single-sourcing issue.** A fixer reading only AUDIT-01's body would fix one of five real defects and mark the entry `fixed`, silently dropping the other four.

**Workaround used:** Read the raw `claude.md` + `codex.md` from the run-dir directly and fixed all nine underlying findings rather than trusting the merged entry bodies; recorded the full sub-finding list in the fix commit so the `Closes AUDIT-01` flip is honest.

**Suggested fix:** *Light* — when the lift merges N raw findings into one entry, the entry body must concatenate (or bullet-list) every merged sub-finding's actionable detail, not just the first/highest-signal one. *Medium* — only merge raw findings when they share a root cause AND surface; findings at different surfaces (preflight.ts vs types.ts vs comment-wording across three files) should stay as separate entries so each is independently closeable. Cross-model agreement should raise confidence/severity on a SHARED finding, not be the trigger to fold unrelated findings together.

**Recurrence (2026-06-06, run `20260606T060403205Z-design-control`, task-3 lint):** the lift again merged FIVE distinct findings under one ID — `AUDIT-20260606-01`'s `Finding-ID` line reads `(claude-01 + claude-02 + claude-03 + codex-01 + codex-02; cross-model)` but the body describes only the data-uri over-rejection (claude-01). The other four are genuinely distinct defects at the same surface but different mechanisms: precedence/mislabel (claude-02), scheme-regex boundary (claude-03), **mixed-rel `<link>` bypass (codex-01, real MED)**, and **control-char scheme obfuscation (codex-02, real MED)**. Same workaround: read the raw run-dir `claude.md`/`codex.md`, fixed all real defects, and SPLIT the merged entry into `AUDIT-20260606-01` (data-uri + precedence), `-02` (mixed-rel), `-03` (control-char scheme) so each is independently closeable. Two barrages in a row exhibiting this confirms it is systematic, not a one-off — the *Medium* fix (don't fold distinct-mechanism findings even when cross-model) is the one that matters.

## TF-003 · MISC · medium · audit-barrage per-model timeout (300s) too short for heavy adversarial / multi-file prompts

**Repro:** Firing `dw-lifecycle audit-barrage` with the design-control lint adversarial prompt (header + 5 concatenated `src/lint/*.ts` files; the agents must read + adversarially reason, not just diff-review). Run `20260606T233137617Z`: `codex` finished in 128s, but `claude` was SIGTERM-killed at exactly 300s (exit 143, 0 bytes stdout) — a DEGRADED single-model run. The diff-review barrages earlier this session finished claude in ~170s, so 300s suffices for diff-review but not for an adversarial generate-and-verify task over multiple source files.

**Workaround used:** raised `timeout_seconds: 300 → 600` for both models in `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` and re-fired.

**Suggested fix:** *Light* — a `--timeout-seconds` flag on `audit-barrage` to override per-run without editing the config (heavy adversarial prompts vs. quick diff-reviews want different caps). *Medium* — a higher default for non-diff prompts, or per-model timeout in the prompt-vars. At minimum, document that the config `timeout_seconds` governs and that adversarial/multi-file prompts need a larger value.

## TF-004 · MISC · medium · barrage agents run AGENTIC and write into the worktree (left a file in src/)

**Repro:** The first (timed-out) `claude` barrage agent, invoked as `claude -p {{prompt-stdin}}`, was building an empirical verification harness and wrote `plugins/design-control/src/_adv_verify.mts` into the repo source tree before the 300s SIGTERM killed it. The barrage agents are full agentic CLIs with write access to cwd; a review/adversarial barrage that the operator expects to be read-only can silently mutate the working tree (here: a stray `.mts` under `src/`; it happened to be excluded from `tsc` by the `*.ts` glob, but a `.ts` write would have entered the build).

**Workaround used:** removed the debris; rewrote the design-control adversarial prompt to (a) instruct agents to keep scratch scripts under a `/tmp` `mktemp` path and never write the repo tree, and (b) be a pure directive (see TF-005 note below).

**Suggested fix:** *Light* — `audit-barrage` prompts should carry a standing "read-only; scratch files in /tmp only" preamble for review-class barrages. *Medium* — run barrage agents with a read-only / sandboxed cwd (e.g. a scratch copy or a tmp working dir), or snapshot+restore the worktree around the fan-out, so a review barrage cannot mutate the tree under audit. (Related prompt-authoring lesson, TF-005-as-note: a prompt framed as a human "how to run this" doc made `claude -p` "orient and hand back" instead of executing; the FED prompt must be an unambiguous directive to the model — fixed in `audit/lint-adversarial-prompt.md`.)

## TF-005 · MISC · medium · govern diff step misreports a 60k-line diff as "empty diff" and silently downgrades to plan-context-only — filed upstream: https://github.com/audiocontrol-org/deskwork/issues/463

**Repro:** `stackctl govern --mode implement --repo-root plugins/design-control --feature design-control --diff-base 0391a0c0` (run `20260611T141406686Z`) printed `govern: empty diff against 0391a0c0 — running barrage over the plan context only (edge case; no defects expected)` while `git diff 0391a0c0..HEAD --stat` showed 43 files / 60,935 insertions. Three earlier same-flag runs the same day did not hit it; the variable that grew is the committed diff size (commit `8fad5abe` added ~40k lines of committed audit-run dirs), pointing at a payload cap/buffer overflow being misreported as empty. The lanes recovered by diffing the repo themselves (claude lane: "I walked the full diff against 0391a0c0"), so findings were real despite the wrong banner.

**Workaround used:** none needed for the lanes' coverage this run (agentic lanes self-diffed); treated the printed message as untrusted and verified the real diff by hand before triage.

**Suggested fix:** *Light* — fail loud (or print "diff truncated at N bytes") instead of "empty diff" when the diff subprocess overflows a limit. *Medium* — exclude the configured audit-runs dir from the governed diff payload (the protocol's own artifacts re-entering the next round's payload is the same compounding family as AUDIT-20260611-13).
