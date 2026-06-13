# Audit Log — 009-project-doc-setup

Durable record of audit findings + their dispositions. Status values: `open` → `fixed-<sha>` → `verified-<date>`, or `acknowledged-<date>` with substantive reason.

---

## 2026-06-10 — after_implement governance barrage (009 read-side + setup)

Cross-model audit-barrage (`stackctl govern --mode implement`) over the full 009 diff (base `c2f411ad`). Models: `claude` (opus48, exit 0, 172s) + `codex` (gpt-5, exit 0, 87s). Run dir: `.stack-control/audit-runs/20260610T002606307Z-009-project-doc-setup-after_clarify/`. 6 claude + 4 codex raw findings → 9 deduped entries. **Lift step failed** (audit-barrage-lift resolves `docs/*/001-IN-PROGRESS/<slug>/`, not the Spec Kit `specs/<feature>/` layout — logged as **TF-31** in `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md`); findings recorded here by hand.

### HIGH

**AUDIT-20260610-01** — Status: fixed-4d348b5e — **[cross-model: claude-01 + codex-01]**
Surface: `plugins/stack-control/src/subcommands/setup.ts` `resolveTarget` + `src/config/installation.ts` `resolveInstallation`.
Title: `setup --at <subdir>` cannot create a child installation beneath an existing parent.
`resolveTarget(at)` calls `findInstallation(at)` (an UPWARD walk); when an ancestor already has `.stack-control/config.yaml`, setup operates on the ancestor and ignores `--at`. On the dogfood repo (root is now an installation), `setup --at plugins/stack-control` resolves to the repo root and creates nothing at the subdir — contradicting the documented monorepo workflow (README/SKILL "`--at <pkg>` targets a subtree as its own installation"). The US4 test only covers siblings under a BARE parent, so the green suite never exercised "child under an existing parent." Fix: when `--at` is explicitly passed, it is authoritative for the installation root — designate/operate on the installation rooted at exactly `resolvePath(at)` (idempotent when that exact dir already has its own config), not any enclosing ancestor.

**AUDIT-20260610-02** — Status: fixed-4d348b5e — codex-02
Surface: `plugins/stack-control/README.md` backlog section (~line 110).
Title: README backlog section still documents the old bundled-default contract.
The backlog-specific README section still says the target defaults to the plugin-bundled `backlog/` with `STACKCTL_BACKLOG_DIR` as the override — but the code now resolves through the enclosing installation and fails loud outside one. Operator-facing drift on the exact command surface. Fix: update the README backlog section to the installation-resolution behavior (seam = explicit override only).

### MEDIUM

**AUDIT-20260610-03** — Status: fixed-4d348b5e — codex-03
Surface: `plugins/stack-control/src/config/config-loader.ts` `requirePositiveInteger(version)` + `schema/stackctl-config.yaml.schema.json`.
Title: Unknown future config `version` accepted as v1-compatible.
The schema/data-model say an unknown version is a descriptive error, but the loader only checks positive-integer; `version: 2` parses and is treated with v1 semantics. config-loader.test.ts tested 0/neg/non-int/string/missing but NOT a too-high version (test blind spot). Fix (TDD-first): reject any version outside the supported set (currently `{1}`) with `invalid-config`.

**AUDIT-20260610-04** — Status: fixed-4d348b5e — claude-02
Surface: `plugins/stack-control/src/subcommands/setup.ts` ready-computation + `src/setup/report.ts` readiness line.
Title: Dry-run on a fresh project prints `ready: yes (all required items present + well-formed)` while nothing exists.
In dry-run fresh, no key is verified (neither existed nor applied), so `ready` stays true and the report's readiness line contradicts the `[would create]` labels + dry-run banner. Operator may conclude the installation already exists. Fix (TDD-first): in dry-run, the readiness verdict reflects "would be ready after --apply" when any item is would-create.

**AUDIT-20260610-05** — Status: fixed-4d348b5e — claude-03
Surface: `plugins/stack-control/src/backlog/root.ts` + `src/subcommands/backlog.ts` `ensureBacklogProject`.
Title: `backlogRoot()` and `ensureBacklogProject()` carry duplicated derivation; `root.ts` header comment is stale.
The backlog verb no longer calls `backlogRoot()` (still used by `slush-findings`); `ensureBacklogProject()` recomputes the identical `dirname(inst.resolved.backlog)`. Two copies can diverge — the "both agree" invariant the root.ts comment promises now rests on duplication. Fix: `ensureBacklogProject()` delegates to `backlogRoot()` for the non-seam path; correct the stale comment.

**AUDIT-20260610-06** — Status: fixed-4d348b5e — claude-04
Surface: `plugins/stack-control/src/setup/verify.ts` header + `verifyAuditLog`.
Title: verify.ts header claims "validity oracle is the consuming parser (D6)" but the audit-log oracle is a `# Audit Log` string-prefix heuristic.
No strict audit-log parser exists (audit logs are regex-read), so the audit-log oracle is necessarily structural. The blanket D6 claim in the header over-states it. Fix: scope the header claim (D6 holds for config/roadmap/inbox; the audit-log uses a structural header check) and document the heuristic's limit.

**AUDIT-20260610-07** — Status: fixed-4d348b5e — codex-04
Surface: `plugins/stack-control/src/subcommands/setup.ts` + `skills/setup/SKILL.md` ("records every location") + tasks.md T025.
Title: Setup does not persist resolved `paths.*` into the config; "records every location" wording overstates it.
Setup writes only `version: 1` for a fresh config; it does not materialize resolved default locations into `.stack-control/config.yaml`. Per D3 (keep the common case a one-liner), persisting all defaults is undesirable — the REPORT records locations; the config records OVERRIDES. Fix: reconcile the skill/tasks wording (the report records every resolved location; the config records overrides; unset keys imply the default). (Operator may instead choose to persist — flagged as a small design call.)

### LOW

**AUDIT-20260610-08** — Status: fixed-4d348b5e — claude-05
Surface: `plugins/stack-control/src/subcommands/roadmap.ts` handlers vs `inbox.ts`.
Title: `roadmap.ts` discards the `opts` from `resolveVerbDoc` and re-derives grammar via `grammarDirs()` (redundant installation walks; asymmetric with inbox.ts).
Not a current defect (opts are provably equal today), but dead-value + redundant I/O + divergence risk. Fix: thread `opts` from `resolveVerbDoc` through the roadmap handlers exactly as inbox.ts does.

**AUDIT-20260610-09** — Status: fixed-4d348b5e — claude-06
Surface: `plugins/stack-control/src/subcommands/{inbox,roadmap}.ts` dispatch.
Title: Removing the `default` switch arm drops the exhaustiveness backstop.
The pre-dispatch unknown-subaction guard rejects only subactions ABSENT from `SUBACTION_SPECS`; a spec key without a matching `case` would now silently no-op (exit 0). Fix: add a `const _exhaustive: never = subaction` after each switch (compile-time exhaustiveness) — or restore a `default` that fails loud.

> The governance lift-path friction surfaced by this run is a tooling-harness issue, not a 009 code finding — it is logged as **TF-31** in `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/tooling-feedback.md` (the designated Spec-Kit friction log), not here.
