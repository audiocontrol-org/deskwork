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
