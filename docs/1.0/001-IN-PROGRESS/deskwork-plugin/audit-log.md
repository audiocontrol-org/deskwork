# deskwork-plugin — audit log

Durable record of `/dw-lifecycle:review` findings for the deskwork-plugin feature.

**Operator contract:**

- Findings are actionable work, not bookkeeping.
- This audit log is the source of truth for current finding state — not commit messages, not GitHub alone.
- Findings are never deleted. Update entries in place by changing `Status:` and appending resolution / verification notes under the same stable `Finding-ID`.
- `fixed-<sha>` is NOT `verified-<date>`. A fix is verified only after the surface is actually re-exercised.

**Canonical grep queue:**

```bash
# unfinished work
grep -nE "^Status:[[:space:]]+(open|acknowledged|fixed-)" docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md
# new findings
grep -nE "^Status:[[:space:]]+open" docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md
# awaiting verification
grep -nE "^Status:[[:space:]]+fixed-" docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md
```

---

## 2026-05-29 — Phase 38 sub-phase 38·1 (clone-gate hygiene, #354), commit 37683c8

**Track 1 (independent verification, re-run by the controller):**
- `clone-detector.gitignore.test.ts` → 4/4 pass.
- All three committed `.jscpd.json` paths (root symlink, scope-discovery real file, adopter template seed) report `gitignore === true` via `node -e JSON.parse`.
- 16/16 sibling harness-dependent clone tests pass (no harness regression).
- `tsc --noEmit -p plugins/dw-lifecycle/tsconfig.json` → exit 0, 0 errors.
- Pre-commit clone gate at commit time: 174 groups detected, 0 NEW.

**Clone detector (Step 3):** the `check-clones --gate-mode` pass ran in the pre-commit hook at commit 37683c8 — 0 NEW clone groups. Not re-run here (documented `--no-clone-check` exception: detector already produced its report in-session at commit time).

