---
slug: decompose-agent-discipline
targetVersion: "1.0"
---

# Audit log — decompose-agent-discipline

## 2026-06-02 — Phase 2 per-disposition outcomes

`.claude/rules/agent-discipline.md`: **566 → 157 lines** (target: 150–200). Every disposition from the operator-approved table (PRD revision 2, Final) landed; each new home + the agent-discipline.md edit shipped in the same commit per the audit-legibility contract.

| # | Rule | Disposition | Outcome / new home |
|---|---|---|---|
| 1 | /frontend-design for design tasks | compose-into-skill | → `dw-lifecycle/skills/implement` + `setup` § Composed disciplines; rule → pointer |
| 2 | /dw-lifecycle:review after every step | delete | Deleted entirely (dead; superseded by audit-barrage). Skill retirement split to [#387](https://github.com/audiocontrol-org/deskwork/issues/387) |
| 3 | scope-don't-defer + TDD | compose (DONE) | → pointer (promote-findings + check-open-findings + check-fix-task-tdd + doctor rule own it) |
| 4 | audit-barrage | compose (DONE) | → pointer (audit-barrage SKILL owns it) |
| 5 | tooling-feedback | compose-into-skill | → `scope-inventory` § Composed disciplines; rule → pointer |
| 6 | inventory-vs-discovery | compose-into-skill | → `scope-inventory` § Composed disciplines; rule → pointer |
| 7 | read docs before quoting commands | stays-shrunk | shrunk ~10 → ~3 lines in place |
| 8 | operator owns scope decisions | mixed | dispatch-report half → `implement` skill; hedge half stays-shrunk |
| 9 | capture mode vs scope mode | compose-into-skill | → `dw-lifecycle/skills/define` + `deskwork/skills/iterate`; rule → pointer |
| 10 | empty revisions beat missed changes | compose-into-skill | → `deskwork/skills/iterate` + `approve`; rule → pointer |
| 11 | orchestrator ≠ implementation session | compose + gate | → `setup`/`issues` exit-step + `implement` precondition; rule → pointer |
| 12 | "Just for now" is bullshit | DEFER | **Untouched** (operator-flagged load-bearing); 49 lines intact |
| 13 | packaging is UX | compose-into-skill | → `complete` § Composed disciplines (close-shipped already references the rule); rule → pointer (AUDIT-06: corrected from "complete/close-shipped" — the composed section lives only in complete) |
| 14 | public-distribution-only | stays-shrunk | shrunk in place |
| 15 | never pass --no-tailscale | tool-fix | Flag now a deprecated no-op + `DESKWORK_STUDIO_NO_TAILSCALE` env hatch (TDD); rule **deleted** (bait gone) |
| 16 | memory-vs-rule placement | stays-shrunk | shrunk in place |
| 17 | namespace deskwork metadata | gate + compose | Write-guard `assertNamespacedDeskworkKeys` added (TDD); read/migrate side already existed (legacy-top-level-id-migration); rule shrunk to read-convention + pointer |
| 18a | stay on feature/deskwork-plugin | delete | Deleted (stale convention) |
| 18b | don't pitch /schedule | stays-shrunk | shrunk in place |
| 18c | no test infra in CI | stays-shrunk | shrunk in place |
| 18d | content DBs preserve | stays-shrunk | shrunk in place |
| 18e | agent-as-user dogfood | stays-shrunk | shrunk in place |
| 19 | issue closure requires release verify | compose-into-skill | → `complete` § Composed disciplines (close-shipped references the rule + mechanizes post-release labeling); rule → pointer (AUDIT-06: corrected from "complete/close-shipped") |
| 19b | marketplace-clone script contract | stays-shrunk | shrunk to ~2 lines in place |
| 20 | closure is structural | compose (DONE) | → pointer (hygiene-family SKILLs own it) |

**Verification:**
- Size: 157 lines (`wc -l`), in the 150–200 target band.
- Tests green: core 535, studio 589, cli 211 (all pre-existing suites pass; the 2 tool-level tasks added new tests).
- Open-findings gate: zero open findings.
- All 3 deletes (entries 2, 15, 18a) confirmed absent from the file.
- Entry 12 confirmed byte-untouched.

**Spun-off scope:** [#387](https://github.com/audiocontrol-org/deskwork/issues/387) — retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` skills in favor of audit-barrage (multi-skill architectural change; out of this feature's scope by operator decision).

**Two TDD tool-level tasks (test-first):**
- 2b.1 `--no-tailscale` no-op alias: `packages/studio/test/cli-args.test.ts` (4 new tests) → `packages/studio/src/server.ts`.
- 2b.2 namespace write-guard: `packages/core/test/frontmatter.test.ts` (5 new tests) → `packages/core/src/frontmatter.ts`.

## 2026-06-02 — audit-barrage lift (20260602T145833028Z-decompose-agent-discipline)

### AUDIT-20260602-01 — `--no-tailscale` deprecation silently ignores loopback-only intent on a no-auth server

Finding-ID: AUDIT-20260602-01
Status:     fixed-a8c98c6d327967c96c0f741d46c408e960eae2fd
Severity:   medium
Surface:    packages/studio/src/server.ts:128-152

The change turns `--no-tailscale` from "force loopback-only" into a pure no-op (`packages/studio/src/server.ts:128-132`), with `noTailscale` now driven solely by `DESKWORK_STUDIO_NO_TAILSCALE`. The motivating failure mode was real (operators stranded off-keyboard). But the **reverse** user class is now silently broken: an adopter who scripted `deskwork-studio --no-tailscale` specifically to keep the no-auth studio off the tailnet now gets Tailscale auto-detection and tailnet exposure, with only a stderr line as notice. Because the studio has no auth and Tailscale is treated as a trusted-network bind, this is a security-relevant behavior inversion, not just a cosmetic flag rename.

The project's own "flag stability… keep the old flag as a no-op so existing hooks don't fail" rule is about *exit-code* stability (the hook doesn't error). Here the exit code is preserved but the *security posture* the flag was protecting is reversed. A reasonable mitigation: when `--no-tailscale` is seen AND no env var is set, either (a) honor the legacy intent (loopback-only) with a deprecation warning rather than ignoring it, or (b) make the stderr notice loud and explicitly call out "you are now exposed on the tailnet — set DESKWORK_STUDIO_NO_TAILSCALE=1 to restore loopback-only." The current notice describes the env var but does not warn that the old behavior's *protection* is gone.

### AUDIT-20260602-02 — `DESKWORK_RESERVED_TOPLEVEL_KEYS` is a maintenance trap — guard scope contradicts the rule it cites

Finding-ID: AUDIT-20260602-02
Status:     fixed-d47fdb8222efd7861db8b8607c62d40d4a355b5c
Severity:   medium
Surface:    packages/core/src/frontmatter.ts:74 + packages/core/test/frontmatter.test.ts:343-347

The guard's reserved set is `new Set(['id'])` (`frontmatter.ts:74`), but the doc-comment immediately above and the agent-discipline rule it cites (entry 17) both name *five* renderer-owned keys: `id, state, date, tags, slug`. Meanwhile the test "does not flag unrelated top-level keys" deliberately writes `{ title, slug, tags }` and asserts it does **not** throw (`frontmatter.test.ts:343-347`). So there is a hard, unstated invariant: `slug`/`tags`/`date`/`state` must NEVER be added to the reserved set, because these write helpers are the single path through which the renderer/operator legitimately writes those very keys at top level.

The danger is that the code documents the *opposite* — it cites a rule listing all five as "owned by the host renderer." A future maintainer reading "host renderer owns id, state, date, tags, slug" and seeing only `id` guarded will reasonably "complete" the set by adding the other four — which would break every legitimate frontmatter write (and the existing passing test). The fix is a one-line guardrail comment at the `DESKWORK_RESERVED_TOPLEVEL_KEYS` declaration: explain that this set may contain ONLY keys that are exclusively deskwork-owned-yet-collide (currently just `id`), and that the renderer-owned keys (`slug`, `tags`, etc.) must stay OUT precisely because these helpers also serve operator-owned writes.

### AUDIT-20260602-03 — `stringifyFrontmatter` now throws unconditionally — legacy read→write round-trip is an untested cross-cutting path

Finding-ID: AUDIT-20260602-03
Status:     fixed-d47fdb8222efd7861db8b8607c62d40d4a355b5c
Severity:   medium
Surface:    packages/core/src/frontmatter.ts:138 (stringifyFrontmatter), packages/core/src/frontmatter.ts:158 (updateFrontmatter)

`stringifyFrontmatter` now calls `assertNamespacedDeskworkKeys(data)` on every invocation (`frontmatter.ts:138`). Legacy on-disk sidecars still carry a top-level `id:` (that's the whole reason the `legacy-top-level-id-migration` doctor rule exists). Any code path that does parse-legacy → mutate → `stringifyFrontmatter(data, body)` — preserving the still-present top-level `id` in `data` — will now throw where it previously round-tripped. The migration rule itself is the most likely caller (it must rewrite legacy files), and it is **not in this diff**, so I cannot confirm it constructs a clean namespaced `data` before re-stringifying rather than passing through the parsed legacy object.

The new tests (`frontmatter.test.ts:308-348`) cover the happy/guard paths for fresh writes but not the legacy round-trip: there is no test that parses a `---\nid: x\n---` document and then writes it back. Recommend adding a regression test for the legacy-file path and confirming `legacy-top-level-id-migration` (and any studio/ingest code that round-trips frontmatter) builds the namespaced shape before calling `stringifyFrontmatter`. If a real legacy round-trip path exists that doesn't, this is a latent crash on upgrade, not a fresh-install case.

### AUDIT-20260602-04 — Env-var truthiness parsing is case/format-narrow with no feedback on unrecognized values

Finding-ID: AUDIT-20260602-04
Status:     fixed-a8c98c6d327967c96c0f741d46c408e960eae2fd
Severity:   low
Surface:    packages/studio/src/server.ts:153-154

`const noTailscale = noTailscaleEnv === '1' || noTailscaleEnv === 'true';` accepts only the exact strings `'1'` and `'true'`. `DESKWORK_STUDIO_NO_TAILSCALE=TRUE`, `=True`, `=yes`, `=on`, or a value with trailing whitespace silently does nothing — the studio binds to the tailnet while the operator believes they disabled it. The docs consistently say `=1`, so the golden path is fine, but given finding-01 made this env var the *only* way to restore loopback-only on a no-auth server, a value the user fat-fingered as `TRUE` failing silently is a sharp edge. Consider normalizing (`?.toLowerCase().trim()`) and/or emitting a one-line stderr note when the var is set to a non-empty value that isn't recognized as truthy.

### AUDIT-20260602-05 — Composed-discipline pointers under-name their second home; verify no stray `--no-tailscale` references remain

Finding-ID: AUDIT-20260602-05
Status:     fixed-600a7e499c97081a5503d24877383d853f1ab43a
Severity:   low
Surface:    .claude/rules/agent-discipline.md (entry 10 pointer) + repo-wide `--no-tailscale` references

Two hygiene notes. (1) The shrunk entry-10 pointer reads "Composed into the deskwork:iterate + deskwork:approve skills — see `plugins/deskwork/skills/approve/SKILL.md`" but the discipline was composed into **both** iterate and approve; the `see` link names only approve. Same shape for a couple of other pointers that name one of two homes. Harmless today, but the pointer is the only navigation aid once the prose is gone, so naming both files (or the directory) keeps it findable. (2) The diff updates `--no-tailscale` in server.ts, tailscale.ts, deskwork-studio/README, studio/SKILL.md, and smoke-marketplace.sh — but I can only see those five from the diff. Worth a repo-wide grep for `--no-tailscale` (RELEASING.md, other smoke scripts, troubleshooting docs, the marketplace-clone scripts wired into adopter SessionStart hooks) to confirm none still document it as a working loopback-only flag, since that documentation would now be actively wrong.

## 2026-06-02 — audit-barrage lift (20260602T150819343Z-decompose-agent-discipline)

### AUDIT-20260602-06 — Pointer narrowing contradicts the audit-log's own composition record (close-shipped dropped)

Finding-ID: AUDIT-20260602-06
Status:     acknowledged-slush-pile-2026-06-02
Severity:   medium
Surface:    .claude/rules/agent-discipline.md (packaging-is-UX pointer + issue-closure pointer) vs. docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/audit-log.md rows 13 & 19

Two pointer edits in this diff REMOVE `close-shipped` as a named composition home:

- packaging-is-UX: `Composed into the complete / close-shipped skills` → `Composed into the complete skill`
- issue-closure: `Composed into the complete / close-shipped skills` → `Composed into the complete skill`

But the audit-log's own recent-excerpt disposition record (quoted in the prompt context) says the opposite for both: row 13 *"packaging is UX … → `complete`/`close-shipped` § Composed disciplines"* and row 19 *"issue closure requires release verify … → `complete`/`close-shipped` § Composed disciplines"*. So the durable disposition record claims both disciplines were composed into BOTH `complete` AND `close-shipped`, while this diff narrows the rule pointer to name only `complete`.

This is exactly the cross-document drift the feature is built to prevent, and it directly contradicts AUDIT-20260602-05's resolution ("naming both files keeps it findable"). One of the two records is wrong: either `close-shipped/SKILL.md` genuinely carries a `§ Composed disciplines` entry for these rules (in which case the narrowed pointer makes that composition un-findable from the rule — a navigation-aid regression) or it never did (in which case audit-log rows 13/19 + the original prose were the over-claim, and those rows should be corrected too). Note the `see` link in both pointers only ever pointed at `complete/SKILL.md`, so the prose and the link were already inconsistent before this edit. The fix is to read `plugins/dw-lifecycle/skills/close-shipped/SKILL.md`, confirm whether it composes either discipline, and make the pointer, the `see` link, and audit-log rows 13/19 all agree.

### AUDIT-20260602-07 — AUDIT-03 regression test exercises `updateFrontmatter`, not the migration round-trip it claims to lock

Finding-ID: AUDIT-20260602-07
Status:     acknowledged-slush-pile-2026-06-02
Severity:   low
Surface:    packages/core/test/frontmatter.test.ts:348-367 (new "migration path" test)

The new test added for AUDIT-20260602-03 is named *"updateFrontmatter round-trips a legacy top-level id without throwing (migration path)"* and its comment describes the real migration as *"the rule writes `{deskwork:{id}}` (patch) then `removeFrontmatterPaths(['id'])`"*. But the test body only exercises the FIRST step: it calls `updateFrontmatter(legacy, { deskwork: { id } })` and asserts the legacy top-level `id:` is still present afterward. It never calls `removeFrontmatterPaths`, never invokes the `legacy-top-level-id-migration` doctor rule, and never round-trips legacy data through `stringifyFrontmatter` — which is the exact function AUDIT-03 flagged as the unconditional-throw site (`frontmatter.ts:138`) and the exact "latent crash on upgrade" surface it named.

So the at-risk path (parse legacy → patch → remove top-level `id` → re-stringify) remains untested end-to-end; the test green-lights a sibling code path (`updateFrontmatter`'s AST patch) instead. This is the project's own documented "TDD spec tests have systematic blind spots" failure mode — a passing test underwriting a claim it doesn't actually verify. A faithful regression test would either drive the migration rule directly or do `removeFrontmatterPaths(updateFrontmatter(legacy, {deskwork:{id}}), ['id'])` and assert the result both (a) doesn't throw and (b) has no top-level `id`. As written, if `removeFrontmatterPaths` or the migration rule routes residual top-level keys through `stringifyFrontmatter`, this test would still pass while production crashes on upgrade.

### AUDIT-20260602-08 — Mechanized TDD task-shape produces unsatisfiable acceptance criteria for non-code (comment/docs) fixes

Finding-ID: AUDIT-20260602-08
Status:     acknowledged-slush-pile-2026-06-02 → tracked at [#392](https://github.com/audiocontrol-org/deskwork/issues/392)
Severity:   low
Surface:    docs/1.0/001-IN-PROGRESS/decompose-agent-discipline/workplan.md Tasks 7 & 10 (fix-finding-AUDIT-02 / -05)

**Disposition:** dw-lifecycle tooling gap (promote-findings / check-fix-task-tdd), not a bug in this feature's code. Filed as [#392](https://github.com/audiocontrol-org/deskwork/issues/392). For this feature, Tasks 7 (AUDIT-02, comment-only) and 10 (AUDIT-05, docs) are verified-by-inspection — their fixes are genuinely non-code, so their phantom vitest acceptance criteria are not applicable.

The promote-findings mechanism stamped a uniform TDD-first shape onto every fix-task — Step 1 *"write failing test exercising the bug"* and acceptance criteria *"`npx vitest run <test-file-path>` exits 0"*. That shape is unsatisfiable for the two findings whose fixes are non-code:

- **Task 7 (AUDIT-02)** — the landed fix (commit d47fdb82) is a comment-only change: the maintenance-guardrail block added to `frontmatter.ts:74` above `DESKWORK_RESERVED_TOPLEVEL_KEYS`. The only new test in this diff is the AUDIT-03 round-trip test; there is no test for AUDIT-02, because "a clarifying comment exists" has no vitest contract. Task 7's `[ ] Failing test exists` and `[ ] npx vitest run exits 0` criteria can never legitimately be checked.
- **Task 10 (AUDIT-05)** — a pointer-naming + repo-wide-grep documentation finding. Same unsatisfiable test criteria.

Both tasks already show `[x] Audit-log Status flipped to fixed-<sha>` while their test criteria sit `[ ]` unchecked — a permanently-incompletable task that will either trip the `check-fix-task-tdd` commit gate or force the operator to close on partial criteria. The underlying gap: the TDD-first task generator assumes every audit finding's fix is code with a testable contract; comment/docs/pointer fixes need an alternate verification shape (e.g. a doc-assertion or a "verified-by-inspection" disposition) rather than a phantom vitest path. Worth surfacing because the next audit cycle will keep minting unsatisfiable rows for every non-code finding.
