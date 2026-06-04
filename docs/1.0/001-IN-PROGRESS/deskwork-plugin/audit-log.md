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

## 2026-06-02 — audit-barrage lift (20260602T221554321Z-deskwork-plugin)

### AUDIT-20260602-01 — Audit-barrage rendered an empty diff — the range `origin/main...HEAD` is empty because the work is uncommitted

Finding-ID: AUDIT-20260602-01
Status:     acknowledged-#399
Severity:   high
Surface:    audit-barrage harness (diff-range selection) + repo state (HEAD `0317191d` == `origin/main`)

The "## Diff under audit" section of this prompt is **empty** — no code was substituted in. I verified why: branch `feature/deskwork-plugin` HEAD is `0317191d`, *identical* to `origin/main` (v0.34.0). The Phase 39 work exists only as **staged, uncommitted** files (`git diff --cached` shows spec +109, workplan +24). The barrage computed its range as `origin/main...HEAD`, which is empty when HEAD == main, so it rendered no diff — and the "Commit subjects in the audited range" list is just all of main's history, another symptom of the same wrong range computation.

This matters because any sibling CLI model that emits code-level "findings" against this prompt is **fabricating** — there is no code to anchor to. The operator is paying N models to audit nothing. A reasonable fix: the harness should diff the *working tree + index* (`git diff origin/main` without `...`, or `git diff --cached` + unstaged) when HEAD has no novel commits, and **refuse to fire** (or warn loudly) when the resolved diff is empty rather than rendering a blank section that invites confabulation.

---

### AUDIT-20260602-02 — Phase 39 artifacts are uncommitted; Task 39.0 is marked `[x]` DONE but overstates the committed state

Finding-ID: AUDIT-20260602-02
Status:     fixed-2026-06-02 (resolved by committing the staged 39.0 work; the `[x]` is correct once this commit lands. Secondary claim re backup is incorrect — `backup/pre-phase39-resync-928224ce` DOES carry the spec via `2abfffa1`, so the design was always recoverable.)
Severity:   medium
Surface:    docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md (Task 39.0, the `[x]` line)

Task 39.0's body claims: *"Dropped all 9 branch commits … and re-applied only the spec file + this Phase 39 section onto main. Verified net diff vs `origin/main` = exactly `{spec (+109), workplan Phase 39 (+24)}`."* But `git diff origin/main...HEAD` is **empty** — the branch's committed history carries nothing beyond main. That "net diff" is only true for the **working tree / index**, not committed history. The spec and the Phase 39 workplan section exist **solely as staged uncommitted changes**.

The reversibility note compounds the risk: the backup branch `backup/pre-phase39-resync-928224ce` preserves the *pre-reset* state (the old `928224ce` docs commits), which do **not** contain this new spec. So the only copy of the Phase 39 design + workplan is the uncommitted index — a `git reset`, `git checkout`, or stash mishap loses it with no commit and no backup-branch fallback. A force-push now (the task says force-push is "deferred to operator") would push nothing new. Either commit the docs before declaring 39.0 done, or reword the `[x]` to state the artifacts are staged-pending-commit. Marking it DONE while the work lives only in the index is exactly the overstatement the project's verification-before-completion discipline guards against.

---

### AUDIT-20260602-03 — Migration backfill reuses the `artifactPathForStage` heuristic — the very root cause of #394 — to stamp *authoritative* paths

Finding-ID: AUDIT-20260602-03
Status:     fixed-2026-06-02 (collision-detection folded into spec §Migration step 2 + workplan 39b acceptance: ambiguous resolution refuses-and-reports, no silent stamp)
Severity:   high
Surface:    spec §"Migration" step 2 + workplan Task 39b ("backfill each entry's `artifactPath` from the current resolved location (LAST use of the `artifactPathForStage` heuristic)")

The spec correctly diagnoses the disease: *"location used as an identifying/resolution key"* causes the #394 multi-site false-positives because the doctor guesses which site's `contentDir` an entry lives in by searching all of them. But the migration's step 2 backfills `artifactPath` by running **that same slug+stage heuristic** (`artifactPathForStage`) to derive "the current resolved location," then stamps the result as **authoritative and required forever**.

For the exact scenario the feature exists to fix — a slug that collides across two sites on different filesystems (`AUDIT-20260602-03`: *"slug-collision-across-sites resolves to the wrong file"*) — the backfiller will resolve to the *wrong* file and bake that wrong path in permanently as the new source of truth. The migration would launder a known-ambiguous guess into trusted data, making the bug *harder* to detect afterward (no more "search" to flag the ambiguity; just a confidently-wrong stored path). Task 39b's TDD note says "multi-site + multi-filesystem fixture; idempotent re-run" but does not call for a **collision-detection / refuse-and-require-disambiguation** path. The migration must detect when the heuristic resolves ambiguously (multiple candidate files, or a slug present under >1 site) and **stop / prompt** rather than silently stamp one — otherwise the cutover writes the #394 bug into permanent state. This belongs in the spec's Migration section and in 39b's acceptance criteria explicitly.

---

### AUDIT-20260602-04 — `scaffoldDefaults: Record<artifactKind, string>` forces *every* artifactKind present — contradicts "optional convenience default per kind"

Finding-ID: AUDIT-20260602-04
Status:     fixed-2026-06-02 (spec + workplan 39a corrected to `Partial<Record<artifactKind, string>>`; partial-map accept case added to 39a AC)
Severity:   medium
Surface:    spec §"The Model → Lane" (`scaffoldDefaults?: Record<artifactKind, string>`) + workplan Task 39a

The spec types the field as `Record<artifactKind, string>`. In TypeScript, `Record<K, V>` over a union key type `K` requires **all** members of the union to be present — so a lane that only defines a default for `post` but not `plan`/`workspan`/etc. would be a type error, and the corresponding Zod schema (`z.object({ post: ..., plan: ..., workplan: ... })`) would reject partial maps. That directly contradicts the prose two lines down: *"scaffoldDefaults is the only location info a lane carries … a convenience default"* and the example where a lane maps only some kinds. As written, 39a would implement a schema that forces every adopter to specify a directory for every artifact kind their pipeline never uses.