**Tracks 2+3 (dispatched `feature-dev:code-reviewer`, return-grammar validated):** no blocking or high findings. The reviewer confirmed spec compliance (#354 deliverable met; both test guards faithful), harness backward-compatibility (default-arg path is a no-op on the base config), correct REPO_ROOT resolution, and zero project-rule violations (`as`/`any`/`@ts-ignore`/file-size all clean).

---

Finding-ID: AUDIT-20260529-01
Status:     informational
Severity:   informational
Surface:    .dw-lifecycle/scope-discovery/.jscpd.json (+ template seed)

jscpd's `gitignore: true` option reads ONLY `process.cwd()/.gitignore`
(verified in `node_modules/jscpd/dist/chunk-YESFMRRG.js:86-89`). It does
NOT read `.git/info/exclude`, the user's global `core.excludesFile`, or
nested `.gitignore` files in subdirectories.

Expected vs actual: the fix prevents the #354 recurrence for any sandbox
listed in the repo-root `.gitignore`. The real reproducer `/.audiocontrol.org/`
IS in `.gitignore:97`, so the lived incident is covered. A *future* sandbox
excluded only via `.git/info/exclude` or a global excludesfile would NOT be
skipped by this flag — an operator could be misled by "we already set
gitignore:true."

Remediation: none required. The limitation is jscpd's, not deskwork's; the
practical risk is low (the documented adopter pattern is a committed
`.gitignore` entry). The caveat is recorded in the test file header
(`clone-detector.gitignore.test.ts`) and the workplan 38·1 entry. If a
recurrence ever happens via a non-`.gitignore` mechanism, the disposition is
to add the path to the committed `.gitignore` (not to change jscpd config).

---

## 2026-05-29 — Phase 38 sub-phase 38b (core quick fixes), commits d6d3032 (+ already-landed 4009be1, 935ba39)

**Sub-phase outcome:** of the four 38b issues, only #256 needed new code this
session; #221 and #198 were already fixed on-branch in prior commits and are
open only pending release-verification; #232 is an architecture fork escalated
to the operator (see AUDIT-20260529-03).

**Track 1 (independent verification, controller re-run):**
- #256: `packages/cli/test/version.test.ts` 3/3 pass (built `dist/cli.js`); `node dist/cli.js --version` prints `@deskwork/cli 0.26.5` + `@deskwork/core 0.26.5`, exit 0; `npm --workspace @deskwork/cli run typecheck` clean.
- #221: `packages/core/test/ingest.test.ts` dot-slug cases 4/4 pass (`v0.16.0` → `v0-16-0`; explicit `--slug` NOT sanitized).
- #198: `packages/cli/test/iterate-entry-centric-dispositions.test.ts` 12/12 pass (longform + outline dispositions mint address annotations).

**Tracks 2+3 (#256 — dispatched `feature-dev:code-reviewer`, return-grammar validated):** no blocking/high findings; change is sound. Confirmed: version intercept fires before the subcommand parser + `injectProjectRoot` (no shadowing — `version` is not a SUBCOMMANDS key); `import.meta.url`-relative `../package.json` correct from both `dist/` and `src/`; core resolved via its `./package.json` export; no `any`/`as`/`@ts-ignore`; `readPackageVersion` throws on bad input (no fallback). #221/#198 were reviewed when they originally landed; not re-reviewed here.

---

Finding-ID: AUDIT-20260529-02
Status:     fixed-d6d3032
Severity:   low
Surface:    packages/cli/src/cli.ts (CLI dispatcher)

#256: `deskwork --version` / `-v` / `version` returned "unknown subcommand"
(exit 2). Fixed by intercepting all three forms before the subcommand parser
and printing `@deskwork/cli` + `@deskwork/core` versions, exit 0. Reviewer
pass found the change sound. NOT verified-in-release — stays open until the
fix ships and is walked against the installed artifact (project closure rule).

The issue's "ideally also @deskwork/studio" is intentionally NOT done: studio
is not a dependency of @deskwork/cli, so it is not reachable through the CLI's
dispatch. The issue's "same change to deskwork-studio and dw-lifecycle bin
shims for consistency" is out of this commit's scope (filed symptom was the
@deskwork/cli dispatcher); a separate parity pass would cover the sibling
binaries.

---

Finding-ID: AUDIT-20260529-03
Status:     open
Severity:   medium
Surface:    packages/core/src/calendar/regenerate.ts:45, packages/core/src/doctor/repair.ts:123

#232: `regenerateCalendar(projectRoot)` and `doctor/repair` write the
hardcoded `.deskwork/calendar.md`, ignoring per-site `siteConfig(config,
site).calendarPath`. Confirmed divergence: `ingest` reads/writes the per-site
`resolveCalendarPath(projectRoot, config, site)` (`ingest.ts:114,211`), as do
`rename-slug`, `review/workflow-paths`, and `doctor/runner` — but the
entry-centric pipeline (approve/publish/block/cancel/induct via
`regenerateCalendar`) writes the hardcoded path. For an adopter whose config
sets a custom `calendarPath`, ingest writes one file and approve writes
another; they diverge (this is also #234's approve-side).

This is an ARCHITECTURE FORK, not a quick fix — the issue itself escalates it
("Two questions for the operator", "needs design clarification before code
lands"). It was misclassified into 38b. Two coherent resolutions:

- (a) `.deskwork/calendar.md` is the canonical post-Phase-30 entry-centric
  surface; per-site `calendarPath` becomes legacy. Requires pointing the
  remaining readers at `.deskwork/calendar.md` AND deprecating/repurposing the
  `calendarPath` config key (currently a REQUIRED key, config.ts:93) — an
  adopter-facing change.
- (b) Honor per-site `calendarPath`: thread `config` + `site` into
  `regenerateCalendar` (5 entry-helper callers) + `repair.ts`, writing to
  `resolveCalendarPath(...)`. Non-destructive; matches what ingest already
  does; resolves #234's approve-side.

Controller recommendation: (b) — non-destructive, deprecates nothing, makes the
pipeline consistent with ingest, and honors the contract implied by
`calendarPath` being a REQUIRED config key. NOT implemented unilaterally:
deprecating-vs-keeping a required adopter config surface is an operator
decision (Operator-owns-scope rule). Awaiting operator pick before code lands.
