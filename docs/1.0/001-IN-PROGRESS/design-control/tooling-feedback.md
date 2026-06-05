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

| TF | Status | Closing commit |
|---|---|---|
| TF-001 | Open | — |
| TF-002 | Open | — |

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