The intended shape is partial: `scaffoldDefaults?: Partial<Record<artifactKind, string>>` (and a Zod `z.record(artifactKindSchema, z.string())` or `.partial()`'d object). This is a small but load-bearing correction — 39a's "lane-schema tests for the new optional fields + `.strict()` rejection" should pin that a lane defining *one* kind validates, and only *unknown* keys are rejected. Fix the spec's type literal so the implementer doesn't faithfully encode the wrong contract.

---

### AUDIT-20260602-05 — Stale deferral pointer: #223/#234/#357 were deferred to #301 (graphical-entries), which has now MERGED without resolving them — Phase 39 silently inherits the cluster

Finding-ID: AUDIT-20260602-05
Status:     fixed-2026-06-02 (spec §9 reconciled: #223/#234/#357 ownership moved from merged-but-unresolved #301 to Phase 39 §Calendar/39c). FOLLOW-UP (needs operator approval — external-write gate denied the agent): re-point the three GH issues #223/#234/#357 at Phase 39 with a comment (the durable spec record exists; the issue comments would close the "operator checks #301, finds it merged, assumes resolved" trap).
Severity:   medium
Surface:    workplan Phase 38 cluster line (`#223 + #234 + #357` "deferred to `feature/graphical-entries` (#301)") vs Phase 39 spec §"Calendar" + commit `386df7dd` (Merge PR #398 from feature/graphical-entries)

The Phase 38 workplan defers the calendar-surface cluster (#223 regen flip-flop, #234 divergence, #357 read-side validator) to `feature/graphical-entries`/#301, on the rationale that "lanes generalizes the … surface question." But graphical-entries **already merged** into main (commit `386df7dd`, shipped in v0.34.0) — and per Phase 39's own spec it shipped `lane.contentDir` (location-as-key *repeated*) and did **not** resolve the calendar cluster. Phase 39 §"Calendar" now picks up that exact work (retire per-site `calendarPath`, collapse to a single `.deskwork/calendar.md`, de-parameterize `resolveCalendarPath` + the `calendar-sidecar` rule).

So the ownership of #223/#234/#357 has silently moved from the merged-but-didn't-fix #301 to the not-yet-implemented Phase 39, with no update to either the Phase 38 deferral line or (presumably) the GitHub issues that still point at #301. Per the project's closure discipline ("a deferral without an issue/workplan record that someone reads is debt that compounds"), the workplan should reconcile this: either re-point those three issues at Phase 39 (39c) explicitly, or note in the Phase 38 line that #301 merged without resolving them and Phase 39 now owns them. Otherwise an operator reading the burndown sees "deferred to #301," checks #301, finds it shipped, and reasonably assumes the cluster is resolved when it is not. Same applies to #394: spec §9 correctly says it "remains a known limitation until this retirement lands" — confirm the #394 issue is updated to reflect that its in-flight fix (`5fbddf15`) was **dropped** and re-scoped to Phase 39, not silently abandoned.

---

**Summary for triage:** The single most important signal is **-01** — this barrage had no code to audit; the work is two staged docs files. Of the doc-level findings, **-03** (migration backfills via the broken heuristic) and **-04** (`Record` vs `Partial<Record>`) are the two I'd fix in the spec *before* 39a/39b start, since the implementer will otherwise faithfully encode both. **-02** and **-05** are tracking-integrity issues (uncommitted "done" work; stale deferral pointer) that cost trust later but don't block design.

## 2026-06-03 — audit-barrage lift (20260603T004551115Z-deskwork-plugin)

### AUDIT-20260603-01 — Migration step 1 cannot derive a per-`artifactKind` `scaffoldDefaults` map from a single legacy `site.contentDir`

Finding-ID: AUDIT-20260603-01
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` §"Migration" step 1 ("`scaffoldDefaults` derived from `site.contentDir`") + decision #7 + workplan.md Task 39b

The spec types `scaffoldDefaults?: Partial<Record<artifactKind, string>>` (a *per-kind* map) and decision #7 anchors it on the "site-content vs PRD/workplan dir" example where different kinds resolve to different directories. But a legacy `site` carries exactly **one** `contentDir`. Migration step 1 says "`scaffoldDefaults` derived from `site.contentDir`" without specifying *which* `artifactKind` the single directory maps to. An implementer of 39b has no defined rule: do they stamp `{ post: site.contentDir }`? `{ <every kind>: site.contentDir }`? Leave it empty and require the operator to fill it? Each choice has different downstream behavior at `/deskwork:add` time (where `scaffoldDefaults[kind]` chooses the scaffold destination), and the wrong default silently drops new non-`post` artifacts into the legacy content dir.

This is distinct from the already-folded AUDIT-20260602-03 (which covers *entry* `artifactPath` backfill collision) — this is about *lane* `scaffoldDefaults` derivation, a different migration output. 39b's TDD acceptance ("multi-site + multi-filesystem fixture; idempotent re-run; slug-collision refuse-and-report") does not name a `scaffoldDefaults`-derivation assertion at all. The spec should state the kind-assignment rule (e.g. "map the lane's primary `artifactKind` to `site.contentDir`; leave other kinds unset") and 39b should add an acceptance asserting the derived map shape, so the implementer doesn't invent a per-kind default that mis-routes future scaffolds.

### AUDIT-20260603-02 — Strict lane schema (39a/39c) and the tolerant legacy-`sites` read (39b) are not reconciled — the doctor migration must load a config the post-migration schema rejects

Finding-ID: AUDIT-20260603-02
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` §"Config schema change" + §"Migration" step 4 ("Tolerated reads") + §"Surface impacts" (config schema + loader) vs. workplan.md Tasks 39a (`.strict()` rejection) / 39b (migration) / 39c (remove `sites` from schema + loader)

The spec creates a bootstrapping ordering hazard it doesn't resolve. 39a mandates a lane Zod schema with `.strict()` "reject only unknown keys," and 39c says "Remove `SiteConfig`/`sites` from the schema + loader." Once `sites` is removed from the config schema, loading a *pre-migration* config (which still has a top-level `sites` block) through that loader fails validation on the unknown `sites` key. But the doctor migration (39b) is exactly the code that must **load that legacy config to migrate it** — `--fix` reads `config.sites`, builds lanes, then drops `sites`. So the migration depends on parsing a shape the post-39c schema is engineered to reject.

The spec gestures at this ("the migration-time tolerant reader is the only path that still parses a legacy `sites` block") but never reconciles it with 39a's strict schema: it doesn't say whether the loader has a two-pass mode (tolerant pre-validate → migrate → strict re-validate), whether the doctor bypasses the main loader entirely with a separate lenient parser, or how a config that fails the strict loader is even surfaced to the doctor rather than crashing every other config-reading command (`install`, `studio`, `ingest`) on a pre-migration project. This is a real cross-cutting gap an implementer hits the moment they wire 39b on top of 39c's strict loader. The spec should specify the dual-parse path and 39b/39c acceptance should pin it (e.g. "loading a legacy `sites` config via the strict loader raises a doctor-actionable error, never an unhandled Zod throw; the migration's tolerant parser is the only `sites` reader").

### AUDIT-20260603-03 — `apply-audit-flips` orphan-sweep annotation is stale-on-status-change — keys idempotency on the annotation prefix, not the recorded status

Finding-ID: AUDIT-20260603-03
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `plugins/dw-lifecycle/src/subcommands/apply-audit-flips.ts` (the orphan-sweep `else` branch, the `block.includes('> Superseded by audit-log Status')` idempotency guard)

The orphan-sweep injects `\n\n> Superseded by audit-log Status \`${flip.newStatus}\` — no TDD walk required.` and guards re-injection with `block.includes('> Superseded by audit-log Status')`. The guard matches the annotation *prefix*, not the embedded status string. So if a finding's terminal status changes between two `--apply` runs — e.g. a `acknowledged-slush-pile-2026-06-02` finding is later re-audited and flipped to `verified-<date>` (the `re-audit-fixed-findings` flow is a live verb in this repo) — the second sweep sees the existing annotation, takes the `tickedBoxes`-only branch, and **never updates the status in the annotation**. The workplan task then permanently advertises the *first* terminal status as the reason it was superseded, contradicting the current audit-log Status the operator reads.

This is distinct from the already-slushed AUDIT-20260602-30 (fabricated TDD signal on all-unchecked blocks), -32 (partial-walk blocks getting a false "no TDD walk required"), and -33 (duplicate-heading half-sweep): none of those address a status *transition* between runs. The cost is low (a misleading provenance line in workplan prose, not a gate failure), but it's a silent drift on the exact tracking surface this feature is trying to keep honest. Fix: key the idempotency check on the full `> Superseded by audit-log Status \`${flip.newStatus}\`` string, or strip any existing supersession annotation before re-injecting, so a status change rewrites the line.

---

**What I checked and found already-covered (not re-reported):** the `--no-tailscale` two-branch warning and its `--host 127.0.0.1` gap (AUDIT-06/11/12); the tri-state `checkAncestry` collapse arrows and inverse-safety invariant (AUDIT-41/45/46/47/52); `pickFallbackBaseline` selection logic including the post-merge `branch-point` test (AUDIT-39/02); `computeAuditedDiff` / `runGitDiff` maxBuffer classification and the `ok:true` swallow of generic git errors (AUDIT-03/05/06/35/39); the `EMPTY_DIFF_CURE_MESSAGE` placeholder and duplicated 50 MB constant (AUDIT-38/07/08); the divergence-notice dead code and unthreaded `DW_UPSTREAM_BASE_REF` (AUDIT-01/02); `inferFindingShape` allowlist whack-a-mole + `.claude/agents` gap (AUDIT-09/14); the informational auto-flip `!alreadyScoped` residue (AUDIT-79); and the deskwork-plugin spec's `Partial<Record>` typing + backfill collision + stale `#301` deferral pointer (AUDIT-20260602-03/04/05). The version bump to 0.35.0 is internally consistent across all eleven manifests. My three findings are the migration `scaffoldDefaults` derivation gap, the strict-schema-vs-tolerant-read bootstrapping gap, and the orphan-sweep stale-annotation bug — none captured by the prior dispositioned set.

## 2026-06-03 — audit-barrage lift (20260603T013840403Z-deskwork-plugin)

### AUDIT-20260603-04 — Workplan declares the `resolveContentDir` discovery-walk strategy "resolved," but the blueprint it cites still frames it as an open operator decision

Finding-ID: AUDIT-20260603-04
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` (added "Implementation sequence" paragraph) vs. `docs/1.0/001-IN-PROGRESS/deskwork-plugin/39-sites-to-lanes-blueprint.md` §1 NOTE + §5 risk #1

The same commit introduces a direct contradiction between the two Phase-39 tracking docs about how the highest-reach symbol in the refactor (`resolveContentDir`, "the widest reach of any single symbol") gets re-homed. The workplan's new paragraph asserts the question is settled: *"Open design call resolved spec-consistently: the `resolveContentDir` discovery-walk callers move to **sidecar-driven enumeration** … not a scaffold-root walk."* But that paragraph explicitly routes implementers to the blueprint for the sequence (*"per `39-sites-to-lanes-blueprint.md`"*), and the blueprint — the authoritative implementation doc — still frames the identical decision as unresolved: §1 NOTE says *"39c must decide per-caller whether the walk is replaced by (a) a sidecar enumeration or (b) a per-lane `scaffoldDefaults` root walk,"* and §5 risk #1 says *"This is a design decision inside 39c that the spec does not fully pin down … Needs an operator call."*

An implementer working from the blueprint (the cited source of truth) will see "needs an operator call" with two live options and may pick option (b) — the per-lane `scaffoldDefaults` root walk — which is the exact strategy the workplan says NOT to use. The cost is a wrong 39c implementation of the single largest refactor in the phase, plus the trust erosion the project's closure/tracking discipline exists to prevent. Fix: reconcile in the same commit — update blueprint §1 NOTE and §5 #1 to record the resolution (sidecar-driven enumeration, scaffold-root walk rejected), or strike the "resolved" claim from the workplan if it isn't actually settled. Right now both can't be true.

---

### AUDIT-20260603-05 — Blueprint 39b encodes the all-kinds→one-dir `scaffoldDefaults` derivation that AUDIT-20260603-01 named as the mis-routing anti-pattern — while -01 sits slushed and unresolved

Finding-ID: AUDIT-20260603-05
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/39-sites-to-lanes-blueprint.md` §3 (39b) vs. `docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md` AUDIT-20260603-01

Three documents in this diff disagree on how migration step 1 derives a per-`artifactKind` `scaffoldDefaults` map from a legacy `site.contentDir` (which carries exactly one directory). The spec leaves it undefined; the audit-log records AUDIT-20260603-01 as `acknowledged-slush-pile` (i.e. open/unaddressed); but the blueprint silently *resolves* it with a concrete rule — §3 39b: *"`scaffoldDefaults` derived from `site.contentDir` keyed by the lane's pipeline kinds."* "Keyed by the lane's pipeline kinds" means mapping **every** pipeline kind to the single legacy directory (`{ <every kind>: site.contentDir }`). That is precisely the choice AUDIT-20260603-01 flagged as wrong: *"the wrong default silently drops new non-`post` artifacts into the legacy content dir."*

So the implementation doc encodes the anti-pattern the audit finding warned against, the audit finding is parked as slushed rather than driving a correction, and neither the spec nor 39b's acceptance criteria carry a `scaffoldDefaults`-derivation assertion to catch it. An implementer faithfully following the blueprint backfills a lane that mis-routes every future non-default scaffold. Fix: decide the kind-assignment rule (the finding suggests "map the lane's *primary* kind to `site.contentDir`; leave other kinds unset"), write it into the spec, and add a 39b acceptance asserting the derived map shape — then bring the blueprint's §3 39b line into agreement with it.

---

### AUDIT-20260603-06 — AUDIT-20260603-01/-02 (design-blocking spec gaps for 39a/39b) were slushed, not scoped — diverging from how -03/-04 were folded and from the project's scope-don't-defer discipline

Finding-ID: AUDIT-20260603-06
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md` AUDIT-20260603-01 + -02 `Status:` lines; `.dw-lifecycle/scope-discovery/hook-run-log.jsonl` (`"disposition":"fired-and-slushed"`)

Both new findings -01 (scaffoldDefaults derivation undefined) and -02 (strict lane schema vs. tolerant legacy-`sites` read not reconciled — the migration must load a config the post-39c schema rejects) are marked `acknowledged-slush-pile-2026-06-03`. These are not hygiene notes: each is a gap an implementer hits *the moment 39a/39b start* (the spec doesn't say how to derive the map; the spec doesn't say whether the loader is dual-pass or the doctor bypasses it). The immediately-preceding entries in the very same file — AUDIT-20260602-03/04 — were the right precedent: both `fixed-2026-06-02 (folded into spec + workplan acceptance)`. The project's `agent-discipline.md` is explicit (operator, verbatim): *"Filing a bug report isn't good enough. It MUST BE SCOPED INTO THE WORKPLAN,"* and the `promote-findings` mechanism makes scope-into-workplan the default, gating the acknowledged path on a *recorded substantive reason*.

No substantive reason for slushing -01/-02 appears in the diff — only the `fired-and-slushed` marker. -02 in particular is a cross-cutting correctness hazard: once 39c removes `sites` from the strict loader, every config-reading command (`install`, `studio`, `ingest`) on a pre-migration project either throws an unhandled Zod error or silently can't run, and the migration itself can't parse the shape it must migrate — this is design-blocking, not low-cost. (Note: -03, against `apply-audit-flips.ts`, is in the dw-lifecycle lane explicitly listed as **out of scope** for this feature, so slushing *it* here is defensible — but it should be filed against that lane rather than left only in this feature's slush pile.) Fix: fold -01 and -02 into the spec + 39a/39b acceptance now (before implementation), matching the -03/-04 treatment, or record the gating substantive reason if the operator genuinely chooses to park them.

---

### AUDIT-20260603-07 — Verified-clean items (negative signal for cross-model triage)

Finding-ID: AUDIT-20260603-07
Status:     acknowledged-slush-pile-2026-06-03
Severity:   informational
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/39-sites-to-lanes-blueprint.md` §3/§4 (39a Zod recipe)

I checked the blueprint's recommended lane-schema recipe — `z.record(ArtifactKindSchema, z.string().min(1)).optional()` with the parenthetical claim *"partial by construction … unknown keys are rejected because the key schema is the enum"* — directly against the repo (Zod 3.25.76, `packages/core/node_modules/zod`). At **runtime** a single-kind map (`{ markdown: 'src/blog' }`) parses and an unknown key is rejected; at the **type level**, a `tsc --noEmit --strict` probe confirmed the inferred type is partial (`{ markdown: 'x' }` is assignable; a control `Record<allKinds,string>` correctly rejected the same partial literal). So the recipe satisfies both the spec's `Partial<Record<artifactKind,string>>` intent (AUDIT-20260602-04's fix) and the unknown-key rejection — I would have flagged it as a re-encoding of AUDIT-04 had the inference come back non-partial, but it did not. One cosmetic note only: the symbol is `ArtifactKindEnum` in `packages/core/src/schema/entry.ts:180`, not `ArtifactKindSchema` as the blueprint writes it — a rename for the implementer to reconcile, not a defect. I also confirmed the `fired-and-slushed` hook-log disposition is internally consistent with the three slushed audit-log entries (unlike the 39.0 marker-honesty problem, this enum value matches the recorded action).

## 2026-06-03 — audit-barrage lift (20260603T015144330Z-deskwork-plugin)

### AUDIT-20260603-08 — resolveStoredArtifactPath treats empty-string artifactPath as present, diverging from the codebase's truthy / `!== ''` handling and resolving to the bare project root

Finding-ID: AUDIT-20260603-08
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/core/src/entry/resolve-artifact.ts:37-43` vs. `packages/core/src/doctor/validate.ts:215` and `:385`

The new helper guards the absent case with strict `=== undefined`:

```ts
if (sidecar.artifactPath === undefined) {
  return null;
}
return join(projectRoot, sidecar.artifactPath);
```

The rest of the codebase treats an empty `artifactPath` as *absent*, not present, in three other places: the existing resolver uses a truthy check — `if (entry.artifactPath)` (validate.ts:215) — so `''` falls through to the heuristic; and the repair gate explicitly writes `entry.artifactPath !== undefined && entry.artifactPath !== ''` (validate.ts:385), proving the authors consider `''` a real runtime value at this exact layer. The new helper, by contrast, treats `''` as a *valid stored path* and returns `join(projectRoot, '')` — which normalizes to the **bare project root**, not `null`, not a throw.

Whether `''` is reachable: the Zod schema does enforce `.min(1)` on `artifactPath` (entry.ts:260-262), so a freshly-parsed sidecar can't carry it. But (a) `resolveStoredArtifactPath` is a **public export** (added to `packages/core/src/index.ts`) typed `(sidecar: Entry, …)`, and `Entry.artifactPath` is `string | undefined`, so any caller can pass `{ …sidecar, artifactPath: '' }` and TypeScript accepts it; and (b) the schema's own docblock (entry.ts:255-259) explicitly warns that "a sidecar written by a non-deskwork process could still slip past if the schema is bypassed," which is precisely why the move-layer boundary check is kept as defense-in-depth. The new resolver carries none of that defense. When 39d flips callers onto this helper (per the file's own docblock), an empty-string path silently resolves to `projectRoot` — a path that exists — defeating the `file-presence` "is the artifact missing?" logic. Fix: guard `if (!sidecar.artifactPath)` (or `=== undefined || === ''`) so `''` returns `null`, matching validate.ts:215/:385.

---

### AUDIT-20260603-09 — A public export is shipped now whose own docblock says its return contract will flip from null to throw in 39d

Finding-ID: AUDIT-20260603-09
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/entry/resolve-artifact.ts:13-17,30-42` + `packages/core/src/index.ts:20`

`resolveStoredArtifactPath` is added to the package barrel (`index.ts:20 — export * from './entry/resolve-artifact.ts'`), making it part of `@deskwork/core`'s public surface at the 0.35.0 bump. Its docblock documents that the *same symbol* is slated to change its observable contract in a later phase: "39d ... makes a missing `artifactPath` THROW. This helper deliberately returns `null` (not a throw) for the absent case — throwing is 39d's job." So the function is published returning `string | null` in this release and is explicitly planned to switch to throw-on-absent in 39d.

Any consumer (another `@deskwork/*` package, or an adopter importing core) that binds to the documented `null`-on-absent behavior in 0.35.x will break when 39d flips it. Exporting a helper whose author-documented contract is already scheduled to change is an avoidable semver trap. Two cleaner options: keep the 39a helper module-internal (don't add it to the barrel until 39d settles the final contract), or give the throwing variant a *distinct name* in 39d rather than mutating this one's contract — so a 0.35 caller's expectations stay valid. The current shape publishes an API designed to break.

---

### AUDIT-20260603-10 — Two parallel artifact resolvers now coexist with mismatched absent-path semantics, making 39d's planned caller-swap a silent behavior change unless reconciled

Finding-ID: AUDIT-20260603-10
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/entry/resolve-artifact.ts:37-42` and `packages/core/src/doctor/validate.ts:204-219`

The stored-path branch of `resolveStoredArtifactPath` (`join(projectRoot, sidecar.artifactPath)`) duplicates the stored-path branch of the pre-existing `resolveArtifactPath` (validate.ts:215-216, `join(projectRoot, entry.artifactPath)`). The file's docblock states 39d "flips the existing resolvers to stored-path-only" — i.e. the intent is for the new helper to *replace* `resolveArtifactPath`'s first branch. But the two are not drop-in equivalent: `resolveArtifactPath` uses a truthy guard and the new helper uses `=== undefined` (see AUDIT-BARRAGE-claude-01), so a mechanical swap in 39d changes empty-string behavior. Separately, the docblock's claim that the new helper "coexists with the existing `?? heuristic` resolution in `doctor/validate.ts`" is inaccurate — validate.ts:214-218 uses an `if (entry.artifactPath) { … } return heuristic` form, not a `??` expression; the `?? heuristic` description doesn't match the surface it points at.

Neither is a correctness bug *today* (no caller is flipped yet), but both are traps the 39d implementer will step into: a "just delete `resolveArtifactPath` and call the new one" change will (a) silently alter `''` handling and (b) be guided by a docblock that mis-describes the code it's replacing. Reconcile the empty-string semantics first (per claude-01), and correct the `?? heuristic` phrasing to match the actual `if/return` shape, so the 39d swap is a true no-op on the absent/empty path.

---

I walked the actual code in the diff (the new `resolve-artifact.ts` helper, the `lanes/types.ts` schema additions, both test files) and verified the load-bearing claims against the repo: `Entry.artifactPath` is `.min(1).optional()` with `..`/absolute refinements (entry.ts:260-277); the existing resolver uses a truthy guard while the repair gate explicitly checks `!== ''` (validate.ts:215/:385); the `Drafting` heuristic resolves to `docs/<slug>/index.md`, so the test's negative assertion is sound. I did **not** re-report the `scaffoldDefaults` `z.record(enum, …)` partial-by-construction/unknown-key behavior — sibling AUDIT-20260603-07 already verified it at runtime and type level against Zod 3.25.76, and I confirmed the schema move (`ArtifactKindSchema` relocated above `LaneConfigSchema`) is internally consistent. My three findings cluster on one root: the new resolver's empty-string handling diverges from the codebase's established convention, and that divergence is set to bite when 39d swaps callers onto a now-public helper whose contract is documented to change.

## 2026-06-03 — audit-barrage lift (20260603T021048829Z-deskwork-plugin)

### AUDIT-20260603-11 — AUDIT-BARRAGE-claude-01 — 39b's migration drops `sites` from config, but the loader still *requires* `sites`; a release cut between 39b and 39c bricks every config-reading command on a migrated project

Finding-ID: AUDIT-20260603-11
Status:     fixed-2026-06-03 (39.1: parseConfig tolerates absent/empty sites + regression-lock)
Severity:   high
Surface:    `packages/core/src/doctor/legacy-config.ts:160-194` (`dropSitesBlock`) + `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:~230` (step 3) + workplan 39c (`[ ]`, unshipped)

`dropSitesBlock` rewrites `.deskwork/config.json` with `sites` and `defaultSite` removed (legacy-config.ts:180-191), and the migration rule invokes it as the terminal `apply` step. The module's own docblock admits the consequence: *"the resulting config no longer satisfies `parseConfig` (which still requires `sites` in 39b)"* (legacy-config.ts:155-159). `runner.ts:selectSites` reads `Object.keys(opts.config.sites)` and the whole doctor run is built on `readConfig` succeeding — as are `install`, `studio`, `ingest`, and every other command. So once `doctor --fix` runs this migration, the *next* `readConfig` on the project throws a Zod error, and **no deskwork command can run** until 39c relaxes the loader.

This is the concrete code manifestation of the spec-level concern that was parked as `acknowledged-slush-pile` (AUDIT-20260603-02). It was a hypothetical against the spec when slushed; it is now executable code that performs a destructive, non-recoverable-by-deskwork mutation. The workplan marks 39b `[x]` and 39c `[ ]` — if a release is cut at this boundary (the project ships frequently, and 39a+39b are both landed), an adopter who runs `doctor --fix` permanently bricks their config relative to the shipped loader. The mitigation is a hard release-sequencing constraint that nothing in the code or workplan enforces: **39b must not reach a release tag without 39c**. Either gate the release (the migration must not be reachable in a build whose `parseConfig` still requires `sites`), or have 39b's `dropSitesBlock` leave the config loader-parseable (e.g. relax `parseConfig` to tolerate absent `sites` as part of 39b rather than 39c). Surfacing it here because the slushed entry carries no recorded substantive reason and the underlying shape is now live code, not spec text.

---

### AUDIT-20260603-12 — AUDIT-BARRAGE-claude-02 — migration creates per-site lanes and backfills `artifactPath` but never assigns `entry.lane`; the only existing back-fill collapses entries onto a `default` lane the migration didn't create, so post-migration entries are orphaned

Finding-ID: AUDIT-20260603-12
Status:     fixed-2026-06-03 (39.2: migration stamps entry.lane via LaneBase threading)
Severity:   medium
Surface:    `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:apply()` (lanes-from-sites + backfill, no `entry.lane` write) vs. `packages/core/src/doctor/rules/entry-lane-missing.ts:83-106` + `runner.ts:56-58` (rule ordering)

The migration creates one lane per legacy site (`laneFromSite`, id = slug) and stamps each entry's `artifactPath`, but it never sets the entry's `lane` field. `entry-lane-missing` runs immediately after `sites-to-lanes-migration` in the registry (runner.ts:56 then :58) and emits an `error`-severity finding for **every** sidecar lacking `lane` (entry-lane-missing.ts:83-84). So a `--fix=all` run reports "migrated N sites to lanes" and, in the same breath, "all N entries are missing their lane field" — the migration's logical purpose (rehome each site's entries onto that site's lane) is left half-done.

Worse, the documented repair for `entry-lane-missing` is `migrateLaneMembership`, which the rule's own docblock says *"writes `lane: "default"` on every sidecar"* (entry-lane-missing.ts:22-26) — collapsing every entry onto a single `default` lane that the sites→lanes migration never created (it created `blog`/`docs`). An operator who follows the surfaced repair lands entries on a lane with no config file, which then trips `lane-config-missing-template` or the lane resolver. The migration has the information to do this correctly (it knows each entry's source contentDir → owning site → lane id) but doesn't use it. Either assign `entry.lane = <owning-site-slug>` during the backfill step (the entry's resolved candidate already came from exactly one site's contentDir in the unambiguous case), or explicitly record in the workplan/spec that entry-lane assignment is out of 39b scope and name which later task owns it — right now it is silently neither.

---

### AUDIT-20260603-13 — AUDIT-BARRAGE-claude-03 — `readLegacySites` throws from `audit()` on a broken or `contentDir`-less site, and the runner doesn't guard `rule.audit()`, so one malformed site aborts the *entire* doctor run

Finding-ID: AUDIT-20260603-13
Status:     fixed-2026-06-03 (39.3: migration audit() self-guards malformed site)
Severity:   medium
Surface:    `packages/core/src/doctor/legacy-config.ts:106-153` (`readLegacySites` throw paths) + `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:audit()` + `packages/core/src/doctor/runner.ts:198,227`

`readLegacySites` throws on a present-but-broken config: invalid JSON (legacy-config.ts:125-130), non-object root (:133-137), a site whose value isn't an object (:144-148), or a site missing a non-empty `contentDir` (:150-156). The migration rule calls `readLegacySites` directly inside `audit()` with no guard. The runner calls `rule.audit(ctx)` bare — `runAudit` at runner.ts:198 and `runRepair` at runner.ts:227 — with no per-rule try/catch. So a single malformed legacy site (e.g. a `sites.blog` block someone hand-edited to drop `contentDir`) makes `readLegacySites` throw, which propagates out of `audit()` and **aborts the whole `doctor --check` / `doctor --fix` run**, including every unrelated rule (`orphan-frontmatter-id`, `duplicate-id`, `slug-collision`, …).

Contrast `entry-lane-missing.ts:72-80`, which deliberately wraps its read in try/catch precisely so a read failure degrades to an empty finding list rather than killing the run. "Surface broken config loudly" is a reasonable goal, but the right surface is an `error`-severity *finding* (which doctor renders and exits non-zero on), not an uncaught exception that denies the operator every other rule's output. Catch the throw inside `audit()` and convert it to a finding (`severity: 'error'`, message naming the bad site + the parse reason), so the rest of doctor still runs.

---

### AUDIT-20260603-14 — AUDIT-BARRAGE-claude-04 — `anyEntryMissingArtifactPath` swallows all read errors with a bare `catch { return false }`, so audit silently under-reports on a corrupt sidecar while `apply` throws on the same input

Finding-ID: AUDIT-20260603-14
Status:     fixed-2026-06-03 (39.4: removed swallow; corrupt-sidecar throw propagates like apply)
Severity:   medium
Surface:    `packages/core/src/doctor/rules/sites-to-lanes-migration.ts` (`anyEntryMissingArtifactPath`, the `catch { return false }`) vs. `packages/core/src/doctor/sites-migration-backfill.ts:planBackfills` (`readAllSidecars`, unguarded)

`anyEntryMissingArtifactPath` wraps `readAllSidecars` in `try { … } catch { return false; }` with no ENOENT discrimination and no explanatory comment. `readAllSidecars` (unlike the `readAllSidecarsPartitioned` reader `entry-lane-missing` uses) throws on any malformed sidecar. So if one sidecar is corrupt, `audit()` silently concludes "no entries are missing `artifactPath`" and suppresses the detection finding — the project's "no fallbacks / no swallowed exceptions" rule names exactly this shape as a bug factory, and the sibling `readLegacySites` in the very same migration deliberately throws on broken input (legacy-config.ts:125), so the two readers in one feature disagree on how to treat corruption.

The disagreement is worse across phases of the same migration: `apply()` calls `backfillFromLegacySites` → `planBackfills` → `readAllSidecars` (sites-migration-backfill.ts) with **no** guard, so the same corrupt sidecar that `audit()` swallowed will make `apply()` throw (caught by the outer `try/catch` → `applied: false, 'migration failed'`). Audit says "nothing to migrate," apply says "migration failed" — on identical on-disk state. Make the read consistent: either both use the partitioned reader and report malformed sidecars as findings, or both throw; do not have audit swallow what apply rejects.

---

### AUDIT-20260603-15 — AUDIT-BARRAGE-claude-05 — detection trigger `missingArtifactPath` is decoupled from the backfiller's capability: with no legacy sites there are no base dirs to search, so `apply` returns `applied: true` having stamped nothing

Finding-ID: AUDIT-20260603-15
Status:     fixed-2026-06-03 (39.5: apply reports applied:false/skipReason on no-op)
Severity:   low
Surface:    `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:audit()` (`sitesPresent || missingArtifactPath`) + `apply()` (backfill with empty `baseDirs`)

The detection finding fires on `sitesPresent || missingArtifactPath`, but every repair action keys off legacy sites: lane creation iterates `sites`, and the backfiller's `enumerateCandidates` (sites-migration-backfill.ts) only searches each legacy `site.contentDir`. When the rule fires because `missingArtifactPath` is true but `sites` is empty, `baseDirs` is `[]`, so `enumerateCandidates` returns `[]` for every entry, nothing is stamped, and `apply` still returns `applied: true` ("0 lane(s) created, 0 backfilled, sites … absent"). The entries remain unstamped, so a subsequent audit re-fires the same finding — `applied: true` is reported for a run that changed nothing and did not converge.

Through the normal runner this exact state is partly masked because `selectSites` returns `[]` for an empty `config.sites` and the rule is then never invoked (runner.ts:143, :195/:224) — but it is directly reachable in the migration's own test harness and in any partial-migration state, and the `apply` return value claiming success while doing nothing is misleading regardless of reachability. Tighten the apply contract: when `baseDirs` is empty but entries still lack `artifactPath`, return a non-success result (or a `report-only` directing the operator to the lane-native back-fill) rather than `applied: true`, so "applied" never means "I detected a problem I had no means to fix."

## 2026-06-03 — audit-barrage lift (20260603T023346406Z-deskwork-plugin)

### AUDIT-20260603-16 — Lane assignment is coupled to artifactPath backfill — entries that already carry `artifactPath` but no `lane` are never rehomed

Finding-ID: AUDIT-20260603-16
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/core/src/doctor/sites-migration-backfill.ts:177-181` (`planBackfills` skip) + `:208-225` (`backfillFromLegacySites` stamp loop)

The -12 fix assigns `entry.lane` only inside the backfill loop, which `planBackfills` gates on *missing* `artifactPath`: `if (entry.artifactPath !== undefined && entry.artifactPath !== '') continue;` (sites-migration-backfill.ts:177). Any entry that already has a non-empty `artifactPath` never reaches `toStamp`, so `backfillFromLegacySites` never writes a sidecar for it, so its `lane` is never set (sites-migration-backfill.ts:208-225). The migration's stated purpose per the -12 finding — *"rehome each site's entries onto that site's lane"* — is therefore only half-done: it rehomes the subset of entries that happen to be missing `artifactPath`.

This is not a contrived state for the *actual* migration this feature exists for. A project adopting `sites→lanes` is, by definition, a project that predates lanes; entries created before the lane field existed commonly already carry `artifactPath` (e.g. stamped at ingest) but have no `lane`. Those exact entries are the ones the migration silently leaves lane-less, and `entry-lane-missing` (which runs immediately after, runner.ts:56→58 per the -12 finding) will flag every one of them as an `error` in the same `--fix=all` run — reproducing the precise symptom -12 was filed to eliminate, for a realistic subset. A fix would decouple lane-assignment from the artifactPath-backfill gate: stamp `lane` for any lane-less entry that resolves unambiguously to a single site's contentDir, regardless of whether `artifactPath` is already present. The migration already knows the owning site for such an entry (`enumerateCandidates` would resolve it) — it's only the early `continue` that skips the work.

### AUDIT-20260603-17 — `parseConfig` tolerance is narrower than its docblock claims — `defaultSite` present with `sites` absent still throws

Finding-ID: AUDIT-20260603-17
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/config.ts:321-329` (`resolveDefaultSite`) + docblock `:12-17`

The new docblock asserts (config.ts:12-17): *"An absent/empty `sites` normalizes to `{}` and `defaultSite` to `''`."* But the empty-string return for `defaultSite` lives **inside** the `value === undefined || value === null` branch (config.ts:319-326): `if (siteSlugs.length === 0) return '';`. If a config has `sites` absent but `defaultSite` *present* (a string), `resolveDefaultSite` skips that branch entirely and falls through to the value-present validation, which throws `defaultSite "X" is not a configured site` because `siteSlugs` is empty. So the loader is tolerant of the sites-absent shape **only when `defaultSite` is also absent** — a narrower contract than the docblock's blanket *"sites is tolerated as absent or empty."*

In practice `dropSitesBlock` removes both keys atomically, so the tool's own migration never produces this shape. But an operator hand-editing `.deskwork/config.json` to delete the `sites:` block while leaving a `defaultSite:` line lands exactly here and gets the same brick -11 was meant to prevent. There is no test for `{version:1, defaultSite:'blog'}` (sites absent, defaultSite present) — `parse-config-tolerant-sites.test.ts` only covers `defaultSite` absent. Either widen the tolerance (a present-but-orphaned `defaultSite` with no sites → normalize to `''` rather than throw) or tighten the docblock to say the tolerance requires `defaultSite` to be absent too; and add the missing-coverage test either way.

### AUDIT-20260603-18 — Malformed-site / corrupt-sidecar tests assert against regexes the generic error wrapper satisfies unconditionally — they don't pin the cause

Finding-ID: AUDIT-20260603-18
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/test/doctor/sites-migration-malformed-site.test.ts:78-79` (`/contentDir|could not read|migration/i`) + `:124-125` (`/sidecar|invalid|read|could not/i`)

`audit()` converts any caught throw into a single fixed-template finding: `sites-to-lanes migration could not inspect the project: ${reason}...` (sites-to-lanes-migration.ts in the `catch`). Both regression tests then assert the message matches a regex — but the wrapper text *always* contains the words "migration" and "could not", so both regexes pass on the wrapper alone, independent of `${reason}`. The -13 test's `/contentDir|could not read|migration/i` matches via "migration"; the -14 test's `/sidecar|invalid|read|could not/i` matches via "could not". Neither alternative that names the *actual* cause (`contentDir`, `sidecar`, `invalid`) is load-bearing.

The consequence is the tests verify only that *some* error finding was produced, not that it was produced *for the intended reason*. If a future refactor made `readLegacySites` stop throwing on missing `contentDir` (so the rule errored for an unrelated reason, or produced a non-error finding that still mentioned "migration"), the -13 test could stay green while the bug it guards regressed. Per the project's "tests that don't test the contract they claim" concern, anchor each assertion on the cause-specific substring the wrapper interpolates from `${reason}` — e.g. assert the message contains `contentDir` (the -13 case) and `33333333-...`/`sidecar`/JSON-parse text (the -14 case) — not a token the template emits unconditionally.

### AUDIT-20260603-19 — The `apply()` no-base branch (-15) guards a state the production runner cannot reach; its test constructs an in-memory/disk config mismatch

Finding-ID: AUDIT-20260603-19
Status:     acknowledged-slush-pile-2026-06-03
Severity:   informational
Surface:    `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:258-289` (no-base `apply` branch) + `packages/core/test/doctor/sites-migration-noop-honesty.test.ts:60-90`

The -15 fix is correct as a defensive contract, but worth flagging for how the operator reads its "fixed" claim. For `apply()` to run, audit must have fired the finding, which requires the rule to have run, which requires `selectSites` to have returned a site — which requires the *in-memory* `config.sites` (from `readConfig`) to be non-empty. `legacyLaneBases` is built from `readLegacySites`, which reads the *same* `.deskwork/config.json`. The two readers cannot disagree on the same file, so `bases.length === 0` while the rule is running is unreachable through the normal runner (as the original -15 finding already noted). The new test forces the state only by passing `validConfig()` (in-memory sites = `blog`) while writing `{version:1}` to disk (sites-migration-noop-honesty.test.ts:51-90) — a divergence that cannot occur in production now that `readConfig` reads the same file the rule does.

No change requested — the guard is harmless belt-and-suspenders and the honest `applied: false` is the right contract. But the regression test pins behavior for an impossible-in-production input, so it would not catch a regression in the *reachable* path (it has none). If the operator wants -15 to carry real protective value, the test that matters is the one already covered elsewhere (a genuinely-empty config short-circuits before the rule via `selectSites`), not this in-memory/disk-mismatch construction.

## 2026-06-03 — audit-barrage lift (20260603T025928038Z-deskwork-plugin)

### AUDIT-20260603-20 — Import-pattern regression in `resolve-artifact.ts` — `@/` alias replaced with a relative `../` import

Finding-ID: AUDIT-20260603-20
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/entry/resolve-artifact.ts:19-20`

The diff actively changes the `Entry` import from the project-mandated alias form to a relative path:

```
-import type { Entry } from '@/schema/entry.ts';
+import { existsSync } from 'node:fs';
+import { basename, dirname, join } from 'node:path';
+import type { Entry } from '../schema/entry.ts';
```

Both the user-global and work-level `CLAUDE.md` state, verbatim: *"Always use the @/ import pattern for TypeScript."* The pre-39d file already complied (`@/schema/entry.ts`); this edit regresses it to `../schema/entry.ts`. It compiles, so it's hygiene rather than a correctness bug — but it's a guideline violation introduced *by this diff*, on a file the diff otherwise rewrites, so the cost of fixing it now is one line. Restore `@/schema/entry.ts`. (Worth a grep of the surrounding `entry/` directory to confirm this isn't a creeping pattern — the sibling `iterate.ts` in the same diff correctly uses relative `../entry/resolve-artifact.ts`, so the convention is applied inconsistently across the two edited files.)

### AUDIT-20260603-21 — Studio + iterate resolvers now throw on pre-migration (path-less) entries — verify the call-site boundaries render the throw rather than crash

Finding-ID: AUDIT-20260603-21
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/studio/src/lib/entry-resolver.ts:52-60` (`resolveIndexPath` throw) + `packages/core/src/iterate/iterate.ts:51-59` (`resolveIndexPath` throw)

Both `resolveIndexPath` implementations now `throw` when `resolveStoredArtifactPath` returns `null` (entry lacks `artifactPath`). This is the correct "no fallback — throw" contract, but it converts a previously-degrading read into a hard failure on the exact population that exists during an *upgrade*: every legacy/pre-migration sidecar (created before `artifactPath` was authoritative) lacks the field. Before 39d, the studio fell back to `<contentDir>/<slug>/index.md` and rendered; after 39d, opening any such entry's review surface throws.

The diff shows the throw but not the boundary that catches it. `resolveEntry` (studio, `entry-resolver.ts`) propagates the throw to whatever Hono route renders the entry — if that route has no try/catch that converts the error into a "run `deskwork doctor --fix`" page, the studio returns an unhandled 500 on every legacy entry until the operator migrates. That is the precise upgrade-path window where an adopter is most likely to open the studio to *see* what needs migrating. The fix isn't to re-add the fallback (the throw is right); it's to confirm the studio route + the iterate CLI caller catch this specific error and surface the actionable message, and add a test that the route degrades gracefully rather than 500s. If that handling already exists outside the diff, this is a no-op — but it is not demonstrated by the diff and is the highest-impact unproven claim in the change.

### AUDIT-20260603-22 — Three new error/finding messages promise `deskwork doctor --fix` will backfill, but the only backfiller is gated on legacy `sites`

Finding-ID: AUDIT-20260603-22
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/core/src/doctor/validate.ts:348-355` (`validateMissingArtifactPath` message) + `packages/core/src/iterate/iterate.ts:53-58` (throw) + `packages/studio/src/lib/entry-resolver.ts:54-59` (throw)

This diff deletes the runtime `backfillArtifactPaths` from `repair.ts` (repair.ts:25-72 removed) and adds three operator-facing messages that all instruct *"run `deskwork doctor --fix` to backfill artifactPath"*. After this deletion the **only** path that stamps `artifactPath` is `sites-migration-backfill.ts`, which the slushed findings -15/-16/-19 establish fires only when legacy `config.sites` is present. So the guidance is correct *only* for a project still carrying a `sites` block. For a project with no legacy sites and a path-less entry (the lane-native state 39c moves toward, and any partial-migration state today), `doctor --fix` does nothing, yet the iterate/studio throw and the `missing-artifact-path` finding all send the operator into a remedy that can't converge — the operator runs `doctor --fix`, sees no change, hits the same throw, repeats.

This is a distinct surface from the slushed -16/-19 (which are about `apply()`'s return contract): here it's three user-visible strings, added in *this* diff, hardcoding the sites-migration as *the* backfiller. The messages also go stale the moment 39c removes `sites`, because the migration rule will stop firing entirely. A safe fix is to phrase the guidance conditionally (or point at the lane-native backfill once it exists) rather than naming the sites-migration as a guaranteed remedy — and, minimally, to not promise a backfill the codebase can't currently perform for the no-sites case.

### AUDIT-20260603-23 — `refineToIndexDoc`'s `index.md`-preference silently hijacks shared-directory layouts whenever any `index.md` coexists

Finding-ID: AUDIT-20260603-23
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/entry/resolve-artifact.ts:66-74` (`refineToIndexDoc`)

The extracted helper prefers `<docDir>/index.md` *iff it exists*, otherwise returns the stored artifact path — to support "shared-directory layouts (multiple entries per directory, each addressed by its own filename, e.g. prd.md / workplan.md / README.md)". But the two cases collide: if a shared directory contains `index.md` *and* `prd.md` / `workplan.md` / `README.md`, every entry in that directory — regardless of its own stored filename — resolves to the single `index.md`, because `existsSync(indexPath)` short-circuits before the filename is consulted. The stored-filename addressing the comment promises only works when no `index.md` is present.

The logic is unchanged from the pre-39d copies in `iterate.ts`/`entry-resolver.ts` (this diff only *centralizes* it), so it's not a new defect — but the extraction now binds both the core iterate verb and the studio resolver to the same fragile rule, so a directory that gains an `index.md` would mis-resolve identically in both surfaces. Worth a guard or a test pinning that `refineToIndexDoc('docs/x/prd.md')` returns `prd.md` even when `docs/x/index.md` exists, so the "shared-directory" contract the docblock advertises is actually enforced rather than incidentally true for deskwork's own index-less feature dirs.

### AUDIT-20260603-24 — `validateMissingArtifactPath` dropped the file-existence gate — it now fires for every path-less pipeline entry, including not-yet-written ones

Finding-ID: AUDIT-20260603-24
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/doctor/validate.ts:337-356` (`validateMissingArtifactPath`)

Pre-39d, this rule only reported an entry when the slug+stage heuristic *resolved to a file that existed on disk* (`if (!(await fileExists(heuristic))) continue;`) — i.e. a genuinely backfillable case. The new body removes that gate entirely: it reports any entry that lacks `artifactPath` and isn't off-pipeline (`isOffPipelineStage` guard only). That broadening is intentional for migration, but it also means a freshly-created entry that legitimately has no on-disk artifact yet (e.g. an `Ideas`/`Drafting` entry whose file hasn't been authored) now produces a `missing-artifact-path` finding on every `--check`, where before it was silent.

Whether this is noise or a true gap depends entirely on whether the creation paths (`/deskwork:add`, ingest) stamp `artifactPath` at creation time — which the diff doesn't show. If they do, the rule is fine; if any creation path leaves `artifactPath` unset until the file is written, every new entry will flag until migrated, and the operator's only documented remedy (Finding 03) won't help a brand-new entry. Recommend verifying the create-side stamps `artifactPath` (and adding a fixture for "new entry, file not yet written" to pin the intended behavior), so this rule's broadened trigger doesn't turn the normal authoring flow into a doctor finding.

## 2026-06-03 — audit-barrage lift (20260603T035609986Z-deskwork-plugin)

### AUDIT-20260603-25 — `lane update --scaffold-default` replaces the entire `scaffoldDefaults` map, and the studio edit-form only surfaces the `markdown` kind — editing a multi-kind lane silently drops the others

Finding-ID: AUDIT-20260603-25
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/core/src/lanes/operations/update.ts:104-119` (whole-map replace) + `packages/studio/src/pages/lanes/edit-form.ts:81-95` (markdown-only field) + `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:217-227` (`buildUpdateCommand`)

This diff promotes the lane's location field from a scalar (`contentDir: string`) to a map (`scaffoldDefaults: Partial<Record<ArtifactKind, string>>`), and the CLI create path explicitly supports multiple kinds (test `accepts repeated --scaffold-default for multiple artifact kinds`, `list-show-create.test.ts:206-220`, producing `{ markdown, image }`). But `updateLane` replaces the **whole** map: `...(opts.scaffoldDefaults !== undefined && { scaffoldDefaults: opts.scaffoldDefaults })` overwrites the key on the `...existing` spread (update.ts:111-117). With a scalar this was natural; with a map it is destructive-merge.

The studio surfaces make this reachable and silent. The edit-form renders only a single `scaffoldMarkdown` input (`edit-form.ts:84-95`); `buildUpdateCommand` emits `--scaffold-default "markdown=<dir>"` (lanes-page.ts:220-226). So an operator editing the markdown dir of a lane that carries `{ markdown: 'docs', image: 'imgs' }` produces an update whose result is `{ markdown: 'newdocs' }` — `image` is dropped with no warning, no diff, no surfacing of the field that was about to be erased. The edit-form can't even *display* the `image` value, so the operator has no way to know it existed.

A reasonable fix: make `updateLane` merge scaffold-default kinds (patch only the supplied keys, preserve the rest) rather than replace the whole map — or, if replace is intended, have the studio edit-form round-trip *every* kind the lane currently carries (render one input per existing kind) so a copy-build update reproduces them. Either way, the CLI's whole-map-replace contract should be documented as a deliberate choice with an explicit "clears unspecified kinds" warning in the `--scaffold-default` help, since the only multi-kind producer (CLI create) and the only GUI editor (studio) now disagree on map semantics.

---

### AUDIT-20260603-26 — `deskwork:lane` SKILL.md is wholesale stale — still documents `--content-dir`, "binds a content directory", and "moves artifact + scrapbook on disk", all retired by this diff

Finding-ID: AUDIT-20260603-26
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `plugins/deskwork/skills/lane/SKILL.md:3,8,19,23,30-31,35,44-45,49,61,70` (not in the diff — should be)

This diff retires `contentDir` from the lane (`types.ts`), replaces the `--content-dir` flag with `--scaffold-default <kind>=<dir>` (`lane.ts`), and converts `lane move` to a metadata-only operation that does NOT relocate the artifact or scrapbook (`move.ts`). The operator-facing SKILL.md that documents this verb was not updated and now contradicts the implementation at nearly every line I checked:

- Description + body: *"Lanes bind a content directory to a pipeline template"* (lines 3, 8) — the central claim the diff dissolves (`types.ts:117` docblock: "A lane carries NO location of its own").
- Synopsis block: `create … --content-dir <path>` and `update … [--content-dir <path>]` (lines 30-31, 44-45) — the flag no longer exists; the CLI now refuses unknown flags and the studio emits `--scaffold-default`.
- `move` docs: *"relocate an entry into another lane (moves artifact + scrapbook on disk)"* (line 23) and *"relocates the artifact + scrapbook on disk"* (line 49) — directly contradicts move.ts:25-37 ("the move is a METADATA change only … both stay exactly where they are").
- Error-handling section still documents the retired *"target artifact already exists"* refusal (line 70), which move.ts deleted along with the relocation/collision logic.

Per the project's documentation-drift discipline and the state-machine rule ("if the implementation changed, did the spec?"), the SKILL.md is an adopter contract and is now actively misleading — an operator copying the documented `--content-dir` command gets an unknown-flag refusal. The fix is to update SKILL.md in the same change that retires the flag: swap `--content-dir` → `--scaffold-default`, rewrite the move semantics to metadata-only, and drop the two now-impossible move refusals.

---

### AUDIT-20260603-27 — `lane move` silently changed from a file-relocating operation to metadata-only, with no migration note or operator-facing surfacing of the behavior change

Finding-ID: AUDIT-20260603-27
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/lanes/operations/move.ts:25-37,177-184` + `packages/core/src/schema/journal-events.ts:167-175` (lane-move docblock)

Before this diff, `deskwork lane move` physically relocated the artifact and scrapbook into the target lane's contentDir; after it, the move only rewrites the sidecar's `lane`/`currentStage` and leaves all files in place (move.ts:25-37). The journal `lane-move` event now emits `fromArtifactPath === toArtifactPath` (move.ts:211-214, 229-232). This is the intended Phase-39 model ("a lane spans whatever directories its entries live in"), and the code/tests are internally consistent — but it is a meaningful semantic reversal for any operator whose mental model (and the still-shipped SKILL.md, finding -02) says move reorganizes files on disk.

The concern is discoverability of the behavior change, not correctness. An operator on an existing project who runs `lane move` expecting their markdown to land under a different directory will instead find it untouched, with only a metadata flip — and nothing in the CLI output signals that the file stayed put. The journal event echoes the same path twice, which to a reader of historical journals (where old `lane-move` events recorded genuinely *different* from/to paths) is ambiguous without the schema docblock context.

A light-touch fix: have the `lane move` CLI result/emit explicitly note "metadata-only; artifact not relocated (lane carries no contentDir)" so the operator isn't left inferring it, and ensure the migration/upgrade notes for Phase 39 call out that `lane move` no longer touches the filesystem. This is informational-adjacent but worth a one-line operator signal given the prior behavior was the headline feature of the verb.

---

I walked the rest of the diff — `collectScaffoldDefaults` argv parsing (two-token and `=`-token forms, malformed/duplicate/empty/unknown-kind rejection paths all look correct, including dirs containing `=`), the `assertSafeContentDir`→`assertSafeScaffoldDir` rename (boundary check preserved per scaffold dir), the journal `LaneCreateEvent` back-compat (`.passthrough()` + optional `contentDir`/`scaffoldDefaults`/`host`), the studio `normalizeScaffoldDefaults` undefined-dropping, the XSS escaping path for the new scaffold-defaults cell, and the large test-fixture migration — and found those clean. My three findings concentrate on the scalar→map semantic gap (the update replace + studio single-kind editor), the un-updated operator-facing SKILL.md, and the under-surfaced move behavior reversal.

## 2026-06-03 — audit-barrage lift (20260603T045354853Z-deskwork-plugin)

### AUDIT-20260603-28 — Doctor content-discovery is now gated on lane `scaffoldDefaults` dirs — content roots not represented by a lane (or adjacent to a bound sidecar) are invisible to orphan/duplicate/legacy-id detection

Finding-ID: AUDIT-20260603-28
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/core/src/content-index.ts:286-380` (`collectLaneScaffoldDirs` / `collectSidecarArtifactDirs` / `buildContentIndexFromSidecars`) + `packages/core/src/doctor/runner.ts:127-139` (`buildContext`) + `packages/core/test/doctor/orphan-frontmatter-id.test.ts:31-46` (fixture now must add a lane)

Pre-39c the doctor walked each site's `contentDir` unconditionally to DISCOVER files, so any markdown under the content root — bound or not — was visible to the "walk the content tree" rules (orphan-frontmatter-id, duplicate-id, legacy-top-level-id). The new `buildContentIndexFromSidecars` discovers roots only from (a) directories of entries that already carry an `artifactPath` and (b) lane `scaffoldDefaults` directories (`collectSidecarArtifactDirs`, content-index.ts:340-360). The orphan test's own fixture change is the tell: it now has to seed a `default` lane with `scaffoldDefaults: { markdown: 'docs' }` (orphan-frontmatter-id.test.ts:31-46) *just so the orphan files are discoverable at all*. That means a not-yet-bound file (orphan / duplicate-id collision / legacy top-level id) sitting in a directory that is neither a lane scaffold root nor the directory of an already-bound entry is now **silently undetectable** — the exact files these rules exist to catch.

This compounds with `bootstrapDefaultLaneIfMissing` deriving its single lane from only the *default* site's `contentDir` (bootstrap.ts:120-135): a fresh install of a multi-site config produces one lane covering one content root, leaving every non-default site's content root dark to discovery. The migration path (`sites-to-lanes-migration`) creates lanes from all sites, so upgrades are covered — but fresh multi-site installs and any partially-migrated project are not. A reasonable fix: have discovery also fall back to walking the *parent* of every discovered root, or have `install` surface "lanes created" coverage so the operator can see which content roots are now lane-backed; minimally, add a doctor finding when a `sites` block names a contentDir that no lane's `scaffoldDefaults` covers, so the coverage gap is loud rather than silent.

### AUDIT-20260603-29 — `ctx.index.byPath` key base silently flipped from contentDir-relative to projectRoot-relative for every doctor rule; only `duplicate-id` is visibly reconciled and no test pins the base

Finding-ID: AUDIT-20260603-29
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `packages/core/src/content-index.ts:290-301` (docblock declaring projectRoot-relative `byPath`) + `packages/core/src/doctor/rules/duplicate-id.ts:64-71` (`join(ctx.projectRoot, relPath)`) + `packages/core/src/doctor/runner.ts:131` (`buildContentIndexFromSidecars`)

`buildContentIndex` produced `byPath` keys via `relative(contentDir, abs)`; `buildContentIndexFromSidecars` produces them via `relative(projectRoot, abs)` (content-index.ts:374, `bindFilesToIndex(..., projectRoot, ...)`). The runner now feeds the latter to *every* rule's `ctx.index`. `duplicate-id` was correctly updated to reconstruct absolutes with `join(ctx.projectRoot, relPath)` and even documents the change (duplicate-id.ts:56-63). The risk is that this is a string→string contract change: any other rule that still does `join(contentDir, relPath)` against the new projectRoot-relative key gets a wrong absolute path with **no compile error and no runtime throw** — it just resolves to a non-existent file and silently under- or mis-reports. The diff contains no inventory, grep, or regression test demonstrating that `duplicate-id` is the *only* `byPath`/`byId` consumer that needed reconciliation.

The 39d note says `file-presence`/`frontmatter-sidecar`/`missing-artifact-path` now resolve via `resolveStoredArtifactPath` (not the index), which narrows the blast radius — but that's an assertion, not evidence in this diff. A cheap, durable fix: add a unit test on `buildContentIndexFromSidecars` asserting a known `byPath` key equals the entry's `artifactPath` verbatim (project-root-relative), and a one-line grep-audit note in the workplan enumerating every `ctx.index.byPath`/`byId` reader confirmed updated. Without that pin, the next rule author who reaches for `ctx.index.byPath` has no signal about which base it carries.

### AUDIT-20260603-30 — `includeArchived` is inconsistent across the new lane consumers — archived lanes drive doctor discovery but not the host imprint or boot banner

Finding-ID: AUDIT-20260603-30
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/content-index.ts:312` (`listLaneConfigs(projectRoot, { includeArchived: true })`) vs. `packages/studio/src/pages/help.ts:60` (`listLaneConfigs(ctx.projectRoot)`) vs. `packages/studio/src/server.ts:730` (`listLaneConfigs(projectRoot)`)

This diff introduces three new `listLaneConfigs` call sites and they disagree on archived-lane inclusion. `collectLaneScaffoldDirs` passes `{ includeArchived: true }` (content-index.ts:312), so an **archived** lane's `scaffoldDefaults` directory still becomes a doctor discovery root — meaning the doctor walks (and can report findings against) content rooted in a lane the operator has explicitly retired. Meanwhile `collectLaneHosts` (help.ts) and the server banner (server.ts) both omit the flag, so archived lanes are correctly excluded there.

Either choice is defensible in isolation, but the inconsistency is a smell: if archived means "retired," its content root probably shouldn't generate fresh orphan/duplicate findings; if archived content must still be validated, the imprint/banner exclusion is the outlier. The likely-correct default is to exclude archived lanes from discovery (matching the other two consumers), and if archived-content validation is genuinely wanted, make that an explicit, documented decision rather than an unremarked `true` buried in a helper. At minimum the three call sites should share one rationale comment so the divergence is intentional rather than incidental.

### AUDIT-20260603-31 — `--fix=calendar-uuid-missing` now silently drops sidecar-less calendar rows via an SSOT regen, with no operator-facing signal that rows were removed

Finding-ID: AUDIT-20260603-31
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/cli/test/doctor.test.ts:523-565` (rewritten expectation: orphan row dropped) — underlying behavior at the calendar-uuid-missing repair + the entry-centric SSOT regen (not in the diff)

The rewritten test documents a real behavior change: running the *scoped* fix `--fix=calendar-uuid-missing --yes` now emits both `calendar-uuid-missing: 1 applied` **and** `calendar-regenerated`, and a hand-written calendar row with no backing sidecar is reconciled away (`expect(reread.entries.find((e) => e.slug === 'flushable')).toBeUndefined()`, doctor.test.ts:560-564). Under the single-project-calendar model where the calendar is a derived projection of sidecars, dropping a sidecar-less row is arguably correct — but an operator who asked only to backfill a missing UUID and instead has a calendar row deleted has no explicit signal that a row was *removed*; they have to infer it from the presence of `calendar-regenerated` in stdout.

This brushes against the project's "content databases preserve, they don't delete" discipline: the row is being removed because it has no SSOT backing, which is justifiable, but the deletion is a side effect of a narrowly-scoped fix and isn't called out. A light fix: have the regen repair report a count of rows reconciled-away (e.g. `calendar-regenerated: dropped 1 orphan row (no backing sidecar)`) so the removal is auditable in the CLI output, and ensure the Phase-39 migration notes mention that scoped calendar fixes can trigger a full SSOT reconciliation. This keeps the (correct) behavior while making it loud instead of silent.

## 2026-06-03 — audit-barrage lift (20260603T084321043Z-deskwork-plugin)

### AUDIT-20260603-32 — Journal's "0 open at session end" violates the project's own AUDIT-03 quantitative-reporting convention — omits the slush-pile that this same commit creates

Finding-ID: AUDIT-20260603-32
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `DEVELOPMENT-NOTES.md` (Phase 39 entry, "Quantitative" → *"Audit findings: 5 (barrage on 39b) + 7 (39.0 barrage, folded into spec) — all dispositioned; 0 open at session end."*) vs. `docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md` (the four new `AUDIT-20260603-28..31` blocks, all `Status: acknowledged-slush-pile-2026-06-03`)

The same commit that writes *"0 open at session end"* in the journal also **appends four fresh findings to the audit-log** — AUDIT-20260603-28 (medium), -29 (medium), -30 (low), -31 (low) — every one marked `acknowledged-slush-pile-2026-06-03`, i.e. parked-but-unfixed. The hook-run-log line added in this same diff (`"disposition":"fired-and-slushed"` for run `20260603T045354853Z`) confirms a barrage fired this session and its output was slushed. The journal's "Audit findings" count (`5 + 7`) does not include these four, and the "0 open" headline omits them entirely. Counting the prior same-day slush entries already in the file (AUDIT-26 medium, -27 low), the 2026-06-03 slush-pile carries **at least 3 MEDIUM** real defects (notably AUDIT-28: doctor content-discovery silently blind to unbound files; AUDIT-29: `byPath` base flip with no regression pin).

This is the precise failure mode the project's own `CLAUDE.md` AUDIT-03 convention was written to prevent: *"'0 open' alone is misleading when acknowledged-slush-pile findings include real unfixed defects (the dampener parks them; that's a process choice, not a resolution)."* The convention prescribes the honest form: `Open findings at session end: N (M acknowledged-slush-pile carrying unfixed defects: AUDIT-X, AUDIT-Y)`. The fix is to rewrite the Quantitative "Audit findings" line to report the slush-pile count + HIGH/MEDIUM breakdown (at minimum naming AUDIT-28/-29 as MEDIUM carried-forward defects), so a future reader can't mistake a parked-but-real defect for a resolved one.

### AUDIT-20260603-33 — Internal version inconsistency: "39.0 — resync to lanes v0.34.0" (journal) vs. "39.0 (resync to lanes v0.35.0)" (README), committed together

Finding-ID: AUDIT-20260603-33
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `DEVELOPMENT-NOTES.md` (bullet *"**39.0 — resync to lanes v0.34.0.**"*) vs. `docs/1.0/001-IN-PROGRESS/deskwork-plugin/README.md` (Phase-39 row *"39.0 (resync to lanes v0.35.0; superseded #394/#396 dropped)"*) — and the journal heading *"resync to v0.35.0"*

Two docs written in the same commit disagree on which version the 39.0 resync targeted. The journal *heading* and the README both say **v0.35.0**; the journal *accomplished bullet* says **v0.34.0**. The surrounding narrative (`reset --hard origin/main` … then *"rebased the branch onto v0.35.0"* after #399's fix shipped) suggests the resync baseline was main's then-current state and the rebase later brought v0.35.0 — which would make "39.0 — resync to lanes v0.34.0" the defensible literal and the README's "39.0 (resync to lanes v0.35.0)" the conflation. Either way, a future reader auditing "what baseline did Phase 39 start from" gets two different numbers for the same task ID from two files committed atomically. Reconcile to one version (or split the bullet into "resync to v0.34.0 main → rebased onto v0.35.0") so the resync baseline is unambiguous.

### AUDIT-20260603-34 — Known-degraded `feature-dev:code-architect` Write/Edit fix recorded as a journal IOU with a "when convenient" deferral and no tracking issue

Finding-ID: AUDIT-20260603-34
Status:     resolved-2026-06-03 — filed as [#400](https://github.com/audiocontrol-org/deskwork/issues/400); the "when convenient" IOU is replaced by that tracking issue per the disposition the finding prescribes.
Severity:   low
Surface:    `DEVELOPMENT-NOTES.md` (Phase-39 entry, "Next session recommendation" → *"**Open thread:** the `feature-dev:code-architect` Write/Edit fix is local-only (reverts on a marketplace update) — lay down the durable project-owned agent + agent-discipline rule when convenient."*) and the matching note in the Accomplished section (*"durable options … still open"*)

The entry records a real degraded state — a third-party plugin agent was hand-patched to grant Write/Edit, and that patch *"reverts on a marketplace update"* — but its only disposition is *"lay down the durable … rule **when convenient**."* Per `.claude/rules/agent-discipline.md` ("Just for now is bullshit… no will-fix-later deferrals"), every such concern must end in one of four dispositions: addressed now, **filed as a GitHub issue with link**, scoped into a verified downstream dispatch, or an explicit operator decision with acceptance criteria. A journal "open thread" + *"when convenient"* is none of these — it's the IOU-in-a-comment pattern relocated to the journal, and *"when convenient"* is exactly the deferral phrase the discipline names as defaulting to never. The fix is to file a GitHub issue for the durable project-owned-agent replacement and reference it here, replacing the *"when convenient"* hedge with the issue link.

---

I also checked, and found clean: the appended `hook-run-log.jsonl` line (well-formed JSON, `fired-and-slushed` is an existing enum value, consistent with prior lines); the README documentation-rot rule does **not** apply here (this is internal `docs/1.0/001-IN-PROGRESS/` feature tracking, where version-bound text is explicitly permitted, not adopter-facing); and the four audit-log blocks themselves are internally consistent and correctly anchored to real surfaces (I did not re-litigate their dispositions, per the audit-log-excerpt instruction). My three findings concentrate on the one place a docs-only commit can still mislead: the honesty of the session's self-reported audit accounting and two internal inconsistencies.

## 2026-06-03 — audit-barrage lift (20260603T093102687Z-deskwork-plugin)

### AUDIT-20260603-35 — `shortform-start` is classified as resolving an existing entry's `artifactPath`, but it CREATES a new shortform file whose path-composer (`resolveShortformFilePath`) is being retired with no replacement

Finding-ID: AUDIT-20260603-35
Status:     resolved-2026-06-03 — folded into the design (§ "39c-2b design amendment" of the spec; shortform-start reclassified as a create-verb composing from the parent's artifactPath dir). Operator chose "amend the design" (option a).
Severity:   medium
Surface:    `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` § "CLI-verb resolution migration" (existing-entry verb list) + § "`add`-time path composition" (Retires the slug-template family) — and workplan.md:1948-1951 (39c-2b)

The migration section sorts the 11 verbs into exactly two patterns: "resolve via `entry.artifactPath`" (existing entry) or "compose-then-stamp via `scaffoldDefaults[K]`" (`add`, a new entry). `shortform-start` is placed in the **existing-entry** bucket. But `shortform-start` does not act on the parent entry's main artifact — per its own skill description it *"Creates a markdown file in the entry's scrapbook"*, i.e. it creates a NEW file at a path that was previously computed by `resolveShortformFilePath` (which the same design explicitly retires: *"Retires the slug-template family … `resolveShortformFilePath`"*). Resolving `entry.artifactPath` yields the parent's longform path (e.g. `posts/foo/index.md`), not a scrapbook destination for the new shortform draft.

So the new shortform file's destination is composed by neither pattern: it is not an existing-entry resolution (the file doesn't exist yet) and it is not the `add --lane X --kind K` scaffold path (shortform-start is a distinct verb with scrapbook-relative semantics). This is the exact gap that blocked 39c-2 originally — a resolution path under-mapped by the spec. As written, the terminal deletion step (delete `resolveShortformFilePath`) cannot land green because `shortform-start` would have no path source. A reasonable fix: add a third composition rule for `shortform-start` (scrapbook destination derived from the parent's `artifactPath` directory + a shortform layout), and move `shortform-start` out of the "resolve via `entry.artifactPath`" list, since it is a create-verb, not an act-on-existing verb.

### AUDIT-20260603-36 — `rename-slug` "moves the file and rewrites `artifactPath` to the new location" without specifying how the new location is derived from old path + new slug — which inherently requires the layout knowledge being retired

Finding-ID: AUDIT-20260603-36
Status:     resolved-2026-06-03 — folded into the design (§ "39c-2b design amendment"; rename-slug derives the new path by layout detection from the stored artifactPath). Operator chose "amend the design" (option a).
Severity:   medium
Surface:    `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` § "CLI-verb resolution migration" (`rename-slug` note: *"renaming moves the file and rewrites `entry.artifactPath` to the new location; it no longer recomputes a path from a template"*)

`rename-slug` is the one existing-entry verb whose target path is a *function of the slug*. To rename `old-slug` → `new-slug`, the new on-disk location must be derived: `posts/old-slug/index.md` → `posts/new-slug/index.md` (index/readme layout, replace the directory component) versus `posts/old-slug.md` → `posts/new-slug.md` (flat layout, replace the filename stem). The spec says rename "no longer recomputes a path from a template" and simply "rewrites `artifactPath` to the new location" — but it never says how that new location is computed. Deriving it from the stored `artifactPath` + new slug requires knowing which path component encodes the slug, i.e. the layout — the precise machinery (`layoutToContentRelativePath` / the slug-template family) the design retires.

This leaves `rename-slug` underspecified: an implementer cannot derive the new path without re-introducing layout awareness, and a naive "string-replace old-slug with new-slug in artifactPath" is fragile (breaks if the slug substring appears elsewhere in the path, or if the directory and filename disagree). The fix is to specify the rename derivation explicitly — e.g. detect the layout from the stored `artifactPath` shape and re-apply `layoutToContentRelativePath(detectedLayout, newSlug)` against the same parent directory — and acknowledge that `rename-slug` is the verb that keeps a slug→path dependency even after the template family is gone.

### AUDIT-20260603-37 — "Zero behavior change" / "byte-for-byte identical" cutover claim is false for any adopter who customized `blogFilenameTemplate` away from `{slug}/index.md`

Finding-ID: AUDIT-20260603-37
Status:     resolved-2026-06-03 — folded into the design (§ "39c-2b design amendment"; "zero behavior change" claim scoped to default-template adopters + migration maps custom blogFilenameTemplate to a layout / halts loudly). Operator chose "amend the design" (option a).
Severity:   medium
Surface:    `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` § "`add`-time path composition" (*"Defaulting layout to `index` keeps every adopter's `add` byte-for-byte identical after the `sites` retirement"* and Decisions-log rows 11/12)

The design defends defaulting layout to `index` with a strong claim: defaulting to `index` keeps *"every adopter's `add` byte-for-byte identical"* because it *"matches the current `{slug}/index.md` template default."* But the artifact being retired is named `blogFilenameTemplate` — a *template* with a *default*, which by construction means adopters could override it. Any project that set `blogFilenameTemplate` to a non-default value (e.g. `{slug}.md` flat, or a custom shape) will NOT get a byte-for-byte-identical `add` after the cutover — they will silently get the new fixed global `index` default instead of their configured layout. The claim holds only for adopters who left the template at its default.

This is the silent-regression failure mode the project's no-fallbacks discipline exists to catch, except here it's the *removal* of a configurable surface replaced by a hardcoded default. Two gaps: (1) the "zero behavior change" claim should be scoped to *default-template adopters*, not "every adopter"; (2) there is no doctor detection specced for "config has a non-default `blogFilenameTemplate`" so the migration cannot warn the affected adopters or carry their custom layout forward. Minimally, the cutover (`doctor --fix`) should detect a non-default `blogFilenameTemplate` and either map it to the corresponding `--layout` default or fail loudly — consistent with row 13's "missing scaffoldDefaults fails loudly" stance.

### AUDIT-20260603-38 — The "11 `resolveSite` callers" inventory is internally inconsistent between the workplan DISCOVERY note and the spec migration section — `rename-slug`'s bucket shifted and the arithmetic doesn't reconcile

Finding-ID: AUDIT-20260603-38
Status:     resolved-2026-06-03 — folded into the design (§ "39c-2b design amendment"; canonical consumer roster published: 10 CLI command files + 2 core modules). Operator chose "amend the design" (option a).
Severity:   low
Surface:    `workplan.md` 39c-2 DISCOVERY note (*"11 CLI-verb callers (publish/induct/shortform-start/add/cancel/approve/ingest/distribute/block/iterate)"*) vs. spec § "CLI-verb resolution migration" (*"The 11 `resolveSite` callers split into two…"* with existing-entry list of 9 including `rename-slug`, + `add` + `ingest`)

The two documents both assert "11" but disagree on membership. The workplan DISCOVERY parenthetical lists **10** names (publish, induct, shortform-start, add, cancel, approve, ingest, distribute, block, iterate) under "11 CLI-verb callers," and places `rename-slug` in a *separate* "slug-template family" consumer list — not among the `resolveSite` callers. The spec migration section reaches 11 by counting 9 existing-entry verbs (which now **includes** `rename-slug`) + `add` + `ingest`. So `rename-slug` migrated from the slug-template-family bucket into the `resolveSite`-callers bucket between the two docs, and the original 10-name list never named the 11th caller.

This is a count/inventory drift, not a logic bug, but it matters: an implementer working from "migrate the 11 `resolveSite` callers" against the workplan's 10-name list will be one short and has no authoritative roster of which 11 functions to touch. The fix is to publish one canonical, enumerated list of the 11 callers (with `rename-slug` explicitly in or out) in a single place and reference it from both docs, so the terminal "delete `resolveSite`/`siteConfig`" step has a verifiable completion check rather than a number that doesn't match its own enumeration.

---

I also checked and found clean: the `layoutToContentRelativePath` mapping (index/readme/flat → `<slug>/index.md` / `<slug>/README.md` / `<slug>.md`) is internally consistent between spec and workplan; the "missing `scaffoldDefaults[K]` fails loudly" decision (row 13) correctly honors the no-fallbacks rule; the Decisions-log additions (rows 11–14) trace to the prose; and the "Open sub-question (captured, not blocking)" about a per-lane `defaultLayout` is legitimate capture-mode recording, not a will-fix-later code deferral, so it is not a discipline violation.

## 2026-06-03 — audit-barrage lift (20260603T095004094Z-deskwork-plugin)

### AUDIT-20260603-39 — `layoutToContentRelativePath` hardcodes the `.md` extension, so `add --kind {html-mockup,single-file-html,image}` stamps a markdown `artifactPath` onto a non-markdown artifact

Finding-ID: AUDIT-20260603-39
Status:     fixed-2c5d35a3f2a683f804c89a44b67c7011bca1acbd
Severity:   high
Surface:    `packages/core/src/lanes/scaffold-path.ts:52-64` (`layoutToContentRelativePath`) + `:83-105` (`composeAddArtifactPath`) + `packages/cli/test/add-lane-stage-integration.test.ts:178-180`

`composeAddArtifactPath` selects the directory by `kind` (`lane.scaffoldDefaults?.[kind]`, line 89) but then composes the filename via `layoutToContentRelativePath(layout, slug)`, which is **kind-blind** and hardcodes `.md` for every layout (`${slug}/index.md`, `${slug}/README.md`, `${slug}.md`). `ArtifactKind` (`types.ts:104-108`) is one of `markdown | html-mockup | single-file-html | image`, and the kind docblocks are explicit about shape: `html-mockup` is *"a directory containing `index.html`"* (`types.ts:90`), `single-file-html` is *"a loose `.html` file"* (`:93-94`). So `add --kind html-mockup` stamps `…/design-x/index.md` as the entry's authoritative `artifactPath` for an artifact that lives at `…/design-x/index.html`, and `--kind image` stamps `…/<slug>/index.md` for an image. Since the comment in `scaffold-path.ts:6-9` declares this path *"authoritative (resolution never recomputes it),"* every downstream consumer (publish, distribute, doctor, studio resolution) will read the wrong on-disk location for these kinds.

The integration test at `add-lane-stage-integration.test.ts:178-180` doesn't catch this — it *locks the bug in*: it asserts `sidecar['artifactPath']` is `'content/mockups/design-x/index.md'` for `--kind html-mockup`. Per `.claude/rules/testing.md` ("tests that don't test the contract they claim"), this is a test asserting the implemented behavior rather than the kind's actual on-disk contract. A reasonable fix: make the layout→relative-path mapping kind-aware (the extension and `index`-filename must derive from the kind — `index.html` for `html-mockup`, a bare `<slug>.html` for `single-file-html`, and `image` likely shouldn't accept a layout at all), and change the integration test to assert `index.html` for the html-mockup case.

---

### AUDIT-20260603-40 — `composeAddArtifactPath` joins with `node:path.join`, producing platform-dependent separators inconsistent with the forward-slash paths `layoutToContentRelativePath` emits

Finding-ID: AUDIT-20260603-40
Status:     fixed-2c5d35a3f2a683f804c89a44b67c7011bca1acbd
Severity:   medium
Surface:    `packages/core/src/lanes/scaffold-path.ts:29` (`import { join } from 'node:path'`) + `:104` (`return join(directory, relativePath)`)

`layoutToContentRelativePath` deliberately emits POSIX-separated relative paths (`${slug}/index.md`, lines 57-62), and every test asserts forward-slash `artifactPath` values (`'docs/first-post/index.md'`, `'src/content/blog/my-post/index.md'`). But line 104 composes the final value with `node:path.join`, whose separator is platform-dependent — on Windows it returns `directory\slug\index.md` (and re-normalizes the `/` from the relative part to `\`). The result is a stored `artifactPath` whose separator convention silently differs by OS, breaking string-equality with the slug/host-relative paths the rest of the system stores and compares (and the test-suite would fail on Windows). `join` also silently normalizes `..` and collapses duplicate slashes, which can mask a malformed `scaffoldDefaults` directory rather than surfacing it.

Because `artifactPath` is declared authoritative and persisted to the sidecar, a separator mismatch is durable, not transient. The fix is to compose with an explicit forward-slash join (e.g. `posix.join` from `node:path` or a literal `` `${directory}/${relativePath}` `` with a single-slash guard), consistent with how `layoutToContentRelativePath` already hardcodes `/`. Whichever is chosen, the convention should be the same on both sides of the join.

---

### AUDIT-20260603-41 — `add` stamps a lanes-composed `artifactPath`, but `scaffoldBlogPost` still derives the on-disk location via the retiring sites-based `resolveSite`/`resolveBlogFilePath` — verify the file-creating path honors the stamped value

Finding-ID: AUDIT-20260603-41
Status:     fixed-2c5d35a3f2a683f804c89a44b67c7011bca1acbd
Severity:   medium
Surface:    `packages/cli/src/commands/add.ts:155-167` (compose + stamp) vs. `packages/core/src/scaffold.ts:27` (`import { resolveSite, resolveBlogFilePath } from './paths.ts'`) — still present after the refactor

This diff introduces a second, parallel path-composition system. `add` now composes `artifactPath` from `lane.scaffoldDefaults[kind]` (lanes-based) and stamps it as authoritative, while `scaffoldBlogPost` in `scaffold.ts` continues to compute its on-disk target from `resolveSite` + `resolveBlogFilePath` (the sites-based machinery the 39c retirement is removing). The refactor only extracted the shared `layoutToContentRelativePath` helper (scaffold.ts:183-194 deleted, now imported from `scaffold-path.ts`); the *directory* source on the two paths still differs — lanes `scaffoldDefaults` vs. sites `contentDir`. If any code that actually creates the content file goes through `scaffoldBlogPost`/`resolveBlogFilePath` rather than reading the entry's stamped `artifactPath`, the stamped path and the created file diverge for any lane whose `scaffoldDefaults[markdown]` ≠ the legacy `sites.main.contentDir`.

The diff doesn't include the file-creating caller, so I can't confirm the divergence fires — but the surface is exactly the cross-cutting seam this sub-task touches, and it isn't shown as updated. The check the operator should run: confirm that the verb which materializes the artifact on disk (draft/scaffold) reads `entry.artifactPath` and does **not** recompute via `resolveBlogFilePath`. If it recomputes, that recomputation must be retired in lockstep with this stamp, or `add`'s "authoritative" claim is false the moment the file is written somewhere else.

---

I also checked and found clean: the pre-write ordering (`composeAddArtifactPath` is called inside its own try/catch *before* `writeCalendar`, add.ts:158-167, so a missing-default lane aborts with no disk mutation — the integration test at lines 360-393 verifies calendar.md stays untouched); the loud-error path (names lane id + kind + the real `lane update --scaffold-default` remediation command, which exists per `lane.ts:11,185`); the `--layout` flag validation (rejects out-of-set values pre-write with exit 2, mirroring `--kind`/`--source`); and the single-source-of-truth refactor (`scaffold.ts` correctly re-exports `ScaffoldLayout` and imports the mapping helper rather than duplicating it). My three findings concentrate on the kind-blindness of the composer, separator portability, and the unverified seam between the new stamp and the old file-creating path.

## 2026-06-03 — audit-barrage lift (20260603T095847400Z-deskwork-plugin)

### AUDIT-20260603-42 — Decision #17 introduces a new required `--artifact-path` CLI flag for `image` kind, but no promoted task scopes adding it — and the AUDIT-39 fix breaks `add --kind image` the moment it lands without it

Finding-ID: AUDIT-20260603-42
Status:     fixed-2c5d35a3f2a683f804c89a44b67c7011bca1acbd (addendum 2026-06-03: the `--artifact-path` flag this finding scoped was REVERTED in the markdown-only correction; the underlying concern — image has no path source — is now resolved by `add` rejecting image. Net: resolved-by-removal.)
Severity:   high
Surface:    spec `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` § "39c-2b design amendment" Decision #17 + AUDIT-39 table (`image | — | — | not templatable`) vs. `workplan.md` Task 39.6 acceptance criteria + `packages/cli/src/commands/add.ts:158-194` (no `--artifact-path` flag)

Decision #17 says *"`add --kind image` requires an explicit `--artifact-path <path>`; absent → fail loudly."* This is a **brand-new CLI flag** — I verified `add.ts` has no such flag today (the only path source is `composeAddArtifactPath(lane, artifactKind, entry.slug, layout)` at `add.ts:166`, which currently produces `<slug>/index.md` for *every* kind including image). Task 39.6 is the only promoted task covering AUDIT-39, and its Step list / acceptance criteria mention only "kind-aware layout mapping" and "assert `index.html` for html-mockup" — nothing about adding, validating, help-texting, or testing a `--artifact-path` flag.

This is the exact under-mapping failure mode that made 39c-2 STOP, recurring: the moment the AUDIT-39 fix makes `image` "not templatable," the image branch has **no path source at all** unless `--artifact-path` lands in the same change. A fix that removes the (wrong) `<slug>/index.md` composition for image without simultaneously adding the flag leaves `add --kind image` with no way to produce an `artifactPath` — a regression worse than the bug. The flag is integral to the fix, not optional polish. The fix: add an explicit Step + acceptance-criterion to Task 39.6 for the `--artifact-path` flag (parse, validate, fail-loud-when-absent-for-image, help text, test), so "implement the fix" doesn't silently swallow a new required CLI surface.

---

### AUDIT-20260603-43 — AUDIT-38's "canonical consumer roster" names `rename-slug` as a distinct verb in the three-bucket prose but files it only as a core module — there is no `rename-slug` CLI command, so the roster the amendment published to *end* the count drift still can't locate the verb's call site

Finding-ID: AUDIT-20260603-43
Status:     resolved-2026-06-03 — spec roster clarified: rename-slug has no CLI command (core helper only). Doc-only; acknowledged in this commit.
Severity:   medium
Surface:    spec § "CLI-verb resolution migration" (4th bullet: *"`rename-slug`: a slug→path verb…"*) vs. § "AUDIT-38 — canonical consumer roster" (CLI command files (10) — `rename-slug` absent; Core modules (2): `rename-slug.ts`)

The three-bucket classification lists `rename-slug` as a peer **verb** with its own resolution pattern (4th bullet, alongside `add`, the existing-entry verbs, and `ingest`). But the "canonical consumer roster" — the artifact AUDIT-38 published *specifically to end the 11-vs-10 count drift* — lists `rename-slug` only under **Core modules** (`rename-slug.ts`), and the 10 CLI command files do **not** include it. I confirmed there is no `rename-slug` command file under `packages/cli/src/commands/` (grep for `rename-slug|renameSlug` returns no CLI matches; only the core `packages/core/src/rename-slug.ts` exists).

So the roster has the same shape of gap it claims to fix: an implementer working "migrate the `rename-slug` verb's resolution" against the roster finds a core module but no CLI entry point, and the AUDIT-36 amendment's new behavior (detect-layout-from-`artifactPath` → recompose → move → rewrite) has no enumerated *task* and no CLI call site in the roster. Either `rename-slug` is core-only (then the prose should not list it as a CLI **verb** peer and should say "invoked by core helper, no CLI command") or there is a CLI surface the roster omits. As written, the roster's completion check ("zero `resolveBlogPostDir` references remain") is verifiable, but the *which-files-to-touch* enumeration that AUDIT-38 promised is still one entry ambiguous.

---

### AUDIT-20260603-44 — Per-kind default layout + "`--layout` still overrides" lets `single-file-html --layout index` produce a directory-shaped path that contradicts the kind's documented "loose `.html` file" contract — legal layouts per kind are unconstrained

Finding-ID: AUDIT-20260603-44
Status:     fixed-2c5d35a3f2a683f804c89a44b67c7011bca1acbd (addendum 2026-06-03: the per-kind legal-layout matrix this finding scoped was REVERTED in the markdown-only correction; moot — markdown's three layouts are all legal and there is no other kind. Resolved-by-removal.)
Severity:   medium
Surface:    spec § "AUDIT-39 (HIGH)" table + bullets (*"The default layout is per-kind … `--layout` still overrides"*) vs. `packages/core/src/lanes/types.ts:93-94` (`single-file-html` — *"a loose `.html` file (not inside an html-mockup directory)"*)

The amendment defines a per-kind default layout (single-file-html → `flat` → `<slug>.html`) but explicitly preserves *"`--layout` still overrides."* It places **no constraint on which layouts are legal for which kind**. Passing `add --kind single-file-html --layout index` therefore composes `<slug>/index.html` — a *directory containing index.html*, which is byte-for-byte the html-mockup shape and directly contradicts single-file-html's docblock ("a loose `.html` file, **not inside an html-mockup directory**"). Conversely `--kind html-mockup --layout flat` yields a loose `<slug>.html`, contradicting html-mockup's "a directory containing index.html."

This is the same class of bug AUDIT-39 itself names — a kind stamped with an on-disk shape its contract forbids — except reintroduced through the override axis rather than the markdown-hardcode axis. The amendment moved the extension to be kind-derived but left the filename *pattern* (`index`/`readme`/`flat`) fully orthogonal to the kind. The fix: specify the legal layout set per kind (markdown: all three; html-mockup: `index`/`readme` only; single-file-html: `flat` only; image: none) and reject out-of-set `(kind, layout)` combinations pre-write with exit 2, mirroring how `parseScaffoldLayout` (`scaffold-path.ts:112-117`) already rejects unknown layout *values*. Otherwise the "kind-aware composition" still allows a self-contradicting artifactPath.

---

### AUDIT-20260603-45 — Decisions log keeps #12 ("global `index` default") un-superseded alongside #16 ("per-kind default"), and `scaffold-path.ts:47` still cites #12 — a reader of either the log or the code comment gets the pre-amendment rule

Finding-ID: AUDIT-20260603-45
Status:     resolved-2026-06-03 — Decision #12 marked superseded-by-#16 in the spec; scaffold-path.ts docblock cites #16. Doc/comment-only; acknowledged in this commit.
Severity:   low
Surface:    spec § Decisions log rows #12 and #16 (both present, #12 not struck) + `packages/core/src/lanes/scaffold-path.ts:44-49` (`DEFAULT_SCAFFOLD_LAYOUT` docblock cites *"design Decision #12"*)

Decision #16 ("Default layout is per-kind … refining the earlier global-`index` default") is added without striking or annotating Decision #12 ("Default layout = `index` (`<slug>/index.md`)"). Both rows now coexist in the log as standalone decisions; #16's rationale references #12 in prose but the #12 row itself still reads as the operative global rule. The drift compounds in code: `scaffold-path.ts:44-49` documents `DEFAULT_SCAFFOLD_LAYOUT = 'index'` and cites *"design Decision #12"* as its authority — a citation that is now only correct for `markdown`, and stale for html-mockup/single-file-html/image once the AUDIT-39 fix lands.

This is documentation-consistency rather than a logic bug, but it's the rot-vector the project's spec-is-canonical rules exist to catch: the next reader who lands on Decision #12 or the `DEFAULT_SCAFFOLD_LAYOUT` comment implements the global default and never sees #16. Fix: mark Decision #12 as superseded-by-#16 in the log (the project's decisions-log convention should show supersession, not silent coexistence), and update the `scaffold-path.ts:47` comment to cite #16 when Task 39.6 touches that file — same-commit, per the state-machine/design-standards "update the spec citation in lockstep" discipline.

---

I also checked and found clean: the three new workplan tasks (39.6/39.7/39.8) correctly apply the Option-D discipline — only 39.6 (HIGH) carries the Step 0 working-code-invariant + Step 1b regression-lock pair, while the two mediums get the single bug-repro test, consistent with "HIGH+ findings get a regression-lock test"; the `hook-run-log.jsonl` appends are well-formed JSON with valid enum dispositions (`no-new-diff-skip`, `fired-and-slushed`, `fired-and-promoted`); the AUDIT-37 inline scoping edit (the "byte-for-byte identical" claim is now correctly narrowed to *"adopters who left `blogFilenameTemplate` at its default"* with a ⚠️ pointer to the migration mapping table) properly resolves the prior finding; and the AUDIT-40 amendment's `node:path/posix.join` prescription is a real, correct API. My findings concentrate on the one unscoped new CLI surface (`--artifact-path`), the residual roster ambiguity around `rename-slug`, the unconstrained kind×layout override matrix, and a stale decision-citation pair.

## 2026-06-03 — audit-barrage lift (20260603T102824932Z-deskwork-plugin)

### AUDIT-20260603-46 — Image `--artifact-path` is stamped verbatim with zero normalization, bypassing the POSIX/relative invariant the same commit establishes for composed paths (AUDIT-40)

Finding-ID: AUDIT-20260603-46
Status:     resolved-2026-06-03 — MOOT: `add` is now markdown-only (operator correction); the image `--artifact-path` branch is removed, so there is no verbatim image path to normalize.
Severity:   high
Surface:    `packages/cli/src/commands/add.ts` (image branch: `artifactPath = artifactPathFlag;`, ~`:218-221`) + the `--kind image requires --artifact-path` validation (~`:148-156`) vs. `packages/core/src/lanes/scaffold-path.ts:215-218` (`posix.join` for composed paths)

The same commit that introduces AUDIT-40's invariant — *"`artifactPath` is persisted and string-compared against the forward-slash paths the rest of the system stores, so the join uses `node:path/posix`"* (scaffold-path.ts docblock + `posix.join` at the composed-path return) — opens a hole in that invariant for the `image` kind. For image, the path is taken straight from `--artifact-path` and stamped verbatim (`artifactPath = artifactPathFlag;`) with no normalization, no separator coercion, and no relative-path check. The new test only exercises a clean input (`'assets/images/hero.png'`), so the gap is unguarded.

Concretely: `add --kind image --artifact-path "assets\images\hero.png"` (a backslash path, the exact platform divergence AUDIT-40 names as durable) stamps backslashes into the sidecar; `--artifact-path /abs/path.png` stamps a non-relative path while every composed path is project-root-relative; and `--artifact-path ''` (empty) passes the `=== undefined` guard and stamps an empty `artifactPath`. All three are durable, written-to-disk divergences from the convention the rest of the system relies on for string-equality resolution — the *same* failure class AUDIT-40 was filed to close, reintroduced through the verbatim axis. The fix: run the image path through the same POSIX/relative normalization-or-rejection the composer guarantees (reject backslashes/absolute pre-write with exit 2, reject empty), so "all stamped artifactPaths are forward-slash and relative" holds for every kind, not just templatable ones.

---

### AUDIT-20260603-47 — Kind-aware stamp escalates the AUDIT-41 seam from "possible divergence" to "guaranteed divergence" for non-markdown kinds — `scaffoldBlogPost` is markdown-only and nothing guards the mismatch

Finding-ID: AUDIT-20260603-47
Status:     resolved-2026-06-03 — resolved exactly as this finding's mitigation recommended: `add` now refuses non-markdown kinds (fail loud, exit 2). No non-markdown entry can be created, so the stamp-vs-markdown-materializer divergence cannot occur.
Severity:   medium
Surface:    `packages/core/src/lanes/scaffold-path.ts:152-160` (`layoutToContentRelativePath` now hardcodes `'markdown'`, "Retained for the legacy file-creating `scaffoldBlogPost` path … which only ever scaffolds markdown") vs. `add.ts` stamping `<slug>/index.html` for `--kind html-mockup`

AUDIT-41 was dispositioned by proving `add` creates no content file (the stamp is a forward reference; materialization migration is "sub-task (a)"). That disposition was sound when the stamp was uniformly `.md` — for the only kind the materializer handles (markdown), the stamped extension and the file-creator's extension *agreed*, so the deferred divergence was limited to the directory. This commit changes the shape: the stamp is now kind-aware (`html-mockup → …/index.html`, `single-file-html → ….html`), while `layoutToContentRelativePath`/`scaffoldBlogPost` remains markdown-only by construction (it hardcodes `'markdown'`). So a non-markdown entry's stamped path can *never* be honored by the verb that materializes the file — the extension mismatch is now guaranteed, not merely possible.

This is not re-litigating AUDIT-41's disposition; it's flagging that the underlying shape regressed. The diff ships a feature (`add --kind html-mockup/single-file-html`) that stamps an authoritative path the materialization layer is structurally incapable of producing, with no doctor rule, no test, and no guard preventing an operator from creating such an entry and later hitting a file-at-wrong-location. The minimum mitigation that doesn't widen scope: either gate `add` to refuse non-markdown kinds until sub-task (a) lands (fail loud, per the no-fallbacks rule), or file the seam as a tracked issue referenced from the `layoutToContentRelativePath` docblock — *"only ever scaffolds markdown"* is a latent contradiction with a kind-aware stamp and should not travel as an unguarded comment.

---

### AUDIT-20260603-48 — AUDIT-42 (severity HIGH, substantive source change) is shaped as a "(non-bug)" doc-only disposition in workplan Task 39.9, bypassing the Option-D regression-lock task structure a HIGH source bug warrants

Finding-ID: AUDIT-20260603-48
Status:     resolved-2026-06-03 — MOOT: the AUDIT-42 `--artifact-path` source change was reverted with the kind-aware attempt; there is no longer a HIGH source change to re-shape. (The promote-findings non-bug-vs-bug shaping concern is noted for the tooling backlog.)
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` Task 39.9 (`(non-bug)` label + *"This finding's surface is non-source (docs, registry, markers…)"*) vs. the actual AUDIT-42 fix in `packages/cli/src/commands/add.ts:131-191` (new flag, parse, validate, branch) + 4 new integration tests

Task 39.9 is titled `(non-bug)` and its boilerplate asserts *"This finding's surface is non-source (docs, registry, markers, commit-history, or process feedback). The disposition below is the substantive action taken — not a code change verified by a failing test."* That classification is contradicted by the task's own body and by the diff: AUDIT-42 (severity **high**) landed a genuine CLI surface — the `--artifact-path` flag with parsing, mutually-exclusive validation against `--layout`, fail-loud-when-absent-for-image, and four new tests in `add-lane-stage-integration.test.ts`. The task even says *"a real code change verifiable by test."* So the "(non-bug)/non-source" framing is wrong.

The consequence isn't cosmetic: by being shaped as a 3-step non-bug disposition, the HIGH fix skipped the Option-D task structure (Step 0 working-code invariant + Step 1 bug-repro + Step 1b regression-lock + Step 2 pre-fix-fail confirmation) that the project's own audit-discipline applies to HIGH+ source findings — the same structure correctly applied to 39.6 and newly applied to 39.11 (AUDIT-44). The tests that landed are happy-path/rejection assertions, not a confirmed-failing-then-green pair anchored at the finding's surface. The fix: re-shape Task 39.9 as a real fix-finding task (it produced source), or, if the workplan's auto-promotion mis-classified it, note that the promoter mapped a HIGH source finding to the non-bug template — a promote-findings shaping bug worth its own correction so the next HIGH source finding doesn't silently skip the regression-lock discipline.

## 2026-06-03 — audit-barrage lift (20260603T144020922Z-deskwork-plugin)

### AUDIT-20260603-49 — Workplan adds Tasks 39.13–39.15 as open fix-tasks for findings the SAME commit's audit-log resolves as MOOT — zombie tasks that will strand an implementer

Finding-ID: AUDIT-20260603-49
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` (added Tasks 39.13/39.14/39.15) vs. `docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md` (added AUDIT-46/47/48, all `Status: resolved-2026-06-03 — MOOT`)

The same commit ships two contradictory dispositions for AUDIT-46/47/48. The audit-log diff adds all three with `resolved-2026-06-03 — MOOT` ("the image `--artifact-path` branch is removed, so there is no verbatim image path to normalize"; "`add` now refuses non-markdown kinds … the divergence cannot occur"; "the AUDIT-42 `--artifact-path` source change was reverted … there is no longer a HIGH source change to re-shape"). But the workplan diff *simultaneously* adds Task 39.13 (`Closes AUDIT-20260603-46`), Task 39.14 (`Closes AUDIT-20260603-47`), and Task 39.15 (`Acknowledges AUDIT-20260603-48`) as **unchecked** fix-tasks with full TDD step lists ("Step 1: write failing test exercising the bug … anchor at the file:line cited in the finding's Surface").

Those tasks are unimplementable as written. Task 39.13 instructs an implementer to anchor a failing test at `add.ts` "image branch: `artifactPath = artifactPathFlag;` ~`:218-221`" and `--kind image requires --artifact-path` validation `~:148-156` — code paths this very commit deleted (the `add.ts` diff removes both). Task 39.14 points at "`add.ts` stamping `<slug>/index.html` for `--kind html-mockup`" — also removed. An agent running `/dw-lifecycle:implement` will pick Task 39.13, fail to locate the cited surface, and burn a session on a finding already closed two files over. The fix: strike/remove Tasks 39.13–39.15 (or mark them resolved-by-removal mirroring the audit-log), since promote-findings scoped them from the pre-revert tip and the revert mooted them in the same commit. As-is, the workplan and audit-log disagree about whether three findings are open.

---

### AUDIT-20260603-50 — AUDIT-45's audit-log resolution narrative is now false after the revert — it claims the docblock cites Decision #16, but the spec restored #12 and the code cites #12

Finding-ID: AUDIT-20260603-50
Status:     acknowledged-slush-pile-2026-06-03
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/audit-log.md` AUDIT-20260603-45 Status line (NOT updated in this diff) vs. `docs/superpowers/specs/2026-06-02-sites-to-lanes-retirement-design.md` § "AUDIT-45 — MOOT" + Decisions log #12 (now "OPERATIVE") + `packages/core/src/lanes/scaffold-path.ts` `DEFAULT_SCAFFOLD_LAYOUT` docblock (now cites #12)

AUDIT-45's audit-log Status reads `resolved-2026-06-03 — Decision #12 marked superseded-by-#16 in the spec; scaffold-path.ts docblock cites #16.` That resolution describes the pre-revert world. This commit reverses it: the spec's Decisions log now reads `12 | Default layout = index … OPERATIVE (the #16 supersession was reverted)` and `16 | ~~Default layout is per-kind~~ REVERTED (see #12, restored)`, and the `scaffold-path.ts` docblock the audit-log points at now says *"Per design Decision #12 this is a single GLOBAL default. (The superseding per-kind Decision #16 was retired…)"*. So the audit-log's own description of how AUDIT-45 was resolved — "marked superseded-by-#16", "docblock cites #16" — is now the exact opposite of the live state.

This is the spec-is-canonical rot-vector the project's `state-machine.md`/`design-standards.md` rules exist to catch: a future reader auditing AUDIT-45's resolution against the code finds the audit-log asserting `#16` while the code cites `#12`, and can't tell which document is authoritative. Unlike AUDIT-46/47/48 (which got fresh MOOT addenda in this diff), AUDIT-45's entry was left untouched. The fix: append a revert addendum to AUDIT-45's Status line in the audit-log — same form as the AUDIT-42/44 addenda this commit already wrote — noting that #16 was reverted, #12 is operative again, and the docblock now correctly cites #12.

---

### AUDIT-20260603-51 — `composeAddArtifactPath` validates `kind !== 'markdown'` and throws, but `add.ts` already rejected non-markdown with a different message — two divergent rejection sites for one condition; the `kind` param is now validated-then-ignored

Finding-ID: AUDIT-20260603-51
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/cli/src/commands/add.ts` (the `if (artifactKind !== 'markdown') { fail(...) }` guard, ~`:134-142`) + `packages/core/src/lanes/scaffold-path.ts` (`if (kind !== 'markdown') { throw … }`, ~`:104-110`)

The markdown-only gate is now enforced in two places with two different messages. `add.ts` fails first (`--kind "${artifactKind}" is not supported: deskwork add only supports markdown entries right now …`, exit 2 via `fail()` which returns `never`), so `composeAddArtifactPath`'s internal throw (`deskwork add currently supports only markdown entries; artifact kind "${kind}" is not yet supported …`) is unreachable from the CLI — it fires only under direct unit-test calls. The `kind: ArtifactKind` parameter of `composeAddArtifactPath` is therefore validated-then-ignored: every reachable call passes `'markdown'`, the function rejects anything else, and the value is never used to vary behavior (the extension is hardcoded `.md` in `layoutToContentRelativePath`).

This is a maintenance hazard rather than a runtime bug: the duplicated guard means a future change that relaxes the `add.ts` gate (e.g. to add html-mockup support) would silently surface the *core's* different error message, and the two messages would need to be kept in sync. It also leaves a vestigial parameter that reads as "this function is kind-generic" when it is markdown-only. A cleaner shape: drop the `kind` parameter from `composeAddArtifactPath` (it composes markdown paths; the kind-gate is an `add`-verb policy decision, not a path-composition concern) and keep a single rejection site in `add.ts`. The diff already removed the per-kind machinery; this is the last vestige of it in the signature. (If the param is deliberately retained as a future-multi-kind seam, a one-line comment saying so would prevent the next reader from "simplifying" it away — but per the project's no-IOU rule, a seam with no consumer is itself a deferral.)

---

### AUDIT-20260603-52 — AUDIT-40 docblock claims "all stamped artifactPaths are forward-slash," but the `directory` component from `scaffoldDefaults['markdown']` is `posix.join`-ed verbatim with no separator normalization

Finding-ID: AUDIT-20260603-52
Status:     acknowledged-slush-pile-2026-06-03
Severity:   low
Surface:    `packages/core/src/lanes/scaffold-path.ts` (`return posix.join(directory, relativePath)`, ~`:130`) + the docblock's POSIX-join paragraph

The revert correctly keeps the AUDIT-40 fix: `relativePath` is built with hardcoded `/` separators and the join uses `node:path/posix`. But `posix.join` does **not** convert backslashes in its inputs to forward slashes — it only joins with `/`. The `directory` argument comes straight from operator config (`lane.scaffoldDefaults['markdown']`, set via `deskwork lane … --scaffold-default markdown=<dir>`) with no normalization in this module. So a Windows operator who configures `--scaffold-default markdown=content\blog` gets `posix.join('content\\blog', 'my-post/index.md')` → `content\blog/my-post/index.md` — backslashes stamped into the sidecar, violating the very "persisted path must be POSIX-separated for cross-OS string-equality" invariant the docblock asserts as guaranteed.

This is the same failure class AUDIT-40 names, surviving on the `directory` axis (AUDIT-40 closed it on the `relativePath` axis; AUDIT-46 was filed for the image axis and is now moot). It predates this diff, but the diff is the one whose docblock now makes the absolute claim *"`artifactPath` is persisted and string-compared against the forward-slash paths the rest of the system stores"* — a claim the code only partially backs. Worth either (a) normalizing the `directory` component (`directory.split('\\').join('/')` before the join, or rejecting backslashes pre-write), or (b) confirming the lane `--scaffold-default` setter already validates POSIX form and citing that as the guarantee. I could not confirm the setter's validation from this diff, so the invariant is unverified at this surface.

---

I also checked and found clean: the markdown-only guard fires pre-`readCalendar`/`writeCalendar`, and both new integration tests (`rejects --kind html-mockup`/`--kind image`) assert exit 2 *and* `calendarRaw not contains` the rejected slug, so the no-disk-mutation contract is genuinely covered; the `default-when-`--kind`-omitted` path resolves to `markdown` (confirmed indirectly — the "no markdown scaffoldDefault" test omits `--kind` and asserts stderr contains both `nomd` and `markdown`, which only the scaffold-default-missing message carries, not the markdown-guard message); the export removals in `index.ts` (`composeRelativePath`/`defaultLayoutForKind`/`legalLayoutsForKind`/`isLayoutLegalForKind`) are matched by removals in `scaffold-path.ts` and the test file's import list, so no dangling re-export; and the `SCAFFOLD_LAYOUTS`/`DEFAULT_SCAFFOLD_LAYOUT` unit tests correctly pin the three legal markdown layouts after the matrix removal. My findings concentrate on the workplan↔audit-log disposition contradiction (the highest-value signal — it will actively misdirect an implementer), the stale AUDIT-45 resolution narrative, the duplicated/vestigial kind-gate, and the unverified directory-normalization edge of the AUDIT-40 invariant.

## 2026-06-04 — audit-barrage lift (20260604T165135628Z-deskwork-plugin)

### AUDIT-20260604-01 — body-state.ts's `PLACEHOLDER_MARKER` contract is now orphaned — the diff reworded the comment to survive the `scaffoldBlogPost` deletion instead of re-evaluating it; no `src/` path emits the marker and nothing in `src/` calls `bodyState()`

Finding-ID: AUDIT-20260604-01 (claude-01 + codex-02; cross-model)
Status:     fixed-fe848e1024bdeaad9308749e53b6db9e467ec715
Severity:   medium
Surface:    `packages/core/src/body-state.ts:5-7,25,49` (comment rewordings + `PLACEHOLDER_MARKER` + `bodyState()`) vs. the deleted `packages/core/src/scaffold.ts`

This diff deletes `scaffold.ts` as dead code (correct — its only callers were tests). `scaffoldBlogPost` was the **sole writer** of the body-placeholder marker `'<!-- Write your post here -->'`. I grepped the whole tree: `"Write your post here"` / `PLACEHOLDER_MARKER` now appear only in `body-state.ts` (the definition), `body-state.test.ts`, and `USAGE-JOURNAL.md` — **zero `src/` emitters**. I also grepped for `bodyState(` across `**/src/**`: the only hit is the definition itself (the live studio dashboard test that consumed it is `describe.skip`, per `packages/studio/test/dashboard-bodystate.test.ts:90`, "count + reviewState badge instead"). So both the marker and the function it powers are now test-only artifacts.

Rather than acknowledge that, the diff reworded the docblock from *"The scaffold produced by `scaffoldBlogPost` writes an H1…"* to *"A blog-post scaffold writes an H1…"* and the marker comment from *"written by scaffoldBlogPost"* to *"a blog-post scaffold writes"* (`body-state.ts:5-7,25`). That's the documentation-drift failure mode the project rules name: a comment edited to *describe a scaffolder that no longer exists in the codebase*, papering over the fact that the contract has no producer. The honest dispositions are either (a) delete `body-state.ts` as dead code the same way `scaffold.ts` was deleted, or (b) if it's retained for a future materializer, the comment must say "no current code path emits this marker; retained for <named consumer>" — not invent a generic "a blog-post scaffold" that doesn't exist. As written, a future reader will trust the comment and assume something still produces the marker.

---

### AUDIT-20260604-02 — `renameSlug` now hard-depends on the entry's sidecar existing; an entry with a calendar row but no sidecar file throws a raw `readSidecarSync` ENOENT, bypassing the actionable `doctor --fix` guidance the function provides for every other drift case

Finding-ID: AUDIT-20260604-02 (claude-02 + claude-03 + claude-04 + claude-05 + codex-01 + codex-03; cross-model)
Status:     fixed-ef5c061602f8293820e105061ac831c39fbe3fb8
Severity:   high
Surface:    `packages/core/src/rename-slug.ts:170-176` (`readSidecarSync(projectRoot, entry.id)` then the `sidecar.artifactPath === undefined` guard)

The flip replaces the calendar+slug-template resolution (`resolveBlogPostDir`) with `const sidecar = readSidecarSync(projectRoot, entry.id)`. The code then carefully handles two drift cases with `doctor --fix`-style errors: `artifactPath === undefined` (`rename-slug.ts:172-176`) and `artifactPath` not on disk (`:185-189`). But it does **not** handle the case where the sidecar *file itself* is absent — `readSidecarSync` will throw a raw `ENOENT` (or a schema-parse error) before either guard runs. Previously `renameSlug` never read the sidecar at all; it operated off the calendar entry + `resolveBlogPostDir`, so an entry with no sidecar still renamed. This is a new failure mode: a calendar entry that predates sidecar adoption, or whose sidecar was deleted, now crashes rename with an unactionable fs error instead of the "run `deskwork doctor --fix`" message the operator needs.

The function already validates `entry.id` exists (`:143-147`) for exactly this defensive reason; the sidecar-existence check is the obvious companion. Minimum fix: wrap the `readSidecarSync` call (or precede it with a `sidecarPath` existence check) and map the absent-sidecar case to the same `doctor --fix` guidance the `artifactPath === undefined` branch already emits. The new `rename-slug.test.ts` seeds the sidecar in every case (`seed()` always writes `${UUID}.json`), so the no-sidecar path is untested — the gap is invisible to the suite.

---

### AUDIT-20260604-03 — The new sync `writeSidecarSync` duplicates `writeSidecar` (async) with the same mkdir/tmp/write/rename shape, but no `clones.yaml` entry was added — while the analogous read.ts async/sync pair *was* dispositioned (`f2aa9e0ff153`) in this very diff

Finding-ID: AUDIT-20260604-03
Status:     acknowledged-non-bug-2026-06-04 — jscpd does NOT detect the write.ts async/sync pair (verified: `check-clones` reports 0 NEW; the pair is below jscpd's match threshold), so there is no clone-id to disposition in clones.yaml. The asymmetry with the read.ts pair (`f2aa9e0ff153`) is benign: read.ts tripped jscpd, write.ts didn't. Added a docstring hedge on `writeSidecarSync` cross-referencing the read.ts disposition so a future `refresh-clones-baseline` that surfaces it has the rationale. Non-bug; no code defect.
Severity:   low
Surface:    `packages/core/src/sidecar/write.ts:18-34` (`writeSidecarSync`) vs. `writeSidecar` (`:8-16`); `.dw-lifecycle/scope-discovery/clones.yaml` (added `f2aa9e0ff153` for `sidecar/read.ts:25-34 ↔ :47-56`, no write.ts sibling)

This diff adds `writeSidecarSync` as an explicit sync mirror of `writeSidecar` — same `EntrySchema.safeParse` validation, same `sidecarPath`, same `mkdir`/`${path}.<pid>.tmp`/`write`/`rename` atomic-write sequence, differing only in sync-vs-async fs calls. That is the identical "async-sync sibling" shape the diff *did* register and disposition for `read.ts` (clone `f2aa9e0ff153`, `keep-with-reason`: *"residual readFile-vs-readFileSync + ENOENT mapping cannot share a call across the async/sync boundary"*). The write-side pair got no `clones.yaml` entry. Either jscpd's threshold didn't trip on the ~12-line write block (in which case the asymmetry is benign but worth a one-line note so a future `refresh-clones-baseline` doesn't surface it as a surprise NEW clone), or the detector missed it and the project's clone-discipline has a gap for the exact same shape it just dispositioned two files over. Given the project explicitly tracks this async/sync-sibling pattern, the write.ts pair should carry the same `keep-with-reason` disposition for consistency, so the two siblings are documented identically rather than one tracked and one invisible.

## 2026-06-04 — audit-barrage lift (20260604T172614738Z-deskwork-plugin)

### AUDIT-20260604-04 — Duplicate Task ID — two `### Task 39.15` headings now coexist in the workplan

Finding-ID: AUDIT-20260604-04 (claude-01 + claude-04 + codex-02; cross-model)
Status:     fixed-2026-06-04 — renumbered the two newcomer collisions (AUDIT-01 39.15→39.20, AUDIT-04 39.17→39.21); no duplicate `### Task 39.NN` headings remain. Root cause is a promote-findings auto-numbering bug (doesn't account for task IDs already present from prior promotes/sessions) — filed as a tooling issue, not a per-promote whack-a-mole.
Severity:   high
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:2177` (`Task 39.15 (fix-finding-AUDIT-20260604-01)`) collides with `:2267` (`Task 39.15 (fix-finding-AUDIT-20260603-48)`)

This diff inserts three new tasks (39.15/39.16/39.17 for AUDIT-20260604-01/02/03) immediately *before* the pre-existing Task 39.13. But the workplan already contained a `Task 39.15 (fix-finding-AUDIT-20260603-48)` further down (verified live at `workplan.md:2267`). The result is two headings both numbered **39.15** — one for AUDIT-20260604-01, one for AUDIT-20260603-48 — and a non-monotonic ordering (`39.15, 39.16, 39.17, 39.13, 39.14, 39.15-again, …`). The auto-positioner the project relies on (the `workplan-archive-ledger` comment, named in the `archive-phases` skill) picked `39.15` without detecting it was already taken.

This is the exact "workplan↔audit-log disposition contradiction" class that prior audit entries (AUDIT-20260603-50 and the codex sibling note) called the **highest-value signal** because it actively misdirects an implementer: `/dw-lifecycle:implement` and `promote-findings` reference tasks by their numeric ID, and "go do Task 39.15" is now ambiguous between an orphaned-marker fix and a duplicate-clone acknowledgement. The fix is to renumber the newly-inserted tasks to the next free IDs after the highest existing one (39.18/39.19/39.20, or whatever the ledger's true high-water mark is) and update the three `Closes`/`Acknowledges` task headers + the commit-trailer references to match.

---

### AUDIT-20260604-05 — `renameSlug`'s bare `catch` reclassifies a corrupt/invalid sidecar as "no sidecar on disk" — a misleading message that sends the operator to the wrong remedy

Finding-ID: AUDIT-20260604-05 (claude-02 + codex-01; cross-model)
Status:     fixed-f6481bfa6658a3ba8bf2c047d6398f884ed0481d
Severity:   high
Surface:    `packages/core/src/rename-slug.ts:170-176` (the `try { sidecar = readSidecarSync(...) } catch { throw new Error("…has a calendar row but no sidecar on disk…") }`)

`readSidecarSync` throws for **three** distinct reasons, verified at `packages/core/src/sidecar/read.ts:43-56` + `parseSidecar:7-19`: (a) `ENOENT` → `"sidecar not found: <path>"`, (b) malformed JSON → `"sidecar JSON invalid at <path>"`, (c) schema-invalid → `"sidecar schema invalid at <path>: …"` (plus any other fs error re-thrown raw at `:53`). The new fix catches **all** of them with a bare `catch {` and replaces every case with `"…has a calendar row but no sidecar on disk — run \`deskwork doctor --fix\`"`. So an entry whose sidecar file *exists but is corrupt* (truncated write, hand-edit that broke the schema, partial atomic-rename) is now reported as *missing*. The operator is told the file is absent when it is present-but-broken — and `doctor --fix` reconciling a "missing" sidecar may take a different repair path than fixing a corrupt one, so the guidance can be actively wrong.

The original finding AUDIT-20260604-02 explicitly flagged this: *"a raw `readSidecarSync` ENOENT (**or a schema-parse error**)"*. The fix addressed the ENOENT half and swallowed the parse-error half into the same misleading branch. The correct shape mirrors `read.ts`'s own discrimination: catch, inspect, and only map the *not-found* case (match on `error.message.startsWith('sidecar not found')`, or better, check `existsSync(sidecarPath(...))` before the read) to the `doctor --fix` guidance — and **re-throw** JSON/schema-invalid errors unchanged so the operator sees "sidecar JSON invalid at …", which points at the real problem. The new test at `rename-slug.test.ts:124-147` only seeds a calendar-row-with-no-file, so the corrupt-sidecar misclassification is invisible to the suite.

---

### AUDIT-20260604-06 — The fix that deletes `body-state.ts` leaves a stale cross-reference to it in `remark-strip-outline.mjs` — the same doc-drift failure mode the finding named, re-created by the fix

Finding-ID: AUDIT-20260604-06
Status:     fixed-f6481bfa6658a3ba8bf2c047d6398f884ed0481d
Severity:   medium
Surface:    `packages/core/src/remark-strip-outline.mjs:15` (`Matches the line-based stripper in \`body-state.ts\`; kept independent here`) vs. the `body-state.ts` deletion in this diff

AUDIT-20260604-01's whole point was that comments must not describe code that no longer exists. The disposition correctly deletes `body-state.ts` AND correctly updates `outline-split.ts:40-44` (the comment there was rewritten from *"mirrors the line-wise logic in `scripts/lib/editorial/body-state.ts`"* to a self-contained note). But it **missed a second comment** that points at the same now-deleted file: `remark-strip-outline.mjs:15` still reads *"Matches the line-based stripper in `body-state.ts`; kept independent here because mdast traversal beats regex on structured content."* I verified live — `body-state.ts` is gone, yet this kept-source file still tells a future reader to go compare against it. That is precisely the "comment describing a thing that no longer exists in the codebase" drift the finding flagged, re-introduced by the cleanup itself.

The fix is one edit: reword `remark-strip-outline.mjs:15` to drop the `body-state.ts` reference the same way `outline-split.ts` was (e.g. *"Independent mdast-based stripper; mdast traversal beats regex on structured content."*). The asymmetry — one of the two sibling outline-stripper comments updated, the other not — also signals the deletion's blast radius wasn't fully grepped before commit. (The `cli/test/review-lifecycle-integration.test.ts:114` hit is narrative-only and harmless; this `.mjs` one is the live drift. I confirmed there are zero `import … body-state` statements anywhere, so the build is not broken — this is purely the doc-drift residue.)

---

## 2026-06-04 — audit-barrage lift (20260604T184059813Z-deskwork-plugin)

### AUDIT-20260604-07 — Task 39.19 (AUDIT-06) is scaffolded as a TDD bug-fix task, but the fix is a comment-only reword no test can exercise — the exact non-bug-shape mismatch AUDIT-20260603-48 already flagged

Finding-ID: AUDIT-20260604-07 (claude-01 + claude-02 + claude-03 + claude-04 + codex-01 + codex-02 + codex-03; cross-model)
Status:     acknowledged-slush-pile-2026-06-04 (PARTIALLY ADDRESSED — see addendum)
Severity:   medium
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md` (`### Task 39.19 (fix-finding-AUDIT-20260604-06)` block) vs. the actual fix in `packages/core/src/remark-strip-outline.mjs:11-15`

> **Addendum 2026-06-04 (dampener engaged → consolidated entry slushed, but two bundled sub-findings were self-caused by THIS turn's design-pass commit `ba430400` and fixed immediately rather than parked):**
> - **codex-01 (medium) — README/state drift:** the c5 design-pass commit marked the workplan/spec done but left the feature `README.md` status row saying "Remaining: (c5) design pass." FIXED: README row rewritten to "(c5) design pass DONE" with the next-step implementation list. (The DEVELOPMENT-NOTES "Resume: 39c-2b(c5)" line is a prior session's append-only journal recommendation — NOT rewritten; the next session-end entry reflects the new state.)
> - **claude-03 (medium) — c3 spec capture gap:** Decision #22's "key on `entryId` equality" would collapse an entry's co-resident longform + per-platform shortform workflows. FIXED: spec §"c3" + Decision #22 now specify the full dedup key `(entryId, kind, channel?)` with the kind/channel discriminator preserved.
> - **Remaining bundled items stay slushed (pre-existing #420 promote-findings churn, not this turn's work):** codex-02 / claude-01 (Task 39.19 doc-only fix wrongly scaffolded as TDD-bug + Task 39.21 `Closes` vs `Acknowledges`), claude-02 / codex-03 (39.18/39.19 checkbox drift atop flipped status), claude-04 (non-monotonic 39.NN heading order, downstream of #420). Real but bookkeeping-class; the dampener's slush is the mechanized disposition and they belong to the #420 fix, not the sites-retirement design pass.

The fix for AUDIT-06 is a pure documentation-drift reword: the comment in `remark-strip-outline.mjs` drops the stale `body-state.ts` cross-reference (`Matches the line-based stripper in body-state.ts` → `Uses mdast traversal`). There is no behavioral contract to test — the `.mjs` stripper's runtime behavior is identical before and after. Yet Task 39.19 is scaffolded with the full TDD bug shape: *"Step 1: write failing test exercising the bug,"* *"Step 2: confirm test fails against current code,"* and an acceptance criterion *"Failing test exists at `(to be filled in by Step 1 implementer)`."* These steps are uncheckable for a comment reword, and indeed Step 1's test-path criterion is left `[ ]` while the audit-log Status was flipped to `fixed-f6481bfa`.

This is the identical mismatch that AUDIT-20260603-48 surfaced (a HIGH source change shaped as `(non-bug)`), only inverted: here a doc-only change got the TDD-bug shape instead of the `(non-bug)` disposition shape used correctly for 39.17 (AUDIT-03) and 39.21 (AUDIT-04). The fix is to re-shape Task 39.19 as `(non-bug)` with a disposition-prose step and an `Acknowledges`/`Closes`-with-no-test acceptance criterion, matching how the project handles doc-drift dispositions elsewhere. As written, the workplan claims a failing test should exist for a change that cannot have one — a future implementer or auditor reading the unchecked Step-1 boxes can't tell whether the TDD walk was skipped legitimately (no test possible) or skipped improperly.

## 2026-06-04 — audit-barrage lift (20260604T204822463Z-deskwork-plugin)

### AUDIT-20260604-08 — `loadLaneConfig(sidecar.lane, …)` throws on a named-but-unresolvable lane — rename crashes AFTER the filesystem + calendar are already mutated, and the "skip when unset" contract only covers `lane === undefined`

Finding-ID: AUDIT-20260604-08 (claude-01 + claude-03 + codex-01; cross-model)
Status:     fixed-9e2e2bc3f5cdc5d1a62b7757d16ef91f0fc2fff0
Severity:   high
Surface:    `packages/core/src/rename-slug.ts:248-256` (the `sidecar.lane !== undefined ? loadLaneConfig(sidecar.lane, projectRoot).redirectsPath : undefined` block) + the step-4 placement after `writeCalendar` (`:236`)

The new redirect resolution guards exactly one unset shape — `sidecar.lane === undefined` → skip. But when `sidecar.lane` IS present, the code calls `loadLaneConfig(sidecar.lane, projectRoot)` unconditionally, and `loadLaneConfig` is a **throwing resolver**: the new test fixture itself seeds a `pipelines/editorial.json` precisely because "loadLaneConfig's pipeline cross-validation resolves" — i.e. it throws when the lane config file is absent OR its pipeline template can't be resolved. So a sidecar that names a lane whose config was archived/purged (there's a `deskwork:lane archive`/`purge` skill), or a legacy sidecar carrying a stale `lane` string, now crashes `renameSlug` with a raw lane/pipeline-resolution error instead of skipping the optional redirect step. This is the identical failure class the project already fixed twice this session for the sidecar read (AUDIT-20260604-02/-05): an *optional* metadata lookup that throws on a drift case it should tolerate.

Worse, the throw lands at **step 4**, after step-3 `writeCalendar` (`:236`) and after the artifact files were already moved on disk. The rename has fully mutated the filesystem and the calendar, then crashes on a redirect-config read that the spec itself calls optional ("skipping is the correct unset behavior, NOT an error"). The operator sees a hard error on a rename that actually succeeded, and a re-run hits "oldSlug not found" — exactly the misleading half-completed state the c4 design tried to avoid.

The fix mirrors the read.ts discrimination the project already adopted: resolve the lane defensively (existence-check the lane config, or catch and only swallow the not-found case) and map an unresolvable lane to a *skip* of the redirect append — never a throw — because a renamed entry whose lane is gone is still a valid rename. Re-throwing only makes sense if the lane is present-but-corrupt AND you decide that's an operator-actionable error; defaulting the whole branch to crash on any lane-resolution failure is the bug.

### AUDIT-20260604-09 — Test suite is blind to the named-but-unresolvable-lane crash — all three new c4 tests seed a fully-valid lane, so the throwing path ships untested

Finding-ID: AUDIT-20260604-09
Status:     fixed-9e2e2bc3f5cdc5d1a62b7757d16ef91f0fc2fff0
Severity:   medium
Surface:    `packages/core/test/rename-slug.test.ts:221-280` (the three `39c c4 lane.redirectsPath` cases) — `seedLane('main', …)`, `seedLane('main')`, and no-lane

The three new tests cover exactly the three benign shapes: (a) lane with `redirectsPath` → append, (b) lane without `redirectsPath` → skip, (c) no lane on the sidecar → skip. Every case either seeds a complete on-disk lane (via `seedLane`, which also depends on the seeded `pipelines/editorial.json`) or omits the lane entirely. None exercises the case in AUDIT-BARRAGE-claude-01: `sidecar.lane` set to a lane id with **no** `lanes/<id>.json` on disk, or a lane whose `pipelineTemplate` can't resolve. That is the realistic upgrade/drift scenario (archived lane, purged lane, legacy sidecar), and it is precisely the path that crashes.

This is the same observation prior findings made about the sidecar tests (AUDIT-20260604-02: "seeds the sidecar in every case … so the no-sidecar path is untested"). The redirect-resolution gained a new throwing dependency (`loadLaneConfig`) and the suite added zero coverage for that dependency failing. A regression test that seeds a sidecar with `lane: 'ghost'` and no `lanes/ghost.json`, asserting `renameSlug` completes and merely skips the redirect (not throws), would both pin the intended contract and fail against the current implementation.

### AUDIT-20260604-10 — Existing lane files skip the new `redirectsPath` migration and then the legacy source is dropped

Finding-ID: AUDIT-20260604-10
Status:     fixed-9e2e2bc3f5cdc5d1a62b7757d16ef91f0fc2fff0
Severity:   medium
Surface:    `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:306-344`

The migration only copies legacy `site.redirectsPath` when creating a brand-new lane. If `.deskwork/lanes/<slug>.json` already exists, `if (existsSync(target)) continue;` at `:307-308` bypasses `laneFromSite`, so the new `redirectsPath` field is never merged into the lane. The rule then proceeds to `dropSitesBlock(ctx.projectRoot)` at `:344`, removing the only remaining copy of the legacy redirect path.

This can happen on a repair rerun or any partially migrated project where lane files exist before this c4 code runs. The new test only exercises fresh lane creation, so it cannot catch this loss path. The migration needs an existing-lane branch that preserves operator-authored lane data while adding `redirectsPath` when the legacy site has one and the lane lacks it, or it must halt instead of dropping `sites`.

### AUDIT-20260604-11 — Invalid legacy `redirectsPath` is silently omitted instead of failing like live config parsing

Finding-ID: AUDIT-20260604-11
Status:     fixed-9e2e2bc3f5cdc5d1a62b7757d16ef91f0fc2fff0
Severity:   medium
Surface:    `packages/core/src/doctor/legacy-config.ts:66-69` and `packages/core/src/doctor/legacy-config.ts:152-159`

`readLegacySites` reads `redirectsPath` through `readString`, which returns `undefined` for every non-string or empty-string value. That means a present but invalid legacy `sites.<slug>.redirectsPath` is treated exactly like an absent value and omitted from the new lane at `:155-159`. Live config parsing rejects that same shape loudly in `packages/core/src/config.ts:306-313`.

Because the migration later removes the legacy `sites` block, this can silently discard a malformed-but-present redirect configuration instead of telling the operator to repair it. For `redirectsPath`, “present but invalid” should be a migration error, not an omitted optional. The focused fix is to validate `redirectsPath` when the key exists, matching `parseSiteConfig`’s non-empty-string rule.

### AUDIT-20260604-12 — `SiteConfig.redirectsPath` still documents the old runtime owner

Finding-ID: AUDIT-20260604-12
Status:     acknowledged-2026-06-04 (non-bug doc-only reword; SiteConfig.redirectsPath docblock now marked LEGACY MIGRATION INPUT ONLY — no runtime change, no test possible)
Severity:   low
Surface:    missing from diff: `packages/core/src/config.ts:67-70`

The implementation moves rename redirects to `LaneConfig.redirectsPath`, and the workplan explicitly says `SiteConfig.redirectsPath` is kept only for migration read until terminal deletion. But the retained `SiteConfig` comment still says “The slug-rename helper appends 301 redirects here when an existing post is renamed” at `config.ts:67-70`.

That is now false: `renameSlug` reads `loadLaneConfig(sidecar.lane).redirectsPath` instead. This is documentation drift in a live type definition, and it points future maintainers back toward the retired site-owned model. Reword the comment to mark it as legacy migration input only.

## 2026-06-04 — audit-barrage lift (20260604T210215230Z-deskwork-plugin)

> **Addendum 2026-06-04 (dampener engaged → these slushed, but all four are self-caused defects in the SAME-turn fix commit `9e2e2bc3`, so they were ADDRESSED immediately rather than parked — the dampener slushes bookkeeping churn, not flaws in the deliverable being built):**
> - **AUDIT-13 (MED) — FIXED:** the AUDIT-08 fix used an `existsSync` guard that tolerated a missing lane file but still crashed on a present-but-unresolvable lane (purged pipeline). Changed to best-effort resolution: `loadLaneConfig` wrapped in try/catch → ANY resolution failure skips the optional redirect (resolving `redirectsPath` is optional website metadata; a corrupt/unresolvable lane is surfaced by the lane-config doctor rules, not by crashing a valid rename). Added a purged-pipeline test + converted the corrupt-JSON test from "throws" to "completes + skips" (`rename-slug.test.ts`). Pre-mutation, so still no partial-apply.
> - **AUDIT-14 (MED) — NON-BUG for the current schema (documented, not code-changed):** the AUDIT-10 merge reads via `loadLaneConfig` then re-writes. `LaneConfigSchema` is `.strict()` with NO `.default()` fields, so a successfully-loaded lane carries exactly its on-disk valid fields ($rationale included) and an unknown key would have THROWN at load (strict) — not been silently stripped. The "reshape operator file" scenario is therefore unreachable; `commitLaneConfig` re-validates via the same `safeParse` gate the create branch uses. Added a clarifying comment recording why the round-trip is faithful.
> - **AUDIT-15 (LOW) — FIXED:** hoisted the duplicate `readString(siteObj, 'redirectsPath')` in the AUDIT-11 guard into a single `const`.
> - **AUDIT-16 (LOW) — FIXED:** Task 39.25's acceptance criterion mis-stated the expected status as `fixed-<sha>`; corrected to `acknowledged-2026-06-04` (matching the non-bug audit-log state).

### AUDIT-20260604-13 — AUDIT-08 fix tolerates a *missing* lane file but still hard-fails a rename when the lane's pipeline is purged — asymmetric handling of the same optional lookup

Finding-ID: AUDIT-20260604-13
Status:     acknowledged-slush-pile-2026-06-04
Severity:   medium
Surface:    `packages/core/src/rename-slug.ts:248-256` (the `existsSync(laneConfigPath(...))` guard) + `packages/core/test/rename-slug.test.ts:289-331`

The fix discriminates "skip vs throw" purely on **file presence**: `if (existsSync(laneConfigPath(projectRoot, sidecar.lane)))` then `loadLaneConfig(...)`. But `loadLaneConfig` throws on *two* drift shapes, confirmed at `loader.ts:155-167` and its docblock (`:160-167`): (a) the lane file is absent, and (b) the lane file is present but its `pipelineTemplate` does not resolve. The `existsSync` guard only covers (a). A lane whose config file still exists while its referenced pipeline was deleted (`/deskwork:pipeline delete`) or archived still passes `existsSync`, reaches `loadLaneConfig`, and throws — so `renameSlug` hard-fails.

That is the exact failure class AUDIT-08 set out to eliminate. The finding's own tolerate-list named "archived/purged" lanes, and the spec rationale retained in the code (`rename-slug.ts:262-266`) says the redirect append is *optional* website metadata — "a renamed entry whose lane is gone is still a valid rename." A renamed entry whose lane's *pipeline* is gone is equally valid: the only thing the lane is consulted for here is the optional `redirectsPath`. Blocking the whole rename on an unresolvable pipeline is disproportionate and asymmetric with the missing-file case. The regression-lock test (`:316`) only exercises corrupt JSON, classifying it as operator-actionable; the purged-pipeline path ships untested and throwing. A focused fix would wrap the `loadLaneConfig` call in a try/catch that maps *any* resolution failure to a skip of the optional append (resolving `redirectsPath` is best-effort), rather than gating on `existsSync` alone.

### AUDIT-20260604-14 — AUDIT-10 merge round-trips the operator's existing lane file through the Zod schema and rewrites it — contradicting the "preserving operator-authored fields" claim, and skipping the schema-validation gate the create path uses

Finding-ID: AUDIT-20260604-14
Status:     acknowledged-slush-pile-2026-06-04
Severity:   medium
Surface:    `packages/core/src/doctor/rules/sites-to-lanes-migration.ts:306-334`

The merge does `const existing = loadLaneConfig(slug, ctx.projectRoot);` then `commitLaneConfig(ctx.projectRoot, slug, { ...existing, redirectsPath: site.redirectsPath }, ...)`. `loadLaneConfig` returns `LaneConfigSchema.safeParse(parsed).data` (`loader.ts:152`), i.e. the **normalized** object — Zod strips keys the schema doesn't know and materializes any schema defaults. Writing that normalized object back to disk therefore mutates the operator's lane file *beyond* adding `redirectsPath`: any operator key outside the schema is dropped, and any defaulted-but-omitted field is now written out explicitly. The inline comment claims this path is "preserving operator-authored fields," but it preserves only schema-recognized fields in their post-normalization form — a stronger rewrite than "add one field." The AUDIT-10 test (`sites-to-lanes-migration.test.ts:196`) only asserts the two fields it seeded survive, so it cannot catch a stripped extra key or an injected default.

Secondarily, the merge commits `{ ...existing, redirectsPath }` **without** the `LaneConfigSchema.safeParse` gate the brand-new-lane branch applies just below (`:341-343` — `const validated = LaneConfigSchema.safeParse(lane); if (!validated.success) ...`). The merged shape is very likely valid since `redirectsPath` is a string, but the create path and the merge path now treat schema validation inconsistently. The narrower, intent-matching fix is to read the lane's *raw* JSON (as the loader does at `readAndValidate`), add only `redirectsPath`, validate, and write — so a repair rerun never silently reshapes an operator's file.

### AUDIT-20260604-15 — `readLegacySites` reads `redirectsPath` twice (validation check + assignment)

Finding-ID: AUDIT-20260604-15
Status:     acknowledged-slush-pile-2026-06-04
Severity:   low
Surface:    `packages/core/src/doctor/legacy-config.ts:157-168`

The new AUDIT-11 guard calls `readString(siteObj, 'redirectsPath')` inside the `if` (`:159`) and then again on the next line for the actual assignment (`const redirectsPath = readString(siteObj, 'redirectsPath');`, `:168`). Two reads of the same key where one suffices. It is not a correctness bug (`readString` is pure), but it is duplicated logic in a validation path — hoist the result into a single `const` and test it (`raw !== undefined` after confirming the key is present). Minor hygiene; flagging since the surrounding code is otherwise careful about single-read patterns.

---

Summary: two `medium` findings worth triage — the rename-redirect resolution still throws on a purged-pipeline lane (AUDIT-08's tolerance is narrower than its own stated scope, and that path is untested), and the AUDIT-10 merge rewrites operator lane files through the schema rather than appending one field. One `low` hygiene note. The AUDIT-11 and AUDIT-12 changes are otherwise sound; the read-only audit path already absorbs the new throw gracefully.

### AUDIT-20260604-16 — Task 39.25 claims the non-bug acknowledgement flipped to `fixed-<sha>`

Finding-ID: AUDIT-20260604-16
Status:     acknowledged-slush-pile-2026-06-04
Severity:   low
Surface:    `docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:2232-2245`

Task 39.25 correctly uses the non-bug shape in its header/body: it says `Acknowledges AUDIT-20260604-12`, explains this is doc-only, and explicitly says using `Acknowledges` avoids a false `fixed-<sha>` flip. But the acceptance criteria still end with `Audit-log Status flipped to fixed-<sha>` at `:2245` rather than an acknowledged status. In the provided diff that checkbox is also left unchecked, while the audit-log entry itself is `acknowledged-2026-06-04`.

This is exactly the bookkeeping trap the task prose says it is avoiding: a future close/check pass could read the acceptance criterion and try to force a `fixed-*` status for a doc-only acknowledgement. The reasonable fix is to change the criterion to the actual expected status shape, e.g. `acknowledged-2026-06-04 (...)`, and mark it consistently with the audit-log state.
