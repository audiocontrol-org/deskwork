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
Status:     fixed-517159b (write sites; read-side residual → AUDIT-20260529-04 / #357)
Severity:   medium
Surface:    packages/core/src/calendar/regenerate.ts:45, packages/core/src/doctor/repair.ts:123

RESOLUTION (2026-05-29): operator chose option (b). regenerateCalendar +
repair now resolve `resolveCalendarPath(projectRoot, readConfig(projectRoot))`
(default site) — commit 517159b. Regression: `calendar-path-honored.test.ts`.
Reviewed (Tracks 2+3, return-grammar validated): spec delivered; regression
faithful; no `any`/`as`. The read-side validator was deliberately left on the
hardcoded path (conflating it with the legacy per-site calendar broke the
calendar-uuid-missing scenario) — split out as AUDIT-20260529-04 / #357.
Open until verified in a formally-installed release.

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

---

Finding-ID: AUDIT-20260529-04
Status:     acknowledged-#357
Severity:   medium
Surface:    packages/core/src/doctor/validate.ts:86 (validateCalendarSidecar)

Surfaced by the /dw-lifecycle:review pass on #232 (commit 517159b). After the
#232 write-side fix, `doctor --check`'s entry-centric calendar-sidecar
validator still reads the hardcoded `.deskwork/calendar.md` → for a custom
calendarPath it reads the wrong (often absent) file and returns FALSE-CLEAN,
while `--fix` correctly writes the configured path. Not fixable in-scope:
making validate read the per-site path conflates the entry-centric calendar
with the legacy per-site calendar (proved by the doctor.test
calendar-uuid-missing scenario: rows without sidecars), which is the #234
surface question. Filed as [#357](https://github.com/audiocontrol-org/deskwork/issues/357);
NOTE in validate.ts references it. Resolve alongside #234.

---

Finding-ID: AUDIT-20260529-05
Status:     acknowledged-#358
Severity:   low
Surface:    packages/core/src/sidecar/write.ts:14

Surfaced by the /dw-lifecycle:review pass on #232. `writeSidecar` validates via
`EntrySchema.safeParse` but serializes the raw input `entry`, not the
Zod-stripped `result.data` — so unknown/retired fields persist if a caller
bypasses the type. Latent (normal typed callers pass clean objects; reviewState
retirement is enforced read-side). Reviewer rated High; downgraded to low here:
the trigger is a type-bypass which the project bans (no `as`). Hardening (write
`result.data`) is worthwhile but is a hot-path change needing its own test +
blast-radius check — out of #232 scope. Filed as
[#358](https://github.com/audiocontrol-org/deskwork/issues/358).

---

Finding-ID: AUDIT-20260529-06
Status:     fixed-45af283
Severity:   low
Surface:    packages/core/test/{entry/approve,iterate/iterate,schema/entry,sidecar/write}.test.ts

`tsc --noEmit` on @deskwork/core failed on 7 pre-existing type errors
(retired-`reviewState` test assertions reading a removed field + unused
imports), surfaced while typechecking the #232 work. Fixed: retirement tests
rewritten to plant a legacy reviewState on disk and assert absence in the RAW
on-disk JSON (genuinely verifying approve/iterate strip it); legacy-input
fixture de-annotated; unused imports removed. No coverage lost; no `any`/`as`.
core typecheck now clean (0 errors). Commit 45af283.

---

## 2026-05-29 — Phase 38 sub-phase 38c (started: ingest/skill self-contained wins)

38c is "core doctor-rule family + ingest/approve mediums" — larger + more
entangled than 38b. This pass took the self-contained, non-decision-gated wins
and held the entangled clusters (see below).

**Track 1:** `core` ingest suite 68/68 (incl. 6 title-derivation cases); core
typecheck clean.

Finding-ID: AUDIT-20260529-07
Status:     fixed-953565c (+ hardened ece678a)
Severity:   low
Surface:    packages/core/src/ingest-derive.ts (deriveTitle)

#64: ingest derived title from the slug even when the body had a heading.
deriveTitle now falls back to the first ATX heading (precedence: frontmatter
title > body heading > slug-humanize). Reviewed (Tracks 2+3, return-grammar
validated): no blocking/high. Two MEDIUM review findings on the new
`firstMarkdownHeading` were FIXED immediately in ece678a (not deferred):
(1) it matched the trimmed line so a 4-space-indented `# x` (CommonMark
indented code) was mis-read as a heading → now matches the untrimmed line
with a 0–3 space allowance; (2) Setext headings were silently unhandled →
documented as a deliberate ATX-only choice. 3 edge-case tests added
(fenced-skip, indented-code-skip, Setext-fallback). Open pending
release-verification.

Finding-ID: AUDIT-20260529-08
Status:     informational
Severity:   informational
Surface:    n/a (38c triage)

38c remaining work, classified (NOT yet done):
- **Doctor-model cluster (#219, #65, #218; #300 SKIP—graphical-entries):**
  #219 (missing-frontmatter-id false-positives) lives in the LEGACY
  rule-based doctor (`doctor/rules/`, CalendarEntry + content-index byId),
  which is mid-migration vs the Phase-30 entry-centric validator
  (`doctor/validate.ts`); the issue's own option 3 is "retire the rule." Needs
  a focused doctor-model decision, not a band-aid. #218 (missing
  legacy-calendar-to-sidecars rule) is the migration-rule gap. #65 rides on
  #219's rule.
- **Calendar-surface cluster (#223, #234):** blocked on the #357 entry-centric-
  vs-per-site decision (#232 already unified the path; these are format/read
  consistency). Do NOT piecemeal — repeats the #232 over-reach.
- **Design-call:** #62 (ingest no-frontmatter default-to-Ideas is wrong for
  legacy active docs) — the right default is an operator UX decision.
- **#59** (remove a mistakenly-added entry) — needs a new subcommand; narrow
  "preserve-rule exception" (added-by-mistake only) per agent-discipline.
- **#267** (CLI to enumerate pending annotations) — clean, self-contained
  medium; next actionable.
- **Already landed:** #226 (afc81e9), #58 (411d762, prose). #215 issues 1/3/4
  landed previously; issue 2 was #232 (now done) — likely closeable-pending-
  verification.

## 2026-05-29 — Phase 38 sub-phase 38c (#219 doctor-model decision implemented + reviewed)

Decisions taken this session (operator, via AskUserQuestion): doctor-model →
retire `missing-frontmatter-id` (#219 opt 3); #65 moot; calendar-surface
(#223/#234/#357) + #218 deferred to graphical-entries #301; #62 → refuse on
no-`state` + write namespaced `deskwork:{id}` on `--apply`. Recorded two-track
(workplan + per-issue comments).

Finding-ID: AUDIT-20260529-09
Status:     informational
Severity:   informational
Surface:    packages/core/src/doctor (commit 4b24a9e)

Track-2 (spec-compliance) review of the #219 retirement (4b24a9e): PASS on all
six checks — rule deleted + removed from RULES (not disabled); regression
(`missing-frontmatter-id-retired.test.ts`) encodes the decision against a real
tmp fixture (Ideas + youtube + tool, zero findings); runner-plumbing coverage
(#44 skipReason / JSON / grouped output / exit-code matrix) re-anchored to
surviving rules with equivalent assertions; scope clean (no surviving-rule
logic changed; `--fix=calendar-uuid-missing` #357 test untouched); reworded
references accurate (confirmed `ingest --apply` actually binds `deskwork.id`,
so content-tree.ts remedy text is true); no over-delivery. No remediation.

Finding-ID: AUDIT-20260529-10
Status:     fixed-7a916ae
Severity:   medium
Surface:    packages/core/src/doctor/runner.ts:300 (reportOnlySkipReason)

Track-3 (code-quality) review of 4b24a9e: the `reportOnlySkipReason` return-type
union still listed `'prerequisite-missing'` and `'no-action-needed'`, both
unreachable after the retirement (the deletion removed the only case returning
`prerequisite-missing`; `no-action-needed` was never returned by this helper).
A type-lie that would mislead a future maintainer about which dispositions
bundled report-only rules can produce. Verified correct by reading the function
(only `editorial-decision`/`schema-rejected` reachable). Fixed in 7a916ae by
narrowing the return type to the two values actually returned; the full
SkipReason union stays in types.ts for plan-supplied reasons. Verified: core
538/538, cli 210 (+29 pre-existing skips), core+cli tsc clean. Stays in
`fixed-` until release-verification.

Track-1 (controller independent gate): re-ran `npm --workspace @deskwork/core
test` (538/538), `npm --workspace @deskwork/cli test` (210 + 29 pre-existing
skips), and `tsc --noEmit` on both (clean) in the controller's own environment
— not the implementer's reported output. Clone-check skipped (detector ran this
session via pre-commit gate + refresh-clones-baseline; net -4 groups, all
pending, no curated dispositions lost).

## 2026-05-29 — Phase 38 sub-phase 38c (#267 `deskwork annotations` verb implemented + reviewed)

Finding-ID: AUDIT-20260529-11
Status:     informational
Severity:   informational
Surface:    packages/cli/src/commands/annotations.ts (commit 90e5d82)

Track-2 (spec-compliance) review of #267: PASS, no findings. The new
`deskwork annotations <project-root> <slug-or-uuid> [--all] [--json]` verb
matches the operator-approved design exactly — default lists only pending,
`--all` adds dispositioned, `--json` is `{entryId, annotations:[...]}` with
pending rendered as the literal `"pending"`, exit 0/2/non-zero map correctly
(not-found is a descriptive error, never silent-empty). Thin verb over the
existing `listEntryAnnotations` reader — no reimplementation. Scope clean.

Finding-ID: AUDIT-20260529-12
Status:     fixed-e515fa4
Severity:   high
Surface:    packages/cli/test/annotations.test.ts

Track-3 (code-quality) review of 90e5d82: production code verified CORRECT
(the disposition fold delegates the structural fold to listEntryAnnotations and
layers the address-disposition fold — latest-createdAt-wins, mirroring the
studio's latestAddressByCommentId; `resolve`/`address` not conflated;
archived/deleted handled). Two TEST-COVERAGE gaps, both legitimate (the code is
right but its correctness wasn't pinned — a reversed/absent disposition sort OR
a dropped unknown-flag guard would have passed every existing test):
  (HIGH) no test pinned the multiple-address / latest-wins invariant — the whole
  correctness guarantee for disposition;
  (MEDIUM) no test for unknown-flag → exit 2 (the BOOLEAN_FLAGS contract).
Both fixed in e515fa4 (two regression tests; annotations.test.ts 10→12). The
`seedAddress` filename-overwrite concern the reviewer flagged is mitigated —
writeEvent prefixes the filename with the event timestamp, so distinct
`atMsAgo` values yield distinct files. Stays `fixed-` until release-verification.

Track-1 (controller independent gate): re-ran cli typecheck (clean),
annotations.test.ts (12/12), full cli suite (220 passed + 29 pre-existing
skips), and a live smoke against this project's `.deskwork` (empty entry → "no
pending annotations" exit 0; populated entry 2dbe2326 via `--all` → 8
annotations with per-comment `[disposition] id {category} (version, range)`;
`--json` empty shape; unknown uuid → `sidecar not found` non-zero). Clone-check:
pre-commit gate ran on each commit, 0 NEW (additive new files).
