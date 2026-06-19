---
slug: 027-roadmap-edge-mutation-and-cluster
targetVersion: ""
---

# Audit log — 027-roadmap-edge-mutation-and-cluster

## 2026-06-18 — audit-barrage lift (20260618T231714683Z-027-roadmap-edge-mutation-and-cluster-phase-1)

### AUDIT-20260618-01 — Doc comment claims a parser→handler wiring that does not exist yet

Finding-ID: AUDIT-20260618-01
Status: migrated-to-backlog TASK-246
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts:9-12 (and the module as a whole — zero importers)

The header comment asserts, in the present tense, that the readers are already composed by the verb layer: *"Each verb composes these readers into its own typed options interface (see `src/subcommands/roadmap.ts`), so handler code receives a fully-typed object with zero casts."* I grepped the tree: `grep -rn "rawOpts\|OptionReader\|stringListOption\|optionalStringOption\|CommandAdapterError" src/` returns **only** `command-adapter.ts` itself — `src/subcommands/roadmap.ts` does not import or compose any of these readers. The module currently has no importers at all; it is unwired.

Introducing the adapter (T002) before the verb wires it is legitimate sequencing, but the comment overstates reality: it reads as documentation of a live integration, not a forward reference. An agent building the next task off this file would reasonably believe `roadmap.ts` is already on the typed boundary and skip the wiring. Blast radius: a downstream reader trusts a false "already integrated" claim and either duplicates the wiring or assumes the seal is enforced when no verb yet routes through it. Fix: soften the comment to a forward intent (*"verbs will compose…"*) — or, better, land the `roadmap.ts` wiring in the same change so the comment is true. A header that describes a state the code is not in is the drift this project's documentation rules exist to prevent.

---

### AUDIT-20260618-02 — New public-contract boundary module ships with no tests

Finding-ID: AUDIT-20260618-02
Status: migrated-to-backlog TASK-247
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts (entire file) — no accompanying test in the diff

The module's whole purpose is fail-loud narrowing: `stringOption`, `booleanOption`, `optionalStringOption`, and `stringListOption` each have a happy path and a throw path (`CommandAdapterError`), plus the `describe()` branching for `null`/array/typeof. The project's `.claude/rules/testing.md` states *"Helper scripts are public contracts — cover both happy path and error shapes"* and *"Write tests alongside implementation, not after."* The diff contains no test file, and `grep -rln "command-adapter" src/ test/ tests/` finds none.

These are exactly the cheap-to-test, easy-to-regress functions where a missing test bites later: e.g. `booleanOption(undefined)` returning `false` vs. throwing, or `stringListOption`'s trim/filter semantics. Blast radius: a future refactor of the seal silently changes error-shape behavior with nothing to catch it, and the "fails loud, no fallback" guarantee (Principle V) becomes unverified. Fix: add a unit test exercising each reader's happy path plus its throw, and the `describe()` branches (`null` → `'null'`, `[]` → `'array'`).

---

### AUDIT-20260618-03 — `stringListOption` collapses a present-but-empty value to `[]`, indistinguishable downstream from a real list

Finding-ID: AUDIT-20260618-03
Status: migrated-to-backlog TASK-248
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-adapter.ts:77-84

`stringListOption` returns `undefined` only when the flag is unset. A flag that is *present but yields no tokens* — `--depends-on ","`, `--depends-on " "`, or `--depends-on ""` — passes `stringOption` (non-empty string), then `split(',').map(trim).filter(len>0)` produces `[]`. So the function has three observable states (`undefined` = unset, `[]` = present-but-empty, `[...]` = present-with-values), but the `[]` case is silent: an operator who typed `--depends-on ,` gets an empty edge set with no error.

The comment says this "mirrors the existing roadmap `--depends-on`/`--into` splitting," so this may be intentional parity (I couldn't diff against the pre-existing splitter since it isn't in this diff). Blast radius is small — an unusual malformed invocation degrades to "no edges" rather than an error — but for a fail-loud boundary it's a quiet hole. Worth a deliberate decision: either treat present-but-empty as an error (consistent with Principle V) or document that `[]` is an accepted result distinct from `undefined`.

---

### AUDIT-20260618-04 — Provenance: audited content is untracked and unrelated to the only commit in range

Finding-ID: AUDIT-20260618-04
Status: migrated-to-backlog TASK-249
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/cli-help/command-adapter.ts (git state) vs. commit 5bf5b2e3

The single commit in the audited range (`5bf5b2e3 docs(session): …`) is a journal/cleanup commit — it does not contain this file. `git status --porcelain` shows `?? plugins/stack-control/src/cli-help/` and `git ls-files src/cli-help/` returns nothing: `command-adapter.ts` is **untracked**, not committed. So the governance pass is reviewing uncommitted T002 work while the commit it nominally diffs (HEAD~1) is unrelated docs.

Not a code defect — flagging because it affects how the operator reads this barrage: the "diff against HEAD~1" framing implies the code is in the commit range, and it isn't. Blast radius is procedural: a clean barrage here doesn't certify anything that's actually landed in history yet, and the implementation could change before it's committed. Worth confirming the file is committed (with its tests, per AUDIT-02) before treating this audit as covering shipped work.

---

**Checked and clean:** I verified the central type claim — `command.opts()` (`OptionValues` = `{[k]: any}`) assigned to `Record<string, unknown>` does widen `any`→`unknown` without a cast under strict mode, so `rawOpts()` is honestly cast-free as documented; `commander@^12.1.0` is a real dependency (`package.json:16`); `describe()` correctly handles `null` (explicit branch, since `typeof null === 'object'`) and arrays before falling through to `typeof`; and `booleanOption` correctly accepts commander's `false` (negated `--no-*` flags) via the `typeof raw !== 'boolean'` guard. These are the spots I'd have flagged had they been wrong.

A note on the harness: this was an audit-barrage dispatch (read-only analysis producing findings), so the deliverable is the findings above — there is no implementation to plan or execute, and I made no changes to the system.

### AUDIT-20260618-05 — Adapter Is Not Wired To The Roadmap Verb It Claims To Type

Finding-ID: AUDIT-20260618-05
Status: migrated-to-backlog TASK-250
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts:5-11; missing consumer surface `src/subcommands/roadmap.ts`

The new adapter says this is the single parser-to-handler boundary and that “each verb composes these readers into its own typed options interface,” explicitly pointing at `src/subcommands/roadmap.ts` on lines 9-11. But the audited diff only adds `src/cli-help/command-adapter.ts`; it does not update the roadmap command consumer. In the repository snapshot, `src/subcommands/roadmap.ts` still uses the older `scanVerbFlags`/`Flags` map path and manual splitting, so this adapter does not currently enforce the stated typed boundary for the feature surface.

Blast radius is medium: shipped as-is, behavior remains on the older parser path and the new “single audited place” contract is misleading for future maintainers and audit tooling. A reasonable fix is to either wire the roadmap commander command through this adapter in the same change, or remove/soften the claim until the consuming surface actually uses it.

### AUDIT-20260618-06 — `rawOpts()` Drops Inherited Commander Options

Finding-ID: AUDIT-20260618-06
Status: migrated-to-backlog TASK-251
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts:35-37

`rawOpts()` returns only `command.opts()`. In Commander, that reads the command’s local options; inherited/global options are exposed through `optsWithGlobals()`. For nested CLI verbs, this means a consumer can correctly declare a global option on a parent command, parse it successfully, and then have this adapter present it as absent. Optional readers would convert that absence into `undefined`/`false`, which can make an operator-provided flag silently stop affecting handler behavior.

Blast radius is medium because the defect appears when this adapter is wired into nested commands with shared options such as a global document/config/root flag. The fix is to make the boundary explicit: use `command.optsWithGlobals()` when the adapter is intended to expose all parsed flags, or rename/scope `rawOpts()` so callers cannot mistake local-only options for the full parsed option set.

## 2026-06-18 — audit-barrage lift (20260618T232301810Z-027-roadmap-edge-mutation-and-cluster-phase-1)

### AUDIT-20260618-07 — `stringListOption` mirrors `--into`, not `--depends-on` — "keeps current behavior" comment is false

Finding-ID: AUDIT-20260618-07
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/cli-help/command-adapter.ts:86-93` vs `src/subcommands/roadmap.ts:~129-134, ~160-163`

The comment claims `stringListOption` "Mirrors the existing roadmap `--depends-on`/`--into` splitting so the commander surface keeps current behavior (FR-006)." That's impossible — the two flags split differently today: `--depends-on` does `.split(',').map(trim)` (**no** empty-filter → `"a,,b"` yields `['a','','b']`), while `--into` adds `.filter(s => s.length > 0)`. `stringListOption` implements the `--into` variant. When the roadmap verb migrates onto it, `--depends-on a,,b` silently starts dropping empty segments. An unattended agent trusting the "no change" comment won't re-verify. Fix: keep two readers (one filtering, one not) and correct the comment, **or** explicitly record that `--depends-on` behavior is intentionally changed.

### AUDIT-20260618-08 — "required" `stringOption` accepts the empty string

Finding-ID: AUDIT-20260618-08
Status: migrated-to-backlog TASK-252
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    

Only checks `typeof raw !== 'string'`, so `--doc ""` passes the required gate and flows downstream as "present." Contradicts the "fail loud, no coercion" billing. Fix: reject `raw.trim().length === 0`.

### AUDIT-20260618-09 — Audited surface is untracked, not the commit in the stated range

Finding-ID: AUDIT-20260618-09
Status: migrated-to-backlog TASK-253
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    

The range names one commit (`5bf5b2e3`, a **docs/session** commit), but the diff is a new **source** file that `git status` shows as `?? src/cli-help/` (untracked). The "audited == shipped" governance invariant isn't satisfied — the audit-log entry would imply the parser-adapter passed governance when a docs commit did. Fix: commit `src/cli-help/` + `tests/cli/` and re-run governance against that commit.

### AUDIT-20260618-10 — Asymmetric error-path test coverage

Finding-ID: AUDIT-20260618-10
Status: migrated-to-backlog TASK-254
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    

`optionalStringOption` and `stringListOption` have only happy-path tests; their fail-loud delegation to `stringOption` is unasserted. Add non-string/array rejection tests.

### AUDIT-20260618-11 — Unconsumed scaffold at landing

Finding-ID: AUDIT-20260618-11
Status: migrated-to-backlog TASK-255
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    

No verb imports it yet (`roadmap.ts` still uses `scanVerbFlags`). Legitimate T002 deliverable, but the Finding-01 divergence stays latent until first use — recommend the US1/US2 wiring land within this feature.

---

This is a read-only audit deliverable — no implementation follows from it.

The audit report is complete and presented above — this was an analysis/review task, not an implementation plan, so there's nothing to execute or approve. The five findings (one high, two medium, one low, one informational) are also persisted in the plan file for the operator's side-by-side triage against the other models' outputs.

### AUDIT-20260618-12 — Adapter comment carries unimplemented migration commitments

Finding-ID: AUDIT-20260618-12
Status: migrated-to-backlog TASK-256
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-adapter.ts:9-14

Lines 9-14 describe behavior that is not present in this diff: “Each verb WILL compose these readers…”, “as it migrates…”, and “once a verb routes through it.” The same comment also says “No verb consumes it yet,” so the file is documenting planned wiring rather than only the current contract.

Blast radius is low because runtime behavior is not changed by the comment, and the comment is explicit that the adapter is not consumed yet. The risk is operator discipline and documentation drift: audit tooling or an unattended agent may treat this as an already-governed boundary. A reasonable fix is to keep the comment scoped to the current exported helpers and move migration intent into the workplan/tasks artifact, or wire the consuming roadmap surface in the same audited change.

## 2026-06-18 — audit-barrage lift (20260618T233305242Z-027-roadmap-edge-mutation-and-cluster-phase-1)

### AUDIT-20260618-13 — Module ships shippable validation logic with no test, contradicting its own "verifiable in isolation" claim

Finding-ID: AUDIT-20260618-13
Status: migrated-to-backlog TASK-257
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts:1-87 (and the absent companion test file)

The module-level comment (lines 13-14) states these are "claim-free scalar readers whose behavior is verifiable in isolation," and the readers carry real branching behavior: `stringOption` rejects non-strings, rejects empty/whitespace, and otherwise returns the value; `booleanOption` maps `undefined`→`false`, rejects non-booleans; `optionalStringOption` short-circuits `undefined`. None of this is exercised by a test in the audited range. The commit subject is `T001/T002` setup, but a scaffold that ships throwing validators without a single RED-first test directly contradicts this project's TDD discipline (`.claude/rules/testing.md` "write tests alongside implementation, not after"; superpowers TDD). 

Blast radius: a downstream agent extending this seam (US1/US2 flag wiring) inherits an untested primitive and will assume its empty-string and `undefined` branches behave as the comment asserts — exactly the branches most likely to be subtly wrong (e.g. trim semantics, see claude-04). A reasonable fix: add `command-adapter.test.ts` covering each reader's happy path plus the three error shapes (non-string, empty-string, non-boolean) and the `optsWithGlobals` widening, before any verb consumes the module. If a test file exists outside this diff slice, that's a packaging/commit-grouping issue worth confirming.

### AUDIT-20260618-14 — `booleanOption` defaults absent→false, contradicting the module's load-bearing "no fallback, no coercion" contract

Finding-ID: AUDIT-20260618-14
Status: migrated-to-backlog TASK-258
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts:73-79 (claim at lines 11-12)

The module comment is the contract documentation for this seal and states unambiguously that every field is narrowed through a reader that "FAILS LOUD on a shape mismatch (**no fallback, no coercion** — Principle V)." But `booleanOption` (line 74) does `if (raw === undefined) return false;` — an absent flag is silently defaulted to `false`, which is a fallback/default, not a fail-loud narrowing. Contrast `stringOption`, where `undefined` throws. The asymmetry is undocumented at the contract level: the seal advertises "no fallback" but one of its three readers has one.

Blast radius: for booleans the `absent→false` mapping is the conventional and almost-certainly-intended commander semantic, so the *runtime* risk is low. The risk is to the **reader of the contract**: an agent building a new flag, trusting "no fallback, no coercion," may expect `booleanOption` to throw on absence (e.g. for a flag where presence is meaningful) and design around a guarantee the code doesn't provide. Fix: either narrow the module comment to say "absent boolean defaults to false; all other shapes fail loud" (accurate), or — if a fail-loud boolean is ever needed — split into `booleanOption` (defaulting) and a `requiredBooleanOption`. The cheap correct fix is the comment.

### AUDIT-20260618-15 — Non-empty rejection is baked into the base scalar reader — no reader represents a legitimately-empty-permitted string flag

Finding-ID: AUDIT-20260618-15
Status: migrated-to-backlog TASK-259
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-adapter.ts:58-69 and 82-83

`stringOption` conflates two distinct policies: "is a string" and "is non-empty." Because `optionalStringOption` (line 82-83) delegates to `stringOption` for the present case, an explicitly-supplied empty value (`--into ""`) is a hard `CommandAdapterError` on *both* the required and optional readers. There is no reader that accepts a possibly-empty string. The module's own comment (lines 16-21) carefully defers list readers because their splitting semantics are flag-specific — but the same flag-specificity argument applies to emptiness: some scalar flags may legitimately accept `""` (e.g. clearing a value), and this primitive forecloses that.

Blast radius: forward-looking. When US1/US2 wires real flags (the comment says behavior must be "preserved exactly," FR-006), any flag whose existing behavior accepts empty string cannot reuse these readers without either widening the primitive (risking the non-empty flags that depend on it) or hand-rolling a parallel reader. Fix: separate the concerns — a `stringOption` that only checks `typeof`, plus a composable `nonEmpty` constraint (or a distinct `requiredNonEmptyStringOption`) — so emptiness is a per-flag choice, mirroring the deferral reasoning already applied to list readers.

### AUDIT-20260618-16 — `stringOption` validates on the trimmed value but returns the untrimmed one — leading/trailing whitespace passes through silently

Finding-ID: AUDIT-20260618-16
Status: migrated-to-backlog TASK-260
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-adapter.ts:62-67

The empty-check is `raw.trim().length === 0` (line 62) but the return is the original `raw` (line 66), so `--name "   "` is rejected while `--name "  foo  "` is accepted and returned with its surrounding whitespace intact. This is a defensible choice (don't mutate operator input), but it's undocumented, and the mismatch between "validate on trimmed" and "return untrimmed" is exactly the kind of subtle behavior that surprises a downstream consumer comparing values (e.g. a roadmap heading-key lookup where `"foo"` and `" foo "` should match but won't).

Blast radius: low and localized — it only matters once a consumer does identity/equality comparisons on the returned string. Fix is a one-line comment stating the value is returned verbatim (validation is presence-only, not normalization), so the US1/US2 wiring author decides per-flag whether normalization belongs at the reader or the verb. This is the kind of decision a test (claude-01) would have forced to the surface.

---

That's the complete set. I deliberately did not flag the `optsWithGlobals()` → `Record<string, unknown>` widening (lines 39-42): the `any`-valued index signature is genuinely assignable to `unknown`-valued without a cast, so the "no cast needed" claim holds. Nor the `describe()` helper (lines 50-54), which correctly special-cases `null` and arrays ahead of `typeof`. The logic is sound; my findings are concentrated on the contract-vs-code drift (claude-02), the design rigidity of the primitive (claude-03), and the missing verification the module's own comment invites (claude-01).

## 2026-06-18 — audit-barrage lift (20260618T233817002Z-027-roadmap-edge-mutation-and-cluster-phase-1)

### AUDIT-20260618-17 — Header attributes the `undefined → false` default to "commander's boolean convention," but commander's actual convention (correctly stated 25 lines below) is `undefined`-when-absent

Finding-ID: AUDIT-20260618-17
Status: migrated-to-backlog TASK-261
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-adapter.ts:9-11 (vs. 86-87, 90)

The new header text (lines 9–11) says the one intentional default is "`booleanOption` mapping an absent flag to `false` (**commander's boolean convention**)." That parenthetical is inaccurate and, notably, contradicts the reader's own docstring directly below. For a plain `program.option('-x, --flag')`, commander leaves an unset boolean **`undefined`**, not `false` — it only yields `false` for `--no-`negatable options or an explicit default. The `false` is this adapter's deliberate substitution, performed at line 90 (`if (raw === undefined) return false;`). The `booleanOption` docstring gets this right at lines 86–87: "commander leaves an unset boolean `undefined` … both map to a `boolean` here." So the header's parenthetical asserts the opposite of the reader it cross-references.

This matters precisely because the commit's stated purpose is *contract-comment accuracy*: the header now mis-credits commander for a default the adapter itself supplies. Blast radius is low — an agent reading both comments hits the correct statement at line 86 — but a future verb-wiring author who reads only the header could assume commander auto-defaults booleans to `false` and skip the reader, then be surprised by `undefined`. Fix: drop or correct the parenthetical, e.g. "(commander leaves an absent boolean `undefined`; this reader maps that to `false`)" so the header and the reader agree.

---

### AUDIT-20260618-18 — Audit-finding-ID citations were removed inconsistently — `claude-02` purged from two comments while `codex-02` remains at line 43

Finding-ID: AUDIT-20260618-18
Status: migrated-to-backlog TASK-262
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/cli-help/command-adapter.ts:43 (vs. removed citations at lines 8-9, 62)

The diff removes the `AUDIT-BARRAGE-claude-02` breadcrumbs from both the module header and the `stringOption` docstring (good — audit-finding IDs are transient and rot as in-code comments). But `rawOpts` still carries `(AUDIT-BARRAGE-codex-02)` at line 43. The result is an inconsistent policy on whether audit-finding IDs live in comments: two were judged noise and removed, one was left. Either is defensible, but the file should be internally consistent.

No behavioral consequence — this is pure hygiene. If the decision is "audit IDs don't belong in shipped comments," line 43's `codex-02` reference should go too; if they're kept as provenance, the removed ones were fine. I flag it only because this commit is explicitly a comment-accuracy/cleanup pass, which is the right moment to make the convention uniform.

---

The substantive comment claims all check out against the code: `booleanOption` does map absent → `false` (line 90, matching the header); `stringOption` does fail loud on non-string (line 76, covering the "absent" case where commander yields `undefined`) and on empty/whitespace (line 79, `raw.trim().length === 0`); and it does return the value **verbatim** (line 82 `return raw;`, not the trimmed value), so the new "presence-and-non-empty, NOT normalization … whitespace preserved" note is accurate — `"  foo  "` passes and is returned with its padding intact. The "ONE intentional default" framing is defensible: `stringOption` throws on absence and `optionalStringOption` passes `undefined` through (identity, not a substituted value), so `booleanOption` is the only reader that substitutes a concrete value for an absent flag. My only real catch is the misattribution in AUDIT-BARRAGE-claude-01.

## 2026-06-19 — audit-barrage lift (20260619T000011570Z-027-roadmap-edge-mutation-and-cluster-phase-2)

### AUDIT-20260619-01 — Commander parse errors no longer preserve the roadmap error shape

Finding-ID: AUDIT-20260619-01
Status: migrated-to-backlog TASK-265
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli.ts:88-91; tests/cli/parser-adapter.test.ts:117-126

The diff mounts `roadmap` onto `runRoadmapCommand`, and the new tests claim the mounted command preserves the existing dispatcher's “error shapes,” but the assertions only check exit status. The retained flat dispatcher emits `roadmap: unknown subaction 'frobnicate' (known: ...)`, while the live commander path now emits `error: unknown command 'frobnicate'` with the same exit code 2. That is a user-visible contract regression for operators or scripts matching the `roadmap:` diagnostic prefix or relying on the known-subaction list.

The blast radius is medium: ordinary success paths still work and the exit code remains correct, but the stated non-regression goal is not fully enforced and parse-error diagnostics changed at the newly mounted boundary. A reasonable fix is to reject unknown subactions before invoking commander, or override commander error output so unknown-command/unknown-option diagnostics are mapped back to the old `failUsage('roadmap', ...)` message shape, then assert stderr in the tests at `tests/cli/parser-adapter.test.ts:117-126`.

## 2026-06-19 — audit-barrage lift (20260619T000952185Z-027-roadmap-edge-mutation-and-cluster-phase-2)

### AUDIT-20260619-02 — The diff fed to the barrage omits the two files that ARE the fix

Finding-ID: AUDIT-20260619-02
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    audit harness input — "Under audit" diff vs. `git show --stat 28dc1566`

`git show --stat 28dc1566` reports three changed files: `roadmap-command.ts` (+30), `roadmap.ts` (+12), `tests/cli/parser-adapter.test.ts` (+17). The "Under audit" payload contained only the test file. The load-bearing fix — moving the unknown-subaction guard + `preflightRoadmapFlags` *before* the commander parse so usage errors keep the `roadmap:` shape, plus single-sourcing `KNOWN_SUBACTIONS` — was withheld. A sibling model asked "is the fix correct?" can't see the fix; the natural reading of a test-only diff is "this commit only touched tests," which is wrong. Feed the full 3-file commit diff to the barrage.

### AUDIT-20260619-03 — Unknown-flag test under-locks the shape it exists to guard

Finding-ID: AUDIT-20260619-03 (claude-02 + codex-01; cross-model)
Status: migrated-to-backlog TASK-266
Severity:   low
Per-lane:   claude=medium, codex=low
Decision:   agreement (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts — the unknown-flag case

The sibling test pins `"roadmap: unknown subaction 'frobnicate'"`. This one only asserts `toContain('roadmap:')`, `toContain('bogus')`, `not.toContain('unknown option')`. The two positives are weak: `'roadmap:'` prefixes nearly every roadmap line, and `'bogus'` is the flag the test itself passed in — both could pass against a generic/echoed error. The whole guard rests on the single negative. The impl emits `roadmap: unknown flag --bogus for 'advance'`; assert the discriminating `toContain("unknown flag --bogus")` to actually catch a shape regression.

### AUDIT-20260619-04 — Hardcoded `'reconcile'` couples the test to one arbitrary subaction

Finding-ID: AUDIT-20260619-04
Status: migrated-to-backlog TASK-267
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts — `toContain('reconcile')`

The known-list probe picks one arbitrary member of the single-sourced `KNOWN_SUBACTIONS` (`roadmap.ts:86-87`). Renaming/removing `reconcile` breaks this test for an unrelated reason. Hygiene only — assert against the exported constant or a stabler member if hardening.

What I checked that came back clean: exit-code-2 production, the `roadmap:` prefix / "known:" list / commander-suppression behavior, and the byte-identical message single-sourcing across the flat and commander paths — all consistent between the test assertions and the implementation. The fix itself is correct; -02/-03 are test-quality, -01 is barrage-input.

I've written the report plus the small test-hardening remediation (findings -02/-03) to the plan file.

The audit deliverable is complete regardless of plan approval — the three findings are emitted above and the full report is at `/Users/orion/.claude/plans/audit-barrage-multi-model-async-blanket.md`.

I'll hold here. The headline (`claude-01`) is feedback to the barrage harness — feed the full 3-file commit diff, not the test-only slice — and needs no repo change. The optional test-hardening edits (`claude-02`/`claude-03`) are staged in the plan but I won't touch the working tree until you direct. Let me know if you want me to apply the assertion tightening, or if this is purely going to barrage triage alongside the sibling models.

## 2026-06-19 — audit-barrage lift (20260619T002455152Z-027-roadmap-edge-mutation-and-cluster-phase-2)

### AUDIT-20260619-05 — Removing `toContain('reconcile')` drops the only independent check that the known-subaction list contains a real member

Finding-ID: AUDIT-20260619-05
Status: migrated-to-backlog TASK-268
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts:124-134 (diff hunk 1)

The hunk replaces two assertions (`toContain('known:')` + `toContain('reconcile')`) with a single single-sourced assertion `toContain(\`(known: ${KNOWN_SUBACTIONS})\`)`. Because the test now imports the same `KNOWN_SUBACTIONS` constant that the production error path interpolates (`roadmap.ts:86` → consumed at `roadmap.ts:402` and `roadmap-command.ts:152`), both sides of the assertion read from one source. That correctly pins the byte-identical-across-paths contract (FR-006), but it also makes the list-contents dimension tautological: a typo that drops a real subaction (e.g. `reconcile`) from `KNOWN_SUBACTIONS` would change *both* the production message and the test's expected string in lockstep, so the test still passes. The removed `toContain('reconcile')` was the only assertion that independently verified a concrete, real subaction name actually appears in the operator-facing discovery list.

Blast-radius: low. The deliberate trade-off (avoid coupling to one arbitrary member) is reasonable and documented in the comment, and a missing-subaction regression would likely be caught elsewhere (e.g. dispatch tests for that verb). But a belt-and-suspenders shape — keep the single-sourced full-list check *and* retain one concrete-member assertion like `toContain('reconcile')` — would preserve the regression net the commit gave up, at near-zero cost. A reasonable fix is to re-add a single concrete-member check alongside the single-sourced one.

### AUDIT-20260619-06 — Sibling test hardcodes the flag diagnostic instead of single-sourcing it, inconsistent with the same commit's first hunk

Finding-ID: AUDIT-20260619-06
Status: migrated-to-backlog TASK-269
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts:138-141 (diff hunk 2)

The second hunk tightens the assertion to the literal `toContain("unknown flag --bogus for 'advance'")`. That string is constructed in production at `document-verb-shared.ts:164` from the template `unknown flag --${name} for '${subaction}'`. Unlike hunk 1 — which the *same commit* deliberately single-sourced via the `KNOWN_SUBACTIONS` import to avoid duplicating the contract — this test duplicates the diagnostic format as a hand-copied literal. The two hunks therefore apply opposite standards to two adjacent message-shape contracts in one commit.

Blast-radius: low. Pinning the literal is a legitimate contract-test choice and the substring is currently exact. The cost surfaces only if the `document-verb-shared.ts` template is reworded for readability (e.g. `unknown flag '--bogus' for subaction 'advance'`), which would break this test even though behavior is correct — the exact brittleness hunk 1 was rewritten to avoid. If single-sourcing was worth the import in hunk 1, the consistent move is to export the flag-diagnostic builder (or a format helper) from `document-verb-shared.ts` and assert against it here too; otherwise the hunk-1 effort is hard to justify. Either harmonize both or note the asymmetry explicitly.

### AUDIT-20260619-07 — `toContain` substring checks do not verify the "byte-identical" claim the source comments assert

Finding-ID: AUDIT-20260619-07
Status: migrated-to-backlog TASK-270
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    tests/cli/parser-adapter.test.ts:124-141; cross-ref roadmap.ts:82-87

The single-source comment block at `roadmap.ts:82-87` states the two emit "the byte-identical message," and the test-describe block is titled "preserves error shapes (contract...)". The test itself uses substring containment (`toContain`) against the mounted-command path only — it exercises one `runCli(['roadmap', 'advance', ...])` invocation and never runs the flat `runRoadmapCli` path to diff the two outputs. So the byte-identical guarantee rests entirely on source inspection (both sites interpolating the same constant), not on a test that runs both paths and compares.

Blast-radius: none today — the structural single-sourcing does make the two messages identical by construction, and `toContain` is the right altitude for a shape-preservation contract test. Flagging only so the operator is aware the "byte-identical" wording is a construction guarantee, not an asserted one; if a true equivalence guarantee is wanted, a test that captures both paths' stderr and asserts equality would close the gap. No change required.

---

**Summary for triage:** The diff is a small, well-reasoned test-hardening commit. The `KNOWN_SUBACTIONS` single-sourcing (hunk 1) is correct and verified against source — not the brittle array-`.toString()` coupling it might appear to be, since the constant is a literal string. My only substantive note is AUDIT-BARRAGE-claude-01 (loss of an independent concrete-member assertion); claude-02 is a consistency observation; claude-03 is context. Nothing here is blocking or high.

### AUDIT-20260619-08 — Unknown-flag test no longer pins the `roadmap:` prefix it claims to protect

Finding-ID: AUDIT-20260619-08
Status: migrated-to-backlog TASK-271
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts:134-142

The changed assertion strengthens the diagnostic text for `--bogus`, but it drops the explicit `expect(r.stderr).toContain('roadmap:')` check while the test name still says it verifies “the roadmap: message shape.” A regression like `error: unknown flag --bogus for 'advance'` would now pass line 141 and line 142, even though the mounted command would no longer preserve the flat dispatcher’s `roadmap:` prefix.

Blast radius is low because this is a test-only hardening gap, not a runtime defect in the audited diff. It still matters because this feature is specifically about preserving usage-error shapes; the reasonable fix is to keep line 141 and also assert the full prefixed diagnostic, e.g. `roadmap: unknown flag --bogus for 'advance'`, or add a separate prefix assertion.

## 2026-06-19 — audit-barrage lift (20260619T004848706Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-09 — `--part-of` is asserted as shown but never exercised as accepted

Finding-ID: AUDIT-20260619-09
Status: migrated-to-backlog TASK-272
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-nondrift.test.ts:85-96

The test name and header claim that every shown value flag is accepted by the parser, and line 90 specifically asserts that `--part-of` appears in `roadmap add --help`. But the actual CLI invocation on lines 91-95 only passes `--status`, `--scope`, and `--doc`; it never passes `--part-of`. That means a regression where help lists `--part-of` but the `add` parser rejects or mishandles it would still pass this acceptance check.

The blast radius is low because this is a test-coverage defect, not an adopter-facing runtime defect in the diff itself. It weakens the stated CHK015 invariant and could let a help/parser drift bug escape. A reasonable fix is to include a valid `--part-of <id>` argument in the `roadmap add` invocation, or iterate over shown value flags with per-flag valid fixtures so each advertised flag is actually parsed.

## 2026-06-19 — audit-barrage lift (20260619T011330356Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-10 — `shownFlags` regex cannot capture `--flag` when preceded by a short-form alias on the same line

Finding-ID: AUDIT-20260619-10
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    tests/roadmap/help-nondrift.test.ts:38-44

The regex `/^[ \t]*(--[a-z][a-z0-9-]*)/gm` anchors to line-start then requires `--` to be the first non-whitespace token. If the help formatter renders short+long form on one line (the conventional style: `  -t, --to   <status>`) the pattern will not match at all on that line: after stripping leading whitespace it encounters `-t`, not `--`, so the match fails and `--to` is absent from the `shown` set. This turns check (1) — "every declared flag appears in help" — into a permanent false-positive failure for any subaction whose flags have short aliases, even when the implementation is completely correct.

The fix used to justify this regex change (commit commentary at lines 36-44: "Anchored to line-start so it captures only structured flag-TABLE entries — never a flag token embedded in prose") is sound reasoning, but the anchor as written has the implicit assumption that all flags are listed without a short-form prefix. That assumption is not validated anywhere and is contrary to the de-facto CLI help style (oclif, commander, yargs all default to `-s, --long` format). If `roadmap-help.ts` (T008/T009, not in this diff) ever emits the conventional two-column style, the CHK015 gate silently becomes non-functional — all checks (1) pass vacuously because `shown` is empty, and the test suite stays green while drift accumulates.

Concrete fix: either tighten the parser to handle the `-s, --long` pattern (e.g. `/(--[a-z][a-z0-9-]*)/g` once per line after stripping the leading `-x, ` prefix) or document in the help-formatter contract (T008/T009) that long-form flags MUST appear at the start of the line, and add a test of the formatter's output shape.

---

### AUDIT-20260619-11 — `--help` flag itself will appear in the flag table and break check (2) for every subaction

Finding-ID: AUDIT-20260619-11
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    tests/roadmap/help-nondrift.test.ts:62-68

Check (2) — "no flag is shown that the grammar does not declare" — iterates over every flag captured by `shownFlags` and asserts `accepted.has(flag)`, where `accepted` is derived from `flagNamesFor(grammar)` (line 52). Standard CLI help formatters include `--help` itself in the flag table:

```
  --help   show this help and exit
```

When that line is emitted, the regex at line 38 captures `--help` and adds it to `shown`. Unless `flagNamesFor` explicitly enumerates `--help` as part of `SUBACTION_SPECS[sub]` — which is unlikely since `--help` is a meta-option handled outside the per-subaction grammar — `accepted.has('--help')` will be `false`, and check (2) will fail for every subaction, in every run, the moment T008/T009 land. The tests are annotated as RED until T008/T009, which means this defect will surface exactly at the moment the feature is declared done, with no diagnostic pointing at the cause.

The same failure mode applies to a potential `--doc` or `--apply` flag if those are globally-injected rather than per-subaction-declared. Without seeing `flagNamesFor`'s implementation (not in this diff), it is impossible to confirm how many global flags are in this blind spot.

Fix: either exclude `--help` (and any other globally-injected flags) from the `shown` set before running check (2), or add them explicitly to `flagNamesFor`'s output.

---

### AUDIT-20260619-12 — Check (3) coverage is limited to two hardcoded subactions, breaking the per-subaction contract stated in the comment

Finding-ID: AUDIT-20260619-12 (claude-03 + claude-04 + codex-01 + codex-02; cross-model)
Status: migrated-to-backlog TASK-273
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    tests/roadmap/help-nondrift.test.ts:1-15 (comment) vs 75-109 (implementation)

The file header at lines 9-12 states:

```
// Three sub-checks per subaction:
//   (1) every flag the grammar declares appears in the help text;
//   (2) no flag appears in the help that the grammar does NOT declare;
//   (3) a flag the help does NOT show is rejected by the parser (exit 2), and
//       every flag the help DOES show is accepted (not an unknown-flag exit 2).
```

The loop at lines 54-70 covers checks (1) and (2) for every subaction enumerated in `SUBACTION_SPECS`. Check (3) is tested only for `advance` (rejection of `--bogus`; acceptance of `--to`) and `add` (acceptance of `--status`/`--scope`). Subactions added in future phases — or any currently-declared subaction other than these two — have no check-3 coverage. If a new subaction's help text shows a flag that the parser silently ignores (or vice versa), the CHK015 gate will not catch it.

This is not a latent issue only: `SUBACTIONS = Object.keys(SUBACTION_SPECS)` drives the check-(1)/(2) loop (line 50), so the loop IS the complete set. The isolation of check (3) to two hardcoded subactions is a coverage gap that will widen every time a subaction is added. Fix: either extend the loop to include check (3) inline (picking a stable inert flag per subaction), or add a note to `SUBACTION_SPECS` that each subaction entry must carry a probe pair (`bogusFlag`, `validFlag`+`validValue`) for the gate harness to iterate over.

---

### AUDIT-20260619-13 — T007 non-drift summary check uses brittle hardcoded prose fragments

Finding-ID: AUDIT-20260619-13
Status: migrated-to-backlog TASK-274
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-surface.test.ts:34-35

The assertion that "a summary is present (at least one descriptive line beyond the names)" is implemented by matching two specific phrases:

```typescript
expect(r.stdout).toMatch(/list the ready/);
expect(r.stdout).toMatch(/dry-run unless --apply/);
```

These are fragments from the current wording of two specific subaction summaries. If those summaries are rephrased during any normal maintenance cycle (e.g., "list ready nodes" → "show actionable nodes"), the test will fail for a reason that has nothing to do with the help surface's structural correctness. The comment says "a summary is present" but the assertion tests specific wording, not structure. This conflates content-correctness with structural-presence.

Fix: replace with a structural assertion such as `expect(lines with a subaction name).every(line => line.length > subactionNameLength + N)` to verify each subaction has trailing content, without coupling to exact phrasing.

---

### AUDIT-20260619-14 — `tmpChain()` creates a temp directory per test with no cleanup

Finding-ID: AUDIT-20260619-14
Status: migrated-to-backlog TASK-275
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-nondrift.test.ts:28-33

`tmpChain` calls `mkdtempSync` to create a fresh temp directory each time it is called. There is no `afterEach`, `afterAll`, or `rm -rf` cleanup. Across repeated test runs the `/tmp/roadmap-help-nondrift-*` directories accumulate indefinitely. In CI environments with shared `/tmp` namespaces this causes slow disk-fill on long-lived runners. The `fixturePath('chain')` source file is read-only, so the fixture itself is not at risk — this is purely a resource hygiene issue.

Fix: return both the `dir` and `docPath` from `tmpChain`, and wrap the call sites in a `try/finally { rmdirSync(dir, { recursive: true }) }` block, or use `afterEach` to track and remove created directories.

## 2026-06-19 — audit-barrage lift (20260619T012527622Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-15 — `shownFlags` regex can silently capture non-option tokens that start a help line

Finding-ID: AUDIT-20260619-15
Status: migrated-to-backlog TASK-276
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/help-nondrift.test.ts:44-55

The `shownFlags` function captures any `--word` token that appears at the start of a line (after optional whitespace and an optional `-x, ` short-alias prefix). The comment correctly explains that INLINE flag mentions (embedded in prose or a `(one of: …)` suffix on the same line) are excluded — but a flag-like token that STARTS a new line is not excluded. If the help formatter ever indents vocabulary items on their own lines using `--`-prefixed tokens (e.g. `\n    --planned\n    --in-flight` under a "valid values:" header), each such token would be added to `shown` and check (2) would spuriously fail because it is absent from the grammar's `accepted` set. Conversely, if a stale flag name appears only in a description sub-list (not in the flag table), check (2) would produce a false alarm rather than catching drift. The current help formatter presumably avoids this shape, but the guard is structural (whitespace + `--word` at line-start) not semantic (declared flag-table entry vs. description content), so any future change to the formatter that introduces indented `--`-prefixed enumerations will break the CHK015 gate non-obviously. A tighter anchor — e.g. requiring a trailing flag-value placeholder pattern like `<…>` or a column-stop separator — would eliminate this class of false positive/false negative.

---

### AUDIT-20260619-16 — `decompose` VALID_INVOCATION passes children as a comma-joined string; semantic handling is unverified

Finding-ID: AUDIT-20260619-16
Status: migrated-to-backlog TASK-277
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/help-nondrift.test.ts:134-137

```typescript
decompose: { argv: ['impl:feature/b', '--into', 'impl:gap/x1,impl:gap/x2'], expectExit0: true },
```

The fixture passes two child identifiers to `--into` as a single comma-separated string rather than as repeated `--into` flags. Check (3)'s flag-acceptance contract is still served regardless — if `--into` were an unknown flag, the parser would reject it with "unknown flag" and `isUnknownFlagOrSubaction(r.stderr) === true` would fail the test. But the semantic contract for `decompose` (that it correctly decomposes one item into two children) is NOT verified. There are two failure modes: (a) if the parser treats the comma-joined string as a single id `impl:gap/x1,impl:gap/x2`, the command might silently succeed with a malformed graph entry, which `expectExit0: true` cannot distinguish from correct behaviour; (b) if the parser rejects the comma-joined string as an invalid id, the command exits non-zero and `expectExit0: true` fails loudly — catching the error. The diff does not include `SUBACTION_SPECS` for `decompose`, so the intended grammar for `--into` (comma-split string vs. repeatable flag) cannot be verified here, but the fixture should document which form the grammar actually accepts, and if it is a comma-split string, that should be reflected in the grammar's value schema.

---

### AUDIT-20260619-17 — `tmpChain()` creates temp directories without cleanup, accumulating across test runs

Finding-ID: AUDIT-20260619-17
Status: migrated-to-backlog TASK-278
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-nondrift.test.ts:31-36

```typescript
function tmpChain(): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-help-nondrift-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath('chain'), docPath);
  return docPath;
}
```

`tmpChain()` is called once per test case in the check-(3) loops (12 subactions × 2 tests = 24 calls per suite run) plus the three spot-check tests, with no corresponding `afterEach` or `afterAll` to remove the directories. The OS will eventually reclaim them, but in a busy CI runner that executes many suite runs, these accumulate in `tmpdir()`. This is purely a hygiene issue — no correctness impact — but `fs.rmSync(dir, { recursive: true })` in the test body after the assertions, or a shared cleanup via `afterEach`, is the standard fix.

---

### AUDIT-20260619-18 — Hardcoded prose strings couple `help-surface.test.ts` tightly to help wording

Finding-ID: AUDIT-20260619-18
Status: migrated-to-backlog TASK-279
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-surface.test.ts:33-34

```typescript
expect(r.stdout).toMatch(/list the ready/);
expect(r.stdout).toMatch(/dry-run unless --apply/);
```

These two regex patterns assert specific phrasing from the `roadmap --help` output. The contract they intend to verify (that the help conveys what `next`/`blocked` do, and that mutations require `--apply`) is real and worth testing, but anchoring to exact prose makes the assertions fail whenever the help text is reworded — even if the contract is unchanged. The same contract can be expressed more durably against structural elements already covered elsewhere (e.g. verifying that `next` and `blocked` appear with accompanying text, or that `--apply` is present as a declared flag per CHK015). If the prose phrases are intended to be stable identifiers, that contract should be noted in the source.

---

### AUDIT-20260619-19 — Spot-check title "all accepted" covers only 3 of `add`'s flags

Finding-ID: AUDIT-20260619-19
Status: migrated-to-backlog TASK-280
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-nondrift.test.ts:168-196

```typescript
it('add: the shown value-flags are all accepted by the parser', () => {
  …
  expect(shown.has('--status')).toBe(true);
  expect(shown.has('--scope')).toBe(true);
  expect(shown.has('--part-of')).toBe(true);
  const r = runCli([
    'roadmap', 'add', 'impl:gap/z',
    '--status', 'planned',
    '--scope', 'x',
    '--part-of', 'design:feature/a',
    '--doc', docPath,
  ]);
```

The title asserts "all accepted" but the test only exercises `--status`, `--scope`, and `--part-of`. The remaining `add` flags — `--depends-on`, `--deferred-until`, `--spec`, `--ref` — are not asserted or passed here. The VALID_INVOCATION entry for `add` in the check-(3) describe block does exercise all flags, so there is no actual coverage gap in the overall test suite. The misleading title is a documentation concern: a future maintainer reading the spot-check test may conclude it is comprehensive and skip adding fixtures for new `add` flags — exactly the pattern the comment at lines 178–180 says this third describe block was written to fix for `--part-of`.

### AUDIT-20260619-20 — Boolean flags are listed but never exercised by the non-drift acceptance check

Finding-ID: AUDIT-20260619-20
Status: migrated-to-backlog TASK-281
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/help-nondrift.test.ts:89-144, tests/roadmap/help-nondrift.test.ts:166-175

The test claims each `VALID_INVOCATION` “exercises every flag the subaction's grammar declares” and that exit 0 proves “every declared flag was accepted,” but the fixture argv omits the boolean flags that the grammar/help surface declares. In the current grammar, mutation subactions include `--apply`, and `defer` also includes `--clear`; the fixtures for `add`, `advance`, `decompose`, `reclassify`, `defer`, and `close-related` never pass those boolean flags. That leaves a real CHK015 gap: `roadmap defer --help` could list `--clear` while the parser rejects `--clear`, and this acceptance half would still pass.

The blast radius is medium because this is a governance/test defect rather than a runtime defect, but it directly weakens the stated non-drift invariant for operator-facing roadmap mutation flags. A reasonable fix is to mechanically derive the declared flags per subaction and assert each one appears in the exercised argv, or add per-flag acceptance invocations for boolean flags as well as value flags, with valid combinations such as `defer <id> --clear` separate from `defer <id> --until <date>`.

## 2026-06-19 — audit-barrage lift (20260619T013111545Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-21 — `isUnknownFlagOrSubaction` discriminator has a case-sensitive trailing-space dependency that creates a false-negative risk for the `reconcile` weak-gate test

Finding-ID: AUDIT-20260619-21
Status: migrated-to-backlog TASK-282
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/help-nondrift.test.ts:154-157, 166-172

`isUnknownFlagOrSubaction` is the sole discriminator used to decide whether `reconcile`'s expected non-zero exit is a flag-rejection (bad) or a doc-resolution failure (acceptable). It relies on two fixed, case-sensitive substrings: `"unknown flag "` (with a trailing space) and `"unknown subaction "`. If the CLI emits either without the trailing space, capitalizes the first word (`"Unknown flag …"`), or changes phrasing (e.g., `"unrecognized option: --doc"`), the function returns `false` — telling the test "this is not a flag rejection" — when it actually is. The test at line 170 (`expect(isUnknownFlagOrSubaction(r.stderr)).toBe(false)`) would then pass, silently masking a real flag-acceptance defect for `reconcile`. The blast radius is narrow (one subaction, only the weak-gate path), but the semantic contract of check (3) is that ALL subaction flags are accepted; a false-passing `reconcile` test severs that guarantee. A fix would assert the actual exit-2 reason positively — e.g., expect a `DocumentModelError` or a doc-resolution phrase in stderr — rather than negating an incomplete pattern.

---

### AUDIT-20260619-22 — `shownFlags` regex is vacuously safe today but silently fails if the help table adopts a short-flag column style without a comma separator

Finding-ID: AUDIT-20260619-22
Status: migrated-to-backlog TASK-283
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/help-nondrift.test.ts:38-57

The comment at line 45 documents one upgrade from the prior implementation: the optional `(?:-[A-Za-z], )?` prefix now handles the `-x, --long` two-column style. However, the short-alias prefix is strictly `[one letter][comma][space]`. If the help formatter ever renders the alias without the comma (` -x --long`, i.e., space-separated without comma) or renders a two-letter alias (`--st, --status`), the optional group fails to match and the `^[ \t]*` anchor requires `--` immediately after leading whitespace. That means every flag in a `-x --long`-style table would be captured under the `--long` form (acceptable), but any entry whose line starts with only the short alias (no `--long` on the same line) would be missed entirely by check (1) — causing a false FAIL on "every declared flag is shown." Conversely, a check (2) false PASS could occur if an added alias in a description line looks like `  -d, --doc`. The fix is to add a test variant that checks `shownFlags` against a known multi-style snippet, ensuring the regex stays calibrated as the formatter evolves.

---

### AUDIT-20260619-23 — `advance --help` status-vocabulary test may require the subcommand to enumerate ALL grammar statuses even if `advance` legitimately accepts only a subset

Finding-ID: AUDIT-20260619-23
Status: migrated-to-backlog TASK-284
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/help-surface.test.ts:49-64

The test at lines 49–57 calls `roadmapStatusVocabulary()` and asserts every returned value appears in `advance --help`. If `roadmapStatusVocabulary()` returns the union of all statuses across the entire grammar (e.g., `planned | in-flight | complete | shipped | blocked | deferred`), but `advance` semantically only allows forward transitions (`in-flight | complete | shipped`), the test forces the help text to advertise statuses `advance` cannot validly accept. This is misleading UX — a user reading `advance --help` would see `planned` or `deferred` as options and get a validation error at runtime. The blast radius: any future agent building from the help text would construct invalid invocations based on the advertised-but-rejected statuses. A correct test would assert that `advance --help` shows the statuses accepted by `advance`'s grammar — derived from the `advance` entry in `SUBACTION_SPECS`, not from the global vocabulary. The equivalent logic already exists in `help-nondrift.test.ts` (check (1) verifies every grammar-declared flag appears in help), but it operates on flags, not flag values.

---

### AUDIT-20260619-24 — `VALID_INVOCATION` has no guard against phantom entries for removed subactions

Finding-ID: AUDIT-20260619-24
Status: migrated-to-backlog TASK-285
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-nondrift.test.ts:90-140, 141-152

`invocationFor` (lines 141–152) correctly throws if a subaction in `SUBACTION_SPECS` lacks a `VALID_INVOCATION` entry — loud failure, good. But the inverse is not enforced: if a subaction is removed from `SUBACTION_SPECS`, its `VALID_INVOCATION` entry becomes a ghost (a key in `VALID_INVOCATION` that no test loop will ever exercise). The ghost neither causes a test failure nor fires any completeness check. Over time, `VALID_INVOCATION` accumulates stale fixtures that don't represent real subactions. The fix is a symmetric guard in a separate `it` block or a `beforeAll`: `Object.keys(VALID_INVOCATION).forEach(sub => expect(SUBACTIONS).toContain(sub))`. This mirrors the existing completeness guard's intent in the reverse direction.

---

### AUDIT-20260619-25 — `add` spot-check comment overstates its own flag-acceptance coverage relative to what the test actually exercises

Finding-ID: AUDIT-20260619-25 (claude-05 + codex-01; cross-model)
Status: migrated-to-backlog TASK-286
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    tests/roadmap/help-nondrift.test.ts:215-231

The comment at lines 220–222 states: *"every flag we assert is shown is ALSO passed to the parser below (cross-model codex-02 + claude-04 — the prior version asserted --part-of was shown but never passed it)"*. The test asserts three flags are shown (`--status`, `--scope`, `--part-of`) and passes those same three. However, `VALID_INVOCATION.add` (lines 107–117) includes five additional flags: `--depends-on`, `--deferred-until`, `--spec`, `--ref`, and a positional id — these are covered by check (3) in the preceding describe block, not here. A reader of this spot-check test in isolation could conclude that `--depends-on`, `--deferred-until`, `--spec`, and `--ref` are NOT tested for acceptance, missing the fact that check (3) covers them. The comment should be updated to say "the three flags asserted here are also passed to the parser; the remaining add flags are covered by check (3) via VALID_INVOCATION.add" to prevent a future maintainer from removing the check (3) fixture under the impression this spot-check covers the same ground.

### AUDIT-20260619-26 — Top-level help test can pass without per-subaction summaries

Finding-ID: AUDIT-20260619-26
Status: migrated-to-backlog TASK-287
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-surface.test.ts:21-32

The test name and feature contract require `roadmap --help` / `-h` to list every subaction “with a summary,” but the assertion only checks that each subaction string appears somewhere in stdout, then checks two global prose fragments (`list the ready`, `dry-run unless --apply`). This would pass if most subactions were merely listed in a usage enum with no individual summary lines, which is exactly the self-documenting surface this feature is supposed to protect.

Blast radius is low because this is a test-quality gap around documentation/help completeness, not a parser correctness issue. A tighter test would parse the help table rows and assert one row per `SUBACTION_SPECS` key with non-empty summary text, instead of using broad substring checks.

## 2026-06-19 — audit-barrage lift (20260619T025209477Z-027-roadmap-edge-mutation-and-cluster-phase-2)

### AUDIT-20260619-27 — `EXPECTED_SUBACTIONS` does not include `group`, so "full subaction set" assertion is false after Phase 4

Finding-ID: AUDIT-20260619-27
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/cli/parser-adapter.test.ts:32-36, 99-108

`EXPECTED_SUBACTIONS` enumerates 12 subactions (`next`, `blocked`, `blocks`, `order`, `graph`, `add`, `advance`, `decompose`, `reclassify`, `defer`, `reconcile`, `close-related`) and the describe label at line 99 claims this exercises "the full subaction set." Phase 4 (commit `0737431f`, T010-T015) adds a `group` verb. Because `tests/cli/parser-adapter.test.ts` is a new file whose full content is in this diff, `group` was never added. The test that checks `registered.toContain(sub)` for each entry in `EXPECTED_SUBACTIONS` will not catch a future regression where `group` is dropped from the commander mount, because `group` is never in the loop. Worse: if `KNOWN_SUBACTIONS` (imported at line 27 and used for the error-message assertion at line 130) already includes `group`, the error-message test pins `group` in the known list while the registration test does not check that `group` is actually mounted — a logical gap where the CLI could advertise `group` as known but fail to route it, and this test suite would stay green. Adding `'group'` to `EXPECTED_SUBACTIONS` and deriving both arrays from `KNOWN_SUBACTIONS` (see finding -03) closes both gaps at once.

---

### AUDIT-20260619-28 — `non-regression.test.ts` has no case for the `group` subaction

Finding-ID: AUDIT-20260619-28
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/non-regression.test.ts (entire file)

The non-regression suite covers every subaction that existed through Phase 2 (`next`, `blocked`, `blocks`, `order`, `graph`, `add`, `advance`, `decompose`, `reclassify`, `defer`, `reconcile`, `close-related`) but has no `it` block for `group`, which Phase 4 (T010-T015) introduces. As a new file whose complete content is visible in this diff, the absence is unambiguous — Phase 4 did not add a `group` case. The non-regression file's stated purpose is a regression guard for the commander-mount surface; a new verb exercised nowhere in that guard means Phase 4's `group` verb could silently break (wrong exit code, wrong dry-run / --apply semantics, wrong `--doc` threading) without this suite catching it. A representative `group` invocation mirroring the style of the other 12 cases is the fix.

---

### AUDIT-20260619-29 — `EXPECTED_SUBACTIONS` is a local duplicate of the imported `KNOWN_SUBACTIONS`

Finding-ID: AUDIT-20260619-29
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts:32-37 and line 27

`KNOWN_SUBACTIONS` is imported from `../../src/subcommands/roadmap.js` at line 27 and used for the error-message assertion at line 130 (`(known: ${KNOWN_SUBACTIONS})`). At lines 32-37, a separate local constant `EXPECTED_SUBACTIONS` enumerates what should be an identical list for the registration check. These two lists can drift independently: if a new subaction is added to the source-of-truth `KNOWN_SUBACTIONS`, the error-message test automatically reflects it while the registration check does not (finding -01 demonstrates this already happened with `group`). The fix is to drop `EXPECTED_SUBACTIONS` and drive the registration loop from `KNOWN_SUBACTIONS` directly, making the two checks share one source of truth.

---

### AUDIT-20260619-30 — Describe block labels T003 for behavior that is T004's deliverable

Finding-ID: AUDIT-20260619-30
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/cli/parser-adapter.test.ts:99

The describe block at line 99 reads `'027 T003 — buildRoadmapCommand mounts the full subaction set onto commander'`. The file header (lines 1-14) is explicit that these tests are "RED until T004 mounts roadmap onto commander" — so T003 writes the tests, T004 delivers the implementation. The describe label claiming T003 owns the mount behavior is misleading to a future reader auditing which task is responsible for what surface, and makes it harder to trace a regression back to the implementing task. Changing the label to `T004` or `T003/T004` (RED-first by T003, GREEN by T004) accurately reflects the authorship split described in the header.

---

### AUDIT-20260619-31 — `runCli` `cwd` option in `reconcile` test is unverifiable from this diff

Finding-ID: AUDIT-20260619-31
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/non-regression.test.ts:154

Line 154 passes `{ cwd: baseDir }` as a second argument to `runCli`:

```typescript
const r = runCli(['roadmap', 'reconcile', '--doc', docPath], { cwd: baseDir });
```

`runCli` is imported from `../../src/__tests__/_run-helpers.js`, which is not in this diff. If `runCli` does not thread the `cwd` option through to the spawned subprocess, the `reconcile` verb will resolve relative spec-directory paths (`specs/x`, `specs/orphan`, `specs/missing`) against the test runner's working directory rather than `baseDir`. The test relies on finding `specs/orphan` as a discovered-but-unregistered spec to assert orphan detection; if `cwd` is silently dropped, that assertion passes vacuously (no orphan found) or fails with a different error. The fix is either to confirm `_run-helpers.ts` threads `cwd` (and add a brief comment here referencing it) or to convert the relative paths to absolute within the test.

### AUDIT-20260619-32 — Parent `--doc` is declared but rejected before commander parses it

Finding-ID: AUDIT-20260619-32
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap-command.ts:124-160; tests/roadmap/non-regression.test.ts:29-37; tests/cli/parser-adapter.test.ts:111-115

`buildRoadmapCommand()` declares `--doc` on the parent command as a universal/global option, and the parser-adapter test asserts that this parent flag exists. But `runRoadmapCommand()` reads `args[0]` as the subaction and exits 2 whenever it starts with `--`, explicitly including `roadmap --doc x` in the usage-error comment. That means the normal commander/global form `stackctl roadmap --doc ROADMAP.md next` is rejected before commander can parse it.

The regression suite only exercises `--doc` after the subaction, for example `roadmap next --doc <path>`, so it does not catch the broken global-option path. The blast radius is a real CLI failure for operators or unattended agents using the advertised parent option in the conventional position; no write occurs, but the command cannot run. A reasonable fix is to either support leading global options before subaction, or stop declaring/documenting `--doc` as a parent/global option and pin the accepted grammar in tests.

## 2026-06-19 — audit-barrage lift (20260619T025526590Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-33 — `--chain` is silently accepted by the parser for every roadmap subaction, not just `cluster`/`group`

Finding-ID: AUDIT-20260619-33
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts` — the `scanFlags` function (the `scanVerbFlags` call, diffed lines near `['apply', 'clear', 'chain']`)

`scanFlags` now registers `chain` in the universal boolean list passed to `scanVerbFlags`:

```ts
const s = scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ALL_VALUE_FLAGS);
```

This makes `--chain` accepted without error for **every** roadmap subaction — `defer`, `advance`, `decompose`, `reclassify`, `add`, `blocks`, and all others whose `SUBACTION_SPECS` entries have no `chain` field. An operator who mistypes `stackctl roadmap defer impl:feature/x --until 2026-12-01 --chain` receives no parse error; the flag is consumed and silently ignored.

The existing `apply`/`clear` globals are arguably intentional — `--apply` affects all mutation subactions and `--clear` is documented as affecting all. `--chain` is meaningful only for `cluster`/`group` (it threads a `depends-on` dependency chain through the children). Silently accepting it on unrelated subactions is an operator footgun: a copy-paste error or misremembering of which subaction supports `--chain` goes uncorrected.

Blast radius: any operator who uses `--chain` with the wrong subaction gets a silent no-op instead of a helpful parse error. The fix is to gate `chain` in `scanVerbFlags` by inspecting the active subaction's grammar (i.e., include `chain` in the boolean list only when the subaction declares `chain: true`), or to validate and reject it post-scan when the active subaction doesn't permit it.

---

### AUDIT-20260619-34 — Nondrift check (3) cannot detect the "silently accepted but not declared" gap for `--chain`

Finding-ID: AUDIT-20260619-34
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/roadmap/help-nondrift.test.ts` — the `"${sub}: a bogus --zzz-not-a-flag is rejected"` loop (lines ~195–210)

The check (3) bogus-flag test exclusively probes `--zzz-not-a-flag` — a token that is genuinely unknown to the parser. It does NOT test that `--chain` is rejected for subactions like `defer` or `advance`. Because the global boolean list (Finding 01) makes `--chain` accepted for all subactions, writing `roadmap defer ... --chain` would exit 0 today. A test asserting "defer rejects `--chain`" would fail if added. The test gap means Finding 01 cannot be caught by the existing suite.

Blast radius: bounded. This is a test coverage gap that masks a usability bug; no data is corrupted. The fix is a spot-check assertion — symmetric with the existing `"advance: an undeclared --bogus is rejected"` block — that explicitly asserts `--chain` is rejected (exit 2, "unknown flag") for at least one non-cluster subaction such as `defer`. That assertion would fail today and would become the RED that drives the actual parser fix.

---

### AUDIT-20260619-35 — `emitCluster` bypasses `reportMutation`, creating an inconsistent error surface

Finding-ID: AUDIT-20260619-35
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts` — `emitCluster` function (diffed lines +220 to +232)

Every other mutation emitter in `roadmap.ts` delegates output to `reportMutation`:

```ts
// emitDefer (context, not in diff — the pattern)
reportMutation(defer(flags.doc, id, change, opts, flags.apply), 'defer', id);
```

`emitCluster`, by contrast, directly accesses `result.applied` and writes two custom strings to `process.stdout.write`:

```ts
const result = cluster(flags.doc, input, opts, flags.apply);
process.stdout.write(
  result.applied
    ? `roadmap ${verb}: grouped …\n`
    : `roadmap ${verb}: dry-run — would group …\n`,
);
```

`reportMutation` is the shared surface for non-applied failure modes (unknown identifier, validation rejection, conflict). If `cluster()` can return an error-shaped result — and `cluster` is the most structurally complex mutation added in this feature, touching parent creation, child re-parenting, and optional `depends-on` chain wiring — `emitCluster` will either silently omit the error report or propagate an unhandled exception. The `cluster.js` implementation is not in this diff, so the assumption that `ClusterResult` is always either `{ applied: true }` or `{ applied: false }` with no error states cannot be verified.

Blast radius: if `cluster()` throws on an invalid child identifier or a cycle, the exception surfaces as an unformatted stack trace instead of the "roadmap cluster: …" error message that `reportMutation` would emit. Operators get a different error presentation for cluster than for all other mutations. Fix: either adapt `ClusterResult` to `MutationResult` shape and use `reportMutation`, or explicitly handle every non-`applied` state in `emitCluster` with the same message format `reportMutation` would produce.

---

### AUDIT-20260619-36 — No CLI-layer guard against an empty `--children` list

Finding-ID: AUDIT-20260619-36
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts` — `clusterInputFrom` (diffed lines +208 to +214)

```ts
const children = requireValue(flags, 'children')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
return { parentId, children, chain: flags.chain, summary: flags.values.get('summary') };
```

`requireValue` ensures `--children` was passed but makes no assertion about content. After `split/trim/filter`, `children` can still be `[]` — for example from `--children ""` or `--children ",,,"`. The empty array is forwarded directly to `cluster()` in `cluster.js` (not in this diff). Whether `cluster.js` validates non-emptiness is unknown; if it does not, the operation would create a parent cluster with zero children — a logically vacuous node that the roadmap graph would then carry permanently (unless `--apply` was omitted, in which case the dry-run would silently report nothing to group).

Blast radius: bounded to misuse scenarios, but the CLI is the right place to reject this because `requireValue` already establishes the pattern of failing fast on bad input. Fix: add `if (children.length === 0) failUsage(verb, '--children must name at least one identifier')` immediately after the `filter` call.

### AUDIT-20260619-37 — Flat dispatcher still emits the old truncated roadmap usage

Finding-ID: AUDIT-20260619-37
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap.ts:99-104 and src/subcommands/roadmap.ts:436-445

The diff updates `KNOWN_SUBACTIONS` at lines 99-104 and documents it as the single source so the flat path and commander mount emit the same discovery list. But `runRoadmapCli`, which the file still describes as “retained as the behavior reference and for any direct caller,” keeps the old hardcoded no-subaction message at lines 442-445: `roadmap <next|blocked|add> [flags]`.

The live commander path appears to use `renderRoadmapUsage()`, so ordinary `stackctl roadmap` may be covered, but direct callers of `runRoadmapCli` still get an incomplete usage surface that omits `blocks`, `order`, `graph`, `cluster`, `group`, `reconcile`, and `close-related`. The blast radius is medium because it does not break the primary command path, but it violates the feature’s stated self-documenting surface for a preserved public/internal entry point. A reasonable fix is to replace the hardcoded literal with `renderRoadmapUsage()` or otherwise use the same complete subaction source here.

## 2026-06-19 — audit-barrage lift (20260619T030042000Z-027-roadmap-edge-mutation-and-cluster-phase-4)

### AUDIT-20260619-38 — `cluster.ts` implementation is entirely absent from the diff

Finding-ID: AUDIT-20260619-38
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/roadmap/cluster.ts` (absent) — imported at `src/subcommands/roadmap.ts:23`

The diff adds `import { cluster, type ClusterInput } from '../roadmap/cluster.js'` and routes both `cluster` and `group` verbs through `emitCluster`, which calls `cluster(flags.doc, input, opts, flags.apply)`. But `src/roadmap/cluster.ts` is entirely absent from the audited diff. All of the feature's load-bearing correctness logic lives there: cycle detection, FR-014 conflict detection, the multi-parent append that avoids duplicate edges, the atomic write sequence, and the refusal paths that must exit 2 and leave the file byte-for-byte unchanged (contracts asserted in `cluster-refusal.test.ts`). None of that is auditable from what was provided.

The test suite covers the behavioral contracts at the CLI boundary, which is good, but the implementation that must satisfy those contracts is opaque. If `cluster.ts` was created in the same commit range but excluded from the diff by a filtering step, this is an audit gap that needs to be closed before any findings in this report can be considered complete. If the file is genuinely not present in the repo, the import would fail at runtime and every `cluster`/`group` invocation would throw a module-not-found error — which is a blocking defect.

---

### AUDIT-20260619-39 — T010 chain-wiring test is non-falsifiable against the `chain` fixture

Finding-ID: AUDIT-20260619-39
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/roadmap/cluster.test.ts:55–66`

The first test in `cluster.test.ts` is titled "create-NEW parent + --chain: wires part-of on each child and **depends-on a→b→c**". Its chain-wiring assertion is:

```typescript
expect(model.byId.get('impl:feature/c')!.dependsOn).toContain('impl:feature/b');
```

The comment immediately above the test describes the `chain` fixture as already having `c depends-on b`. The `--chain` flag is supposed to ADD this dependency, but the assertion would pass even if `--chain` did nothing at all — the pre-existing fixture edge satisfies the `.toContain` check regardless. If `cluster --chain` silently dropped all chain logic, this test would still be green.

The second test (`--chain wires depends-on in argument order over fresh children`, lines 69–94) correctly uses `writeTempRoadmap` with items that have no pre-existing dependencies and properly exercises the wiring. The first test should either use a fixture without a pre-existing `c→b` edge, or add an assertion that a dependency was ADDED where none existed before (e.g., assert an intermediate item gained a dep it did not have in the fixture). As written, the test provides no signal about chain-wiring correctness.

---

### AUDIT-20260619-40 — `WorkItem.partOf` type change from `string | null` to `readonly string[]` — consumers outside the diff are unverified

Finding-ID: AUDIT-20260619-40
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/roadmap/roadmap-model.ts:22`, cross-cutting with all consumers of `WorkItem`

`WorkItem.partOf` is changed from `string | null` to `readonly string[]`. The diff updates the model, the `toWorkItem` projection (`roadmap-model.ts:149`), and the two new test files. But the diff does not show any updates to the rendering/display paths that previously consumed `partOf` as a nullable string — for example, the `graph` subaction output, the `order` or `next` display code, or any template that previously had a null-check of the form `if (item.partOf !== null)` or stringified `partOf` directly.

TypeScript strict mode should have caught all such call sites at compile time if they were not updated; the project rules prohibit `any`/`as` bypasses, so a clean compile would be evidence of correctness. However, the diff alone cannot confirm this. If any consumer was left with the old `string | null` assumption but bypassed the type system (dynamic access, JSON round-trips, or a widened type), it would silently produce `[object Object]` in rendered output or fail a null check. The operator should confirm that `tsc --noEmit` is clean on this branch before merging.

---

### AUDIT-20260619-41 — `--chain` is scanned as a global boolean flag for all roadmap subactions

Finding-ID: AUDIT-20260619-41
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts:105` (`scanFlags`)

```typescript
const s = scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ALL_VALUE_FLAGS);
```

`chain` is added to the list of boolean flags parsed by the shared `scanFlags` function, which is called for every roadmap subaction before the subaction is dispatched. This means `--chain` is silently accepted (and silently ignored) by `add`, `advance`, `decompose`, `defer`, `reclassify`, and every other verb. Only `cluster`/`group` read `flags.chain`. An operator typo of `roadmap advance impl:foo --chain` would produce no error and no effect — the flag is consumed and discarded. The other subaction-specific value flags (`into`, `to`, `until`) appear to share the same global scan pattern (`ALL_VALUE_FLAGS`), so this is consistent with existing practice, but the introduction of a new silently-ignored boolean deserves acknowledgment. If `scanVerbFlags` supports per-verb flag allowlisting via the `SUBACTION_SPECS.chain` property, that mechanism should be confirmed to be active.

---

### AUDIT-20260619-42 — `emitCluster` dry-run message omits create-vs-reuse distinction

Finding-ID: AUDIT-20260619-42
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts:218–223`

```typescript
result.applied
  ? `roadmap ${verb}: grouped ${input.children.join(', ')} under ${input.parentId}${chainNote}\n`
  : `roadmap ${verb}: dry-run — would group ${input.children.join(', ')} under ${input.parentId}${chainNote} (use --apply to write)\n`
```

The `cluster` verb has two distinct behavior branches for the parent: it either **creates** a new `planned` unit or **reuses** an existing one (preserving its status). The dry-run message — the only user-visible output in the default no-`--apply` invocation — does not indicate which branch would be taken. An operator cannot tell from `dry-run — would group b, c under multi:feature/grp` whether `multi:feature/grp` is about to be created (and at what status) or reused. This is particularly consequential when the parent exists at a non-default status (`in-flight`, `shipped`), since the operator may not realize the reuse semantics will preserve that status rather than reset it to `planned`. The other mutation verbs (`defer`, `decompose`) emit messages that are unambiguous about their operation; `cluster` should follow the same principle.

---

### AUDIT-20260619-43 — `requireValue(flags, 'children')` exit code for the omitted-flag case is unverifiable from the diff

Finding-ID: AUDIT-20260619-43
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts:208` (`clusterInputFrom`)

`cluster-refusal.test.ts` asserts that `roadmap cluster multi:feature/grp --doc <path> --apply` (no `--children`) exits with code 2. The `clusterInputFrom` function calls `requireValue(flags, 'children')`, which is a shared helper not shown in the diff. If `requireValue` exits with code 1 (a generic usage error) rather than code 2 (the spec's required exit code for refusals), the test would fail and the FR-011–015 zero-write contract would be untestable. The analogous `requireId` is used in `emitDecompose` and `emitDefer` under the same `failUsage`/`failMissing` pattern; those verbs' error cases presumably exit 2 already, but the diff provides no confirmation that `requireValue` shares that contract. If the helper exits 1 instead of 2, the refusal test for the omitted-`--children` case would be a false red rather than a specification failure — worth confirming before the test suite is trusted as the acceptance signal for FR-011.

### AUDIT-20260619-44 — Empty `--part-of` is silently accepted

Finding-ID: AUDIT-20260619-44
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap.ts:155-164; src/roadmap/mutations.ts:102-104

`addInputFrom` now parses `--part-of` as a comma-list and filters empty tokens. When an operator runs `roadmap add impl:feature/x --part-of , --apply`, that produces `partOf: []`; then `buildSection` omits the `part-of` line entirely. The mutation succeeds and creates an ungrouped item, even though the operator supplied a malformed grouping flag.

This is a multi-parent regression shape: the old scalar path would have emitted a malformed `- part-of: ,` edge and validation would fail loud. `cluster --children` already treats an empty parsed list as invalid, so `add --part-of` should do the same when the flag is present and parses to zero targets. Blast radius is medium: it does not corrupt the graph, but an adopter can ship a roadmap item without the requested parent edge and get a successful CLI result.

### AUDIT-20260619-45 — Multi-line existing `part-of` fields can gain duplicate targets

Finding-ID: AUDIT-20260619-45
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/cluster.ts:48-52; src/roadmap/mutations.ts:52-66

`appendEdge` rewrites every matching edge line independently via `rewriteEdgeLine`. The document engine supports repeated edge-field lines by merging targets, so this is valid input: `- part-of: multi:feature/a` plus `- part-of: multi:feature/b`. If `roadmap cluster multi:feature/a --children <child>` runs on that child, the first line is unchanged but the second line is rewritten to include `multi:feature/a`, producing the same target twice in the merged edge list.

That violates the advertised exact-duplicate no-op behavior and makes the mutation non-idempotent for a valid document shape. The downstream blast radius is medium: duplicated unit-edge targets can duplicate graph output and make later mutation behavior noisier, even though referential integrity still passes. A reasonable fix is to normalize the aggregate target set for the field before rewriting, either by collapsing repeated field lines into one canonical line or by only appending the target to one selected field line when it is already present anywhere in the unit.

## 2026-06-19 — audit-barrage lift (20260619T031603143Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-46 — `--chain` is silently accepted by all subactions, not just `cluster`/`group`

Finding-ID: AUDIT-20260619-46
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts` — `scanFlags` function (diff hunk ~line 117)

`--chain` is registered as a **global boolean** in `scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ALL_VALUE_FLAGS)`. This means the scanner accepts `--chain` for **every** roadmap subaction — including `advance`, `defer`, `decompose`, and all the others — silently ignoring it. Only `cluster` and `group` carry `chain: true` in `SUBACTION_SPECS`, so only those two subactions surface `--chain` in their `--help` output.

The non-drift test's check (3) does not catch this gap. Check (3) only tests that a truly unknown flag (`--zzz-not-a-flag`) is rejected; it does not test that a globally-registered-but-locally-undeclared flag (like `--chain` for `advance`) is rejected. So `roadmap advance impl:feature/b --to in-flight --chain` exits 0 with no warning. The "strict non-drift" invariant the test comment promises holds for help→grammar and grammar→help, but not for parser→grammar on non-universal flags.

The blast radius is UX confusion rather than data corruption: an operator who mistypes `roadmap defer impl:x --until 2027 --chain` (perhaps copying from a cluster invocation) gets a silent successful defer with no indication that `--chain` was ignored. A reasonable fix is either (a) add per-subaction flag validation after `scanFlags` that fatally errors on non-applicable flags, or (b) accept the global-passthrough design but add a note to the non-drift test explaining why check (3) intentionally does not assert per-subaction flag rejection for `--chain`.

---

### AUDIT-20260619-47 — Empty `--children` list not validated in `clusterInputFrom`

Finding-ID: AUDIT-20260619-47
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts` — `clusterInputFrom` function (diff hunk ~lines 219–228)

The `clusterInputFrom` function computes `children` via the same split/trim/filter chain used in `addInputFrom`, but **omits the empty-result guard** that the immediately-adjacent `addInputFrom` fix introduces:

```typescript
// addInputFrom (added in this diff — correctly guards):
if (partOf !== undefined && partOf.length === 0) {
  failUsage('roadmap', 'add: --part-of was given but lists no parent id');
}

// clusterInputFrom (same diff — missing guard):
const children = requireValue(flags, 'children')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
return { parentId, children, chain: flags.chain, summary: flags.values.get('summary') };
// ← no check that children.length > 0
```

Passing `--children ","` or `--children "  "` produces `children = []`. That empty array is forwarded to `cluster()`. Depending on what `cluster.ts` does with zero children, the outcome is either a silent no-op (the parent node is created or reused but nothing is grouped) or a confusing error from deep in the mutation logic with no reference to the flag that caused it. The emitted success message `roadmap cluster: grouped  under <parentId>` (two spaces, empty list) is a visible symptom.

The fix is a direct copy of the guard pattern already present in the same file:
```typescript
if (children.length === 0) {
  failUsage('roadmap', 'cluster: --children was given but lists no child ids');
}
```

The non-drift tests exercise `--children impl:feature/b,impl:feature/c` (valid, non-empty), so this path has no regression coverage.

---

### AUDIT-20260619-48 — `--part-of` silently changed from single-ID to multi-ID with no help-text update visible in the diff

Finding-ID: AUDIT-20260619-48
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts` — `addInputFrom` (diff hunk ~lines 154–169); `src/cli-help/roadmap-help.js` (absent from diff)

The `addInputFrom` rewrite changes `--part-of` from a single scalar (`v.get('part-of')` → `string | undefined`) to a comma-separated multi-value field (`split(',').map(…).filter(…)` → `string[] | undefined`). This is a **behavioral extension**: `--part-of impl:a,impl:b` now produces two parent edges instead of one. The change must be propagated to at least three surfaces:

1. **`AddInput.partOf` type** — was `string | undefined`, now must be `string[] | undefined`. The file where `AddInput` is defined (`src/roadmap/mutations.ts` or similar) is not in the diff. TypeScript strict mode would catch any mismatch at compile time, so this is almost certainly consistent — but it is invisible in this diff.
2. **Help text** — `roadmap add --help` likely still says `--part-of <parent-id>` (singular), but the flag now accepts `<id[,id,…]>`. The file `src/cli-help/roadmap-help.js` (referenced by `flagNamesFor` in the test) is absent from the diff.
3. **The `add` fixture in `help-nondrift.test.ts`** — tests `--part-of design:feature/a` (single ID). There is no test for `--part-of design:feature/a,impl:feature/b` (multi-ID), so the new multi-ID parse path has no regression coverage.

Blast radius: an operator reading `add --help` and following the singular `<parent-id>` syntax would never discover comma-separation is supported. More importantly, if `roadmap-help.js` still describes `--part-of` as taking a single ID, the T007 and T006 help-surface tests pass while the documentation silently misrepresents the accepted grammar.

### AUDIT-20260619-49 — Help-surface test can pass without per-subaction summaries

Finding-ID: AUDIT-20260619-49
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/help-surface.test.ts:27-32

The test claims `roadmap --help` lists every subaction plus a one-line summary, but it only checks that each subaction name appears somewhere in stdout, then checks two hardcoded summary fragments: `list the ready` and `dry-run unless --apply`. That does not prove every listed subaction has its own summary row. A renderer that printed all names but only summaries for `next` and one mutation verb would still satisfy these assertions.

Blast radius is low because the current implementation in `src/cli-help/roadmap-help.ts` does render summaries through `summaryFor`, so this is a test-contract gap rather than a shipped behavior failure. A reasonable fix is to parse the `Subactions:` block row-by-row and assert each registered subaction has a non-empty description column, ideally keyed by exact subaction token rather than substring containment.

## 2026-06-19 — audit-barrage lift (20260619T032003539Z-027-roadmap-edge-mutation-and-cluster-phase-4)

### AUDIT-20260619-50 — `WorkItem.partOf` type changed from `string | null` to `readonly string[]` — not all consumers visible in diff

Finding-ID: AUDIT-20260619-50
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/roadmap/roadmap-model.ts:19-26` and any consumer not shown in this diff

`WorkItem.partOf` was widened from `string | null` to `readonly string[]`. Every consumer that previously accessed the field as a nullable string — branching on `item.partOf !== null`, interpolating it into a string, passing it to a function typed `string` — is now a TypeScript error. The diff confirms the `toWorkItem` projection was updated (`roadmap-model.ts:146`) and `decompose` in `mutations.ts` was updated. `addInputFrom` in `roadmap.ts` was also updated. However, the diff does not include the `--graph`, `--next`, `--blocked`, `--blocks` display paths, `reconcile.ts`, or any other roadmap consumer. The comment in the new interface says "Readers that want 'the first parent' take `partOf[0]`", which implies the author knew callers would need to be updated and directed them — but the diff doesn't prove all callers were in fact updated. If any consumer compiles against the old `string | null` shape, it will either produce a TS error (caught at build time) or, if it was widening-compatible by accident, silently produce wrong output (e.g., `[object Object]` when an array lands where a string is expected). The blast radius is every roadmap subcommand that reads group membership.

A reasonable remediation: confirm via `grep -rn '\.partOf' src/` that every call site applies the new array interface correctly, particularly in display verbs (`graph`, `next`, `blocked`) and in `reconcile`.

---

### AUDIT-20260619-51 — "Creates a cycle" refusal test actually exercises conflict detection, not cycle detection — cycle path through `commitCandidate` is untested

Finding-ID: AUDIT-20260619-51
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/roadmap/cluster-refusal.test.ts:71-89`

The test labeled "a --chain ordering that creates a cycle → exit 2, zero write" uses the fixture graph `a (shipped) → b → c` with `--children impl:feature/c,impl:feature/b`. For index 1 (b), `chainPredecessor` resolves predecessor = `impl:feature/c`. It then checks: `b` already has `depends-on: impl:feature/a`; `existing.length > 0` is true; `existing.includes('impl:feature/c')` is false → **conflict throw** before any write. Exit 2 is correct, but the mechanism is the pre-write `chainPredecessor` guard, not `commitCandidate`'s whole-graph cycle detection. The comment in `cluster.ts:14` specifically says "cycle/dangling/self are caught (also zero-write) by `commitCandidate`'s whole-graph revalidation — defense in depth", but this defense-in-depth path is never exercised by the test suite as shipped.

A scenario that would test the actual cycle path: a fresh graph where `x` and `y` have no pre-existing `depends-on` edges, clustered with `--children y,x --chain` (setting `x.depends-on = y`). If the document also has `y.depends-on = x` already, then `chainPredecessor` for `x` (predecessor = `y`) would find `x` has NO existing deps, return `y`, and allow the build to proceed. `commitCandidate` would then catch the cycle. No such test exists. The consequence: if `commitCandidate`'s cycle check were accidentally removed or regressed, the labeled "cycle" test would continue to pass via the conflict path, providing false confidence.

---

### AUDIT-20260619-52 — `--summary` flag value is never asserted in the test suite

Finding-ID: AUDIT-20260619-52
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/roadmap/cluster.test.ts:31-57`

The first `cluster` test passes `--summary 'the grouped work'` and asserts `status: 'planned'` and the presence of `part-of` edges, but never checks that the summary was actually written into the created parent. In `cluster.ts:parentBody`, `scope: input.summary` is forwarded to `buildSection`, which emits `- scope: <summary>` as a line in the parent section. If this line were accidentally dropped — for example, if `buildSection` were changed to handle `scope` differently or if `parentBody` stopped passing `summary` — no test would catch the regression. The `scope` field is operator-visible (`stackctl roadmap graph` presumably shows it), so silent loss is a user-facing regression.

---

### AUDIT-20260619-53 — `KNOWN_SUBACTIONS` string updated in `roadmap.ts` but the co-located comment names a second source of truth

Finding-ID: AUDIT-20260619-53
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts:103-105`

The inline comment on `KNOWN_SUBACTIONS` says `(FR-006; AUDIT-BARRAGE-codex-01)` and notes "The order is the discovery order operators have learned, kept stable." The prior audit finding (`AUDIT-BARRAGE-codex-01`) flagged the need for byte-identical sync between `roadmap.ts` and `roadmap-command.ts`. The diff updates `roadmap.ts` to add `cluster, group` but does not show the corresponding change in `roadmap-command.ts`. If that file also carries a hardcoded subaction string, it was either updated in a commit not shown here or it has drifted. The operator receives the wrong error message on an unknown subcommand if only one of the two strings is updated.

---

### AUDIT-20260619-54 — Duplicate entries in `--children` produce a self-edge with an opaque error when `--chain` is active

Finding-ID: AUDIT-20260619-54
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/roadmap/cluster.ts:106-115` (`clusterInputFrom` in `src/subcommands/roadmap.ts:213-219`)

`clusterInputFrom` builds `childSet = new Set(input.children)` to dedup during the body walk, so duplicate children are silently collapsed for `part-of` writes. With `--chain`, however, `chainPredecessor` is called with the raw `input.children` array (including duplicates). For `--children a,a,b`, index 1 (the second `'a'`) resolves predecessor = `children[0]` = `'a'` — a self-reference. `predecessor.set('a', 'a')` is stored. During the body walk, unit `'a'` is processed once (via `childSet`) and `appendEdge(body, 'depends-on', 'a')` is called, producing `- depends-on: a` — a self-edge. `commitCandidate` catches this and returns exit 2 with zero write, but the error message describes a graph self-edge, not a duplicated `--children` argument. The operator gets a confusing "self-edge detected" message instead of "duplicate id in --children". No pre-write validation exists for this input shape, and no test covers it. The blast radius is limited to operator confusion, since correctness is preserved by `commitCandidate`.

### AUDIT-20260619-55 — Cluster can write edges into fenced examples instead of real metadata

Finding-ID: AUDIT-20260619-55
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/roadmap/cluster.ts:48-72, src/roadmap/cluster.ts:171-172

`appendEdge` scans raw unit body lines with `fieldRe`/`lineRe` and treats the first matching `- part-of:` or `- depends-on:` line as metadata, regardless of whether that line is inside a fenced code block. The document edge extractor intentionally ignores field-looking bullets inside fences, so a child whose scope contains an example like ```` ```\n- part-of: example\n``` ```` before its real metadata, or without real metadata, will have the new cluster edge appended to prose/code instead of to an actual edge field. `commitCandidate` then revalidates successfully because no real dangling edge was added, and the CLI reports success even though the child was not grouped or chained.

The blast radius is high because this is a silent false-success mutation on the primary new verb: adopters can run `roadmap cluster --apply`, get exit 0, and still have no effective `part-of`/`depends-on` edge for affected items. A reasonable fix is to make `appendEdge` use the same fence-aware field detection semantics as `extractEdges`/`scopeOf`, matching only real metadata bullets outside fenced code blocks and inserting a new metadata line when no real field exists.

## 2026-06-19 — audit-barrage lift (20260619T033114047Z-027-roadmap-edge-mutation-and-cluster-phase-4)

### AUDIT-20260619-56 — `SubactionGrammar` type likely missing `chain?: boolean` — TypeScript excess-property error

Finding-ID: AUDIT-20260619-56
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap.ts:75-94

`SUBACTION_SPECS` is typed as `Readonly<Record<string, SubactionGrammar>>`. The new `cluster` and `group` entries add `chain: true`, a property not present on any existing entry. TypeScript performs excess-property checking on nested object literals assigned to a typed record, so if `SubactionGrammar` doesn't declare an optional `chain?: boolean` field, both entries are a compile-time error. The diff contains no update to `SubactionGrammar` — it's either defined in a file not shown in the diff (and already has the field) or the type is more permissive than expected (e.g., an index signature). Worth verifying: `grep -n 'SubactionGrammar' src/subcommands/roadmap.ts` to confirm the interface includes `chain`.

The blast-radius is bounded to the TypeScript compilation step — if the build currently fails, nothing ships. But if the type was quietly declared as a looser form (`{ [k: string]: unknown } & ...`), the `chain` field in `SUBACTION_SPECS` becomes unchecked documentation rather than a type-enforced contract, which means future callers that read `spec.chain` from the grammar object get `undefined` where they expect `true`.

---

### AUDIT-20260619-57 — `WorkItem.partOf` changed from `string | null` to `readonly string[]` — non-TypeScript consumers not updated in this diff

Finding-ID: AUDIT-20260619-57
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/roadmap-model.ts:22, 149

The `partOf` field on `WorkItem` changes from a nullable single-string to an array. TypeScript's compiler catches all in-tree callers that treat `partOf` as `string | null` — patterns like `if (item.partOf !== null)`, `item.partOf === 'some-id'`, or `item.partOf!.includes(...)` would be compile errors. The concern is runtime consumers outside the TypeScript type system: skill scripts that `JSON.parse` a `stackctl roadmap graph` or `stackctl roadmap next` JSON dump and read `.partOf` as a string; any documentation or quickstart that describes `partOf` as a single-parent field; and the `roadmap graph` output format (not in the diff) which may serialize `partOf` differently now that it is an array.

The diff shows the type change in `roadmap-model.ts` and the new cluster tests use `.toContain()` (array-compatible), but no existing `roadmap add` or `roadmap graph` tests appear in the diff. If those tests previously asserted `expect(item.partOf).toBe('some-parent')`, they now fail; if they used `.toContain()` they pass. The fact that neither the skill files nor the quickstart shows changes means this surface is unverified. A quick `grep -rn '\.partOf' src/ tests/` would reveal whether any callsite still treats it as a non-array.

---

### AUDIT-20260619-58 — `appendEdge` inserts new edge at body[1] — places `part-of` before `- status:` on units with no prior grouping

Finding-ID: AUDIT-20260619-58
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/roadmap/cluster.ts:79-82

When `appendEdge` finds no existing real field of the target type, it does:

```ts
const out = [...body];
out.splice(1, 0, `- ${field}: ${target}`);
return out;
```

For a typical unit body `['## identifier', '- status: planned', ...]` this produces `['## identifier', '- part-of: X', '- status: planned', ...]` — the new edge lands before the `status` field. `buildSection` (the canonical constructor used by `roadmap add`) emits fields in the order `status → depends-on → part-of`. `applyChildEdges` applies `part-of` first, then `depends-on`, both at position 1, producing the reverse order `depends-on → part-of → status`.

This is a cosmetic inconsistency: if the document engine is field-order-agnostic (which it appears to be, given that the tests pass), there is no functional defect. The blast-radius is limited to human-readable document format — an operator diffing a `cluster`-mutated ROADMAP against a hand-authored one will see a non-idiomatic field order. Worth noting as a quality issue that could be fixed by scanning for the `status` field's index and inserting after it, rather than always at index 1.

---

### AUDIT-20260619-59 — Newly-created parent section has no blank-line separator from the preceding unit

Finding-ID: AUDIT-20260619-59
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/roadmap/cluster.ts:139-145, src/roadmap/mutations.ts:92-103 (`buildSection`)

When `cluster` creates a new parent, it appends `newParentSection.join('\n')` to the `bodies` array:

```ts
if (newParentSection !== null) bodies.push(newParentSection.join('\n'));
```

`buildSection` returns lines without a leading or trailing blank line. `reassemble` joins all unit bodies with `'\n'`. If the last *existing* unit's `unitBodyLines` slice (from `span.endLine`) excludes the trailing blank line that conventionally separates units in the source document, the output will have the new parent immediately adjacent to the preceding unit with no separator:

```
## impl:feature/c
- status: planned
## multi:feature/grp     ← no blank line above
- status: planned
```

Whether this matters depends on the document parser. If it's tolerant of missing inter-unit blank lines (only requiring `## ` to open a unit), this is cosmetic. If blank lines are part of the span convention (i.e., `span.endLine` always includes the trailing blank), then it is handled and this finding is moot. Neither the diff nor the visible test fixtures confirm which case applies. A dedicated test — "after `cluster` creates a new parent, the output document has a blank line before the new parent's heading" — would resolve the ambiguity.

---

### AUDIT-20260619-60 — `emitCluster` success/dry-run message is identical for parent-create and parent-reuse

Finding-ID: AUDIT-20260619-60
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/roadmap.ts:221-229

The output line emitted by `emitCluster` is:

```
roadmap cluster: grouped impl:feature/b, impl:feature/c under multi:feature/grp
```

This message is the same whether `multi:feature/grp` was newly created (with `planned` status) or already existed with a different status (e.g., `in-flight`). An operator clustering items under an existing group has no indication that the operation left the parent's status untouched. A one-word annotation — `"grouped … under multi:feature/grp (new)"` vs `"grouped … under multi:feature/grp (existing)"` — would make the audit trail clearer and reduce operator surprise when a reused parent retains a non-`planned` status. No functional defect; the behavior is correct.

### AUDIT-20260619-61 — Quickstart commands use invalid roadmap identifiers

Finding-ID: AUDIT-20260619-61
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/027-roadmap-edge-mutation-and-cluster/quickstart.md:22-42

The quickstart says these are runnable scenarios, but the cluster examples use child ids `a,b,c,d` and `nonexistent`. The roadmap grammar requires identifiers shaped like `<phase>:<kind>/<slug>` (`impl:feature/foo`, `multi:feature/bar`, etc.), and the contract/code paths validate against existing roadmap units. An operator or unattended agent following this quickstart literally will not be exercising the intended success/refusal cases; the commands will fail for missing or invalid ids unless the reader silently rewrites them.

Blast radius is medium: the implementation can still work, but the feature’s end-to-end validation artifact is misleading. Replace the sample ids with valid roadmap ids throughout the quickstart, for example `impl:feature/a,impl:feature/b,impl:feature/c`, and make the fixture prerequisite name those exact nodes.

### AUDIT-20260619-62 — Data model still documents `partOf` as unchanged scalar state

Finding-ID: AUDIT-20260619-62
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/027-roadmap-edge-mutation-and-cluster/data-model.md:5-10

The implemented model widened `WorkItem.partOf` to `readonly string[]` in `src/roadmap/roadmap-model.ts`, but the feature data model still says `partOf: string | null` and explicitly says the WorkItem projection is “Unchanged by this feature.” The next line frames widening as a to-confirm implementation question, but the code has already made the decision.

Blast radius is medium because future work generated from this feature artifact can reasonably reintroduce scalar assumptions or miss multi-parent behavior. Update the data model to state the settled shape: `partOf: string[]`, empty array when ungrouped, multiple entries allowed.

## 2026-06-19 — audit-barrage lift (20260619T034122507Z-027-roadmap-edge-mutation-and-cluster-phase-4)

### AUDIT-20260619-63 — `WorkItem.partOf` empty-array is truthy — "has parent" boolean checks silently invert

Finding-ID: AUDIT-20260619-63
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    `src/roadmap/roadmap-model.ts:19-31` (type change) + every caller not shown in this diff

`WorkItem.partOf` changed from `string | null` to `readonly string[]`. For an item with no parent, the old value was `null` (falsy); the new value is `[]` (truthy — all arrays are truthy in JavaScript, including empty ones). Any call-site that tests presence with `if (item.partOf)` or the ternary `item.partOf ? A : B` or the guard `item.partOf && render(...)` now always enters the "has a parent" branch, even for completely ungrouped items. TypeScript strict-mode catches shape mismatches (passing a `readonly string[]` where a `string` is expected) but does **not** flag the boolean-context change — `if (someArray)` is valid TypeScript regardless of array length.

The diff does not show changes to the graph renderer, the `next`/`blocked`/`blocks` subcommands, or any display layer that might filter or format `partOf`. If any of those paths contains the pattern `if (item.partOf)` — a natural guard for the previous nullable string — they now emit parent-group labels or apply parent-scoped filtering for every item in the roadmap, regardless of actual grouping. The blast radius is proportional to how many callers used the truthiness pattern. Given the previous type was `string | null`, that pattern was idiomatic and likely present. The fix is to sweep all callers and replace `if (item.partOf)` with `if (item.partOf.length > 0)`.

---

### AUDIT-20260619-64 — `rewriteEdgeLine` processes only the first matching line — decompose + multi-line `part-of` leaves dangling references

Finding-ID: AUDIT-20260619-64
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/roadmap/mutations.ts:243-252` (decompose `part-of` rewrite) + `src/roadmap/mutations.ts:57-77` (`rewriteEdgeLine` body, not shown but implied by name)

The cluster feature (this diff) explicitly creates and tests units with two `- part-of:` lines (the multi-LINE test in `cluster.test.ts:178-218`). The `decompose` verb now calls `rewriteEdgeLine(body, 'part-of', repoint)` instead of the old inline lambda. The function name is `rewriteEdge**Line**` (singular), and the diff's existing usage pattern for `depends-on` (which was always single-valued) suggests it rewrites the FIRST matching `- field:` line in the body.

If a unit carries:
```
- part-of: A
- part-of: P          ← P is being decomposed
```
and `rewriteEdgeLine` only touches the first matching line (`A`), the second line (`P`) is left verbatim. After decompose, the document contains a `part-of: P` reference to an item that no longer exists — a silent dangling reference. The graph validator downstream would flag a missing-target error at a later, unrelated operation with no clue about the source.

No test in this diff covers the combination `cluster` (which creates multi-line `part-of`) followed by `decompose` of a parent. The correct fix is either (a) make `rewriteEdgeLine` rewrite ALL matching lines for the given field, or (b) document that the function's contract is limited to single-line fields and add an explicit guard that refuses `decompose` when the target unit carries multi-line `part-of` entries containing the identifier.

---

### AUDIT-20260619-65 — `--summary` silently discarded when the parent already exists — no warning, no test

Finding-ID: AUDIT-20260619-65
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/roadmap/cluster.ts:116-121` (`parentBody`) + `src/roadmap/cluster.ts:171-181` (`emitCluster` output)

`parentBody()` returns `null` for an existing parent, and `input.summary` is never used again:

```ts
function parentBody(doc: GovernableDocument, input: ClusterInput): string[] | null {
  const existing = findUnit(doc, input.parentId);
  if (existing !== undefined) return null; // reuse: emit verbatim from the unit walk
  return buildSection({ identifier: input.parentId, status: 'planned', scope: input.summary });
}
```

When `--summary "description"` is passed alongside a parent that already exists, the option is consumed by the flag scanner but has zero effect on the document. The CLI output is:

```
roadmap cluster: grouped a, b under existing-parent
```

There is no indication that `--summary` was silently dropped. The docstring on `ClusterInput.summary` says "for a NEWLY-created parent", so the intention is correct, but the interface makes the failure mode invisible. An operator who runs `roadmap cluster existing-parent --summary "updated description" --apply` and sees a 0-exit with no warning has no indication they need to use a different verb to amend the scope line. No test covers this case. The fix is to either emit a warning on stdout when `--summary` is given but ignored (`warning: --summary is ignored when parent already exists`), or treat it as a usage error and exit 2.

---

### AUDIT-20260619-66 — `appendEdge` inserts new field before the `status` line — formatting drift from canonical order

Finding-ID: AUDIT-20260619-66
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/roadmap/cluster.ts:75-80` (`appendEdge` no-existing-line branch)

When a unit has no existing `- part-of:` line, `appendEdge` inserts the new edge at body index 1 (immediately after the heading):

```ts
if (firstIdx === undefined) {
  const out = [...body];
  out.splice(1, 0, `- ${field}: ${target}`);
  return out;
}
```

For a typical unit:
```
## impl:feature/b          ← index 0
- status: planned          ← index 1
- depends-on: ...          ← index 2
```

The result is:
```
## impl:feature/b
- part-of: parent          ← spliced in at 1
- status: planned
- depends-on: ...
```

`buildSection` (the canonical constructor) emits fields in the order: heading → status → depends-on → part-of → other. `appendEdge` produces the opposite: heading → part-of → status → depends-on. The document model parser is field-order agnostic, so this is not a correctness bug. But a document where some units have `status` first and others have `part-of` first (depending on whether they were created with or without a parent, or had one added later) is visually inconsistent when operators read the raw markdown. The fix is to find the first non-heading, non-fenced body line and insert AFTER it (or after the last `- field:` line, whichever is later), matching `buildSection`'s ordering.

---

### AUDIT-20260619-67 — "Cycle" refusal test exercises the conflict guard, not the cycle detector — mislabeled contract

Finding-ID: AUDIT-20260619-67
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/roadmap/cluster-refusal.test.ts:68-90` (test name + comment)

The test titled `'a --chain ordering that creates a cycle → exit 2, zero write'` uses the fixture `a (shipped), b (dep a), c (dep b)` and clusters `c, b` with `--chain`. The chain predecessor for `b` (index 1 in `[c, b]`) is `c`. Child `b` already carries `depends-on: a`, and `a ≠ c`, so `chainPredecessor` fires the FR-014 conflict guard and throws before building any candidate. The test therefore exercises **the conflict refusal path**, not the downstream `commitCandidate` cycle detector.

A separate test (`'a --chain that forms a real cycle → exit 2 via whole-graph revalidation, claude-02'`) correctly exercises the cycle detector. The mislabeled test is not wrong (it correctly exits 2), but the description — including the inline comment `"children c,b means b depends on c, while c already depends on b → cycle"` — conflates two distinct mechanisms. A future maintainer reading the test would believe the conflict guard is the cycle guard, might remove one thinking they're duplicates, and would lose coverage. The fix is to rename the test to `'a --chain child with a CONFLICTING different depends-on → exit 2 (conflict guard, not cycle detector)'` and update its inline comment accordingly.

### AUDIT-20260619-68 — Empty `--children` entries are silently dropped

Finding-ID: AUDIT-20260619-68
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap.ts:216-222

`clusterInputFrom` parses `--children` with `split(',').map(trim).filter(nonEmpty)`, so a malformed list like `--children a,,b` or `--children a,` is accepted as `['a', 'b']` or `['a']`. The only empty-list refusal is downstream in `cluster()` after filtering, so partially empty input can still write a successful cluster while silently dropping an operator-supplied list entry.

The blast radius is medium because this can produce a valid but incomplete grouping: the command exits 0, writes under `--apply`, and the operator has no signal that the requested child list was malformed. A reasonable fix is to reject any empty token before filtering, while still producing the existing clear refusal for an entirely empty `--children` value.

### AUDIT-20260619-69 — `decompose` can duplicate `part-of` targets when repointing multi-parent groups

Finding-ID: AUDIT-20260619-69
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/mutations.ts:235-252

The new multi-parent repoint uses `targets.flatMap((t) => (t === identifier ? into : [t]))` for `part-of`. If an item is already grouped under the decomposed parent and also under one of the new parts, for example `part-of: parent, part-a` while decomposing `parent --into part-a,part-b`, the rewrite emits `part-a, part-b, part-a`. The graph validator shown here validates references and acyclicity, but this path does not deduplicate the rewritten target list.

The blast radius is medium because the feature deliberately widened `partOf` into a multi-parent list and treats exact duplicate grouping as a no-op elsewhere; this path can reintroduce duplicate parent targets into the public roadmap model. A reasonable fix is to make the repoint transform preserve order while removing duplicate targets before `rewriteEdgeLine` serializes the edge.

### AUDIT-20260619-70 — Roadmap skill guidance does not expose the new cluster/group verb

Finding-ID: AUDIT-20260619-70
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    missing documentation update in skills/roadmap/SKILL.md:3,61-72

The feature adds `roadmap cluster` and `group` as a user-facing mutation surface, but the shipped roadmap skill still describes mutations as only `add / advance / decompose / reclassify / defer` and its command block omits the new cluster/group syntax. That skill is the operator-facing wrapper guidance for `stackctl roadmap`, so an unattended agent using the installed skill will not discover the new governed grouping command from the skill text.

The blast radius is medium: the CLI implementation may work, but the project relies on plugin-local skills for workflow discipline, and stale guidance can steer agents back to lower-level edits or awkward `add`/manual edge handling. The fix is to update the roadmap skill mutation list and command examples to include `cluster` and the `group` alias with `--children`, `--chain`, and dry-run/apply behavior.

## 2026-06-19 — audit-barrage lift (20260619T035500279Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-71 — `--chain` flag silently accepted and ignored for all subactions, not just `cluster`/`group`

Finding-ID: AUDIT-20260619-71
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts:116` (the `scanFlags` function, `scanVerbFlags` call)

`scanFlags` adds `'chain'` to the global boolean-flag list that `scanVerbFlags` accepts for every subaction:

```typescript
const s = scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ALL_VALUE_FLAGS);
```

Only `cluster` and `group` have `chain: true` in their `SUBACTION_SPECS` grammar, but the parser accepts `--chain` for any subaction — `advance`, `defer`, `decompose`, etc. — without error. The `chain: true` grammar field is used only by the help renderer (via `flagNamesFor`), not by the per-subaction parser acceptance gate. So `roadmap advance impl:feature/b --chain --to shipped` parses, runs, and silently discards the flag.

This is a "no parsed-but-unshown flag" violation in spirit: `--chain` is parsed-but-unshown for ten of the twelve subactions. The `VALID_INVOCATION` fixture in `help-nondrift.test.ts` does not pass `--chain` to non-cluster subactions, so check (3b)'s bogus-flag assertion (`--zzz-not-a-flag`) never verifies `--chain` is rejected. The test gap and the parser gap are the same root issue; the test only exercises a completely-unknown flag, not a globally-accepted-but-grammar-undeclared one.

Blast radius: an operator script that copy-pastes a `cluster` invocation and changes the verb to `defer` keeps `--chain` in the argv; the mutation succeeds silently without the intended chaining behavior. No diagnostic surfaces. For an agent building unattended from the help surface, the help correctly omits `--chain` for non-cluster subactions, so the agent wouldn't reach this trap — but a human operator or a script that introspects the binary would.

Fix: either (a) move `chain` out of the global boolean list and add per-subaction rejection in `executeRoadmapSubaction` (check `SUBACTION_SPECS[subaction].chain` before allowing the flag), or (b) add a check (3c) variant to the nondrift suite that asserts globally-accepted flags not declared in a subaction's grammar are rejected by that subaction.

---

### AUDIT-20260619-72 — `emitCluster` bypasses `reportMutation` — error/warning output from `cluster()` is silently dropped

Finding-ID: AUDIT-20260619-72 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts:223-231` (`emitCluster` function)

Every other mutation emitter routes through the shared helper:
```typescript
reportMutation(defer(flags.doc, id, change, opts, flags.apply), 'defer', id);
```

`emitCluster` instead rolls its own output, checking only `result.applied`:
```typescript
const result = cluster(flags.doc, input, opts, flags.apply);
process.stdout.write(
  result.applied
    ? `roadmap ${verb}: grouped ${input.children.join(', ')} under ...`
    : `roadmap ${verb}: dry-run — would group ...`
);
```

If `MutationResult` carries an error field, a per-child validation message, or a partial-failure signal (plausible for a multi-child mutation), none of those reach the operator. The dry-run branch is taken whenever `result.applied === false`, whether that means "dry-run mode as intended" or "applied but failed." The two states are conflated.

Blast radius: an operator running `roadmap cluster multi:grp --children impl:feature/x,impl:feature/missing --apply` with one missing child id would see the dry-run success message ("would group…") rather than an error, because the check is on `result.applied` alone. Depending on how `cluster.js` signals partial failure, the roadmap could be left in a partially-mutated state with no diagnostic.

Fix: either call `reportMutation` (extending its label/message for the multi-child format), or explicitly check `result.error` (or equivalent) in `emitCluster` and emit errors to stderr before emitting the success line. At minimum, the dry-run branch should guard `!flags.apply` rather than `!result.applied`.

---

### AUDIT-20260619-73 — `--children` accepts a single-element list — degenerate single-child cluster passes silently

Finding-ID: AUDIT-20260619-73
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/roadmap.ts:215-228` (`clusterInputFrom` function)

The validation after splitting `--children` on commas checks for empty ids but not for list length:

```typescript
if (children.some((s) => s.length === 0)) {
  failUsage('roadmap', `${verb}: --children has an empty id ...`);
}
return { parentId, children, chain: flags.chain, summary: flags.values.get('summary') };
```

`roadmap cluster multi:grp --children impl:feature/b --apply` would succeed, creating a grouping node with a single child. A single-child cluster is logically degenerate — the parent adds no structural information and the `part-of` edge duplicates what a direct `add --part-of` would express.

Blast radius: a script that builds `--children` dynamically (e.g. from a filtered list that reduces to one item) would silently produce a degenerate roadmap entry with no diagnostic. Combined with `--chain`, a single-child cluster would also create a single `depends-on` edge that an operator might not expect.

Fix: add `if (children.length < 2) failUsage('roadmap', ...)` immediately after the empty-id guard, or document in the help text and spec that single-child clusters are intentionally permitted.

---

### AUDIT-20260619-74 — `AddInput.partOf` changed from `string` to `string[]` but `mutations.ts` is absent from the diff

Finding-ID: AUDIT-20260619-74
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/subcommands/roadmap.ts:155-167` (`addInputFrom`); cross-reference: `src/roadmap/mutations.ts` (not in diff)

The diff changes how `--part-of` is parsed:

```typescript
// Before (implied by the removal):
partOf: v.get('part-of'),   // string | undefined

// After:
const partOf = partOfRaw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
// ...
partOf,   // string[] | undefined
```

`AddInput` is imported from `mutations.ts` which is not in the diff. If `AddInput.partOf` is still typed `string | undefined`, TypeScript strict mode would produce a compile error — so the build either already fails, or `mutations.ts` was updated in a commit outside this diff window (possibly one of the Phase 1–3 commits). The diff cannot confirm which.

The runtime risk goes beyond the type: any code in `mutations.ts` or the markdown writer that serializes `partOf` as a single id into the roadmap document now receives an array. If that serialization path was not updated, the ROADMAP.md would receive `["design:feature/a"]` (array `.toString()`) instead of `design:feature/a` for the single-parent case — silently corrupting the edge.

Blast radius: if the downstream serializer was not updated, every `add --part-of` invocation (the common case) would write a malformed parent edge that the roadmap parser would subsequently fail to load or would silently misinterpret. This is a latent data-corruption risk for existing adopters upgrading.

Fix: confirm `mutations.ts` declares `partOf?: string[]` and the ROADMAP.md serializer writes comma-separated ids (or one per line, per the document format spec); add a test that asserts a single `--part-of` id round-trips through `add` to the expected markdown form.

---

### AUDIT-20260619-75 — Nondrift test check (3) leaves a systematic gap: globally-accepted undeclared flags are not asserted rejected

Finding-ID: AUDIT-20260619-75
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/roadmap/help-nondrift.test.ts:161-184` (check (3b) loop)

The test comment claims full coverage of "no parsed-but-unshown flag":

> "no shown-but-unparsed flag, no parsed-but-unshown flag"

But check (3b) only verifies this for a completely-synthetic bogus flag (`--zzz-not-a-flag`):

```typescript
const r = runCli(['roadmap', sub, ...invocation.argv, '--zzz-not-a-flag', 'bogus', '--doc', docPath]);
expect(r.status).toBe(2);
expect(r.stderr).toContain('unknown flag --zzz-not-a-flag');
```

The globally-accepted boolean flags (`apply`, `clear`, `chain`) are not in the grammar for every subaction (`chain` is absent from ten of twelve; `apply`/`clear` are absent from read-only subactions like `next`, `blocked`). These are real flags the parser would accept without error even when the subaction's grammar doesn't declare them and the help text doesn't show them. The test never exercises this surface.

As a result, Finding 01 (`--chain` silently accepted for non-cluster subactions) would pass this test suite with zero failures. The nondrift gate certifies as "clean" a surface that has a parseable-but-undeclared flag gap.

Blast radius: the test is load-bearing for the CHK015 invariant and is cited as the mechanism that prevents help/parser drift. If the test's coverage claim is incorrect, the invariant is weaker than documented. Any tooling or governance step that treats a green nondrift suite as proof of full non-drift would be misled.

Fix: add a check (3c) loop that, for each globally-declared boolean flag not in the subaction's grammar, asserts that passing it produces `exit 2 unknown flag`. For the current three global flags (`apply`, `clear`, `chain`), this would be six additional assertions per subaction and would have caught Finding 01 in the test suite itself.

## 2026-06-19 — audit-barrage lift (20260619T040305585Z-027-roadmap-edge-mutation-and-cluster-phase-3)

### AUDIT-20260619-76 — `--chain` silently accepted by all subactions but declared only in `cluster`/`group` — CHK015 parser-grammar gap

Finding-ID: AUDIT-20260619-76 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=high, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts` lines ~115–120 (scanFlags), ~72–88 (SUBACTION_SPECS)

`scanFlags` adds `'chain'` to the **global** boolean list it passes to `scanVerbFlags`:

```ts
const s = scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ALL_VALUE_FLAGS);
```

This means the underlying scanner accepts `--chain` for **every** roadmap subaction regardless of grammar declaration. Only `cluster` and `group` carry `chain: true` in their `SUBACTION_SPECS` entry, so only they surface `--chain` in per-subaction help. Every other subaction — `advance`, `add`, `defer`, `decompose`, etc. — will silently swallow `--chain` and ignore it.

This is a "parsed-but-unshown flag" for all non-cluster subactions, which the CHK015 non-drift invariant explicitly forbids. The CHK015 test in `help-nondrift.test.ts` does not catch it because:

1. Checks (1) and (2) verify bijection between `flagNamesFor(grammar)` and `shownFlags(help_text)`. For `advance`, `flagNamesFor` does not return `--chain` (the grammar doesn't declare it), and the help doesn't show it, so the check passes — but the **parser** still accepts it.
2. The bogus-flag test (check 3b) probes `--zzz-not-a-flag`, not `--chain`. A subaction-unaware global flag evades this probe entirely.

Blast-radius: an AI agent that copy-pastes a `cluster` invocation and adapts it to `advance` may carry `--chain` across. The flag is silently accepted, the dependency chain is **never created**, and no error surfaces. For an unattended build this is an invisible correctness failure.

Fix: either (a) gate `--chain` in the scanner on whether the active subaction's grammar declares `chain: true`, or (b) add a test per non-cluster subaction confirming that `--chain` exits 2 with "unknown flag" (requiring the scanner to enforce subaction-local flag sets).

---

### AUDIT-20260619-77 — `--part-of` parsing changed to array but multi-parent semantics are unvalidated

Finding-ID: AUDIT-20260619-77
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/roadmap.ts` lines ~152–166 (`addInputFrom`)

The `--part-of` handling changed from `v.get('part-of')` (single `string | undefined`) to:

```ts
const partOf = partOfRaw === undefined ? undefined : partOfRaw.split(',').map((s) => s.trim());
```

The guard rejects empty IDs (stray/trailing commas), but it does **not** reject `--part-of a,b` when both `a` and `b` are valid, non-empty IDs. The stated intent is "stray comma detection" (the comment explicitly frames the error case as "a stray or trailing comma"), yet the code silently accepts multiple parents.

If `AddInput.partOf` is `string[] | undefined` and the mutations layer was updated to iterate the array, then `add --part-of a,b` creates two `part-of` edges — multi-parent assignment — with no warning or explicit opt-in. If the data model intends single-parent only, the validation is incomplete: the guard should additionally assert `partOf.length <= 1` and emit a focused error (`add: --part-of takes exactly one parent id; got N`).

If multi-parent is intentional, the comment, error message, and help text all need to say so. As written, the comment frames `a,b` as a mistake (stray comma) and only catches the empty-string case, leaving the two-parent case semantically ambiguous.

Blast-radius: an agent reading the comment ("stray comma guard") builds the mental model that `--part-of a,b` is invalid; but the code accepts it and may silently assign multiple parents. Conversely, a human operator trying to express "this item belongs to both groups" gets no feedback that this use is experimental or unsupported.

---

### AUDIT-20260619-78 — Empty-ID validation paths for `--children` and `--part-of` have no regression tests

Finding-ID: AUDIT-20260619-78
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `tests/roadmap/help-nondrift.test.ts` (absent), `src/subcommands/roadmap.ts` lines ~222 and ~160

Two `failUsage` guards were added explicitly in response to audit findings (both cite AUDIT-BARRAGE-codex-01):

```ts
// clusterInputFrom (~line 222)
if (children.some((s) => s.length === 0)) {
  failUsage('roadmap', `${verb}: --children has an empty id (a stray or trailing comma)`);
}

// addInputFrom (~line 160)
if (partOf !== undefined && (partOf.length === 0 || partOf.some((s) => s.length === 0))) {
  failUsage('roadmap', 'add: --part-of has an empty id (a stray or trailing comma)');
}
```

Neither failure path has a corresponding negative test in this diff. The VALID_INVOCATION fixtures in `help-nondrift.test.ts` exercise only the happy path (well-formed IDs). The cases not covered:

- `cluster parent --children ,child` → leading stray comma → `['', 'child']`
- `cluster parent --children child,` → trailing stray comma → `['child', '']`
- `cluster parent --children ,,` → only stray commas → `['', '', '']`
- `add id --part-of ,` → stray comma for part-of → `['', '']`
- `add id --part-of child,` → trailing comma on single ID → `['child', '']`

The guard logic is non-trivial (split then trim then `some(s.length === 0)`) and was written specifically to address found bugs. Without at least one negative test per guard, any future refactoring of the split/trim/validate pipeline can silently regress these invariants while CHK015 continues to pass.

---

### AUDIT-20260619-79 — `cluster`/`group` VALID_INVOCATION fixtures reference a parent ID absent from the chain fixture — implicit contract is undocumented

Finding-ID: AUDIT-20260619-79
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/roadmap/help-nondrift.test.ts` lines ~170–189 (cluster/group VALID_INVOCATION entries)

The cluster and group check-(3) fixtures use `multi:feature/grp` and `multi:feature/grp2` respectively as the parent positional. The chain fixture (used via `tmpChain()`) contains only `design:feature/a`, `impl:feature/b`, and `impl:feature/c`. Neither `multi:feature/grp` nor `multi:feature/grp2` exist in the fixture document.

The `expectExit0: true` annotation implies that a dry-run cluster against a non-existent parent succeeds. This is load-bearing behavior: it documents that `cluster` **creates** the parent node on apply (and therefore on dry-run reports "would create") rather than requiring the parent to already exist. But the test fixture comment says nothing about this, so a future reader cannot tell whether `expectExit0: true` is correct-by-design or accidentally passing because the validation is deferred.

Adding a one-sentence comment to the cluster/group fixture entries explaining the "creates-or-reuses parent" contract would make the test self-documenting and prevent a well-intentioned future edit from changing `expectExit0` to `false` under the false assumption that the parent must pre-exist.

---

### AUDIT-20260619-80 — `help-surface.test.ts` matches specific prose substrings that are brittle against wording changes

Finding-ID: AUDIT-20260619-80
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `tests/roadmap/help-surface.test.ts` lines ~31–32

```ts
expect(r.stdout).toMatch(/list the ready/);
expect(r.stdout).toMatch(/dry-run unless --apply/);
```

These probe for specific inner phrases in the `roadmap --help` output. They serve as sanity checks that the help text is substantive (not empty). But they are more brittle than necessary: capitalizing "List", rewording to "Lists ready items", or rephrasing the dry-run note would fail these tests while the feature contract (help is present and non-empty, all subactions are listed) is entirely intact.

A more stable alternative: assert `r.stdout.length > 200` (or similar floor) and rely on the per-subaction name loop (`for (const sub of SUBACTIONS) { expect(r.stdout).toContain(sub); }`) that already follows. The wording assertions contribute friction without load-bearing signal, because the CHK013/014 coverage is already carried by the per-subaction name loop and the status-vocabulary tests below.

### AUDIT-20260619-81 — Flat roadmap dispatcher still has the truncated no-subaction usage

Finding-ID: AUDIT-20260619-81
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/roadmap.ts:449-452

The new help tests assert that `roadmap` with no subaction enumerates the complete subaction set, but the exported flat dispatcher still emits the old hardcoded `roadmap <next|blocked|add> [flags]` message. The live commander path may avoid this, but the file comments describe `runRoadmapCli` as a retained behavior reference, so this is documentation/help drift in an exported surface.

The blast radius is low because normal CLI users likely hit the commander mount, not this retained function. Still, any direct test harness or caller using `runRoadmapCli([])` gets stale guidance that omits `cluster`, `group`, and the other roadmap verbs. The fix is to route this branch through `renderRoadmapUsage()` or `KNOWN_SUBACTIONS` rather than the old literal.

## 2026-06-19 — audit-barrage lift (20260619T040844872Z-027-roadmap-edge-mutation-and-cluster-phase-4)

### AUDIT-20260619-82 — `WorkItem.partOf` type change (`string | null` → `readonly string[]`) — consumers not visible in diff

Finding-ID: AUDIT-20260619-82
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/roadmap-model.ts:19-27, :146

`roadmap-model.ts` changes the exported `WorkItem.partOf` field from `string | null` to `readonly string[]`. This is a breaking change on an exported interface. The diff contains no updates to any code that reads `workItem.partOf` downstream — display commands (`roadmap graph`, `roadmap next`, `roadmap blocked`, `roadmap blocks`), formatters, or JSON/text renderers would all have needed parallel updates. TypeScript strict mode would catch direct type misassignments at compile time, but two failure modes survive compilation: (1) any code that was doing a truthy check `if (item.partOf)` now receives a truthy `[]` where it previously received a falsy `null` — the branch fires even when the item has no grouping; (2) any output path that embeds `partOf` in a template or serializes it would silently change from `null` / `"A"` to `[]` / `["A","B"]`. If `roadmap graph` renders group membership it almost certainly reads this field. The blast-radius is bounded by TypeScript enforcement but not eliminated by it; a consumer passing `item.partOf` into a function that expects `string | null` would compile only if that function also uses a loose type — but display paths built with template strings compile fine with either type. Confirm all consumers are covered, specifically the graph/next/blocked output paths.

---

### AUDIT-20260619-83 — Missing test for `roadmap add --part-of a,b` multi-parent add

Finding-ID: AUDIT-20260619-83
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap.ts:154-168 (addInputFrom); tests/roadmap/ (no matching test)

The `addInputFrom` function now parses `--part-of` as a comma-separated list and produces `readonly string[]`, enabling a unit to be added to multiple parents in one command. The two new test files in the diff cover `cluster` and `cluster` refusals exclusively; no test in the diff exercises `roadmap add --part-of p1,p2` (multi-parent add). The golden path (two parents both land on the unit), the dedup no-op (one parent already on the unit), and the stray-comma guard for `--part-of` itself are all untested by the visible diff. The stray-comma guard (`partOf.some(s => s.length === 0)`) is tested only indirectly through the `--children` guard path. Given the guard wording is `'add: --part-of has an empty id'` and the PR comment at lines 157-162 names this as a fix for `AUDIT-BARRAGE-codex-01`, the intended invariant exists but lacks a test that would catch a regression.

---

### AUDIT-20260619-84 — `appendEdge` inserts new `part-of` edge BEFORE `- status:` — cosmetic ordering inversion

Finding-ID: AUDIT-20260619-84
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/roadmap/cluster.ts:84-87

When a unit has no existing `- part-of:` line outside a fence, `appendEdge` inserts the new edge at index 1 of the body array — directly after the `## heading` line, before any other metadata including `- status:`. Compare with `buildSection` (`mutations.ts:95`) which always places `- status:` first. The result for a unit like:

```
## impl:feature/b
- status: planned
- depends-on: design:feature/a
```

after clustering becomes:

```
## impl:feature/b
- part-of: multi:feature/grp
- status: planned
- depends-on: design:feature/a
```

The document parser handles either order, so this is functionally correct — all tests pass. But it produces a diff that inverts the conventional field order and will look odd in code review. A reviewer reading the live `ROADMAP.md` post-cluster would see a metadata ordering inconsistency that differs from both `buildSection`-generated sections and the unit's original shape. A straightforward fix: scan for the last metadata line (any `\s*[-*]\s+\w+:` line outside fences) and insert after it rather than at index 1.

---

### AUDIT-20260619-85 — `partOf.length === 0` branch in `--part-of` guard is unreachable dead code

Finding-ID: AUDIT-20260619-85
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/roadmap.ts:157-162

```typescript
const partOf = partOfRaw === undefined ? undefined : partOfRaw.split(',').map((s) => s.trim());
if (partOf !== undefined && (partOf.length === 0 || partOf.some((s) => s.length === 0))) {
```

`String.prototype.split(',')` always returns an array with at least one element — the empty string `''` produces `['']`, not `[]`. When `partOfRaw` is defined, `partOf.length` is always ≥ 1, so `partOf.length === 0` is never true. The only live branch is `partOf.some(s => s.length === 0)`, which correctly catches explicit empty strings and stray commas. The dead branch suggests the guard was written with an incorrect mental model of `split`'s contract (perhaps assuming it could return `[]` for an empty input). This is purely cosmetic — the observable behavior is correct — but the dead branch is a maintenance hazard: a future reader might reason backward from the guard and conclude there is some code path where `split` returns `[]`, leading to incorrect assumptions. Remove the dead clause.

---

### AUDIT-20260619-86 — `chain: true` in `SUBACTION_SPECS` — likely dead code or type violation

Finding-ID: AUDIT-20260619-86
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/roadmap.ts:73-84

Both `cluster` and `group` entries in `SUBACTION_SPECS` include `chain: true`. Every other entry in `SUBACTION_SPECS` (decompose, reclassify, defer, etc.) has only `valueFlags`, `apply`, `clear`, and `positionals`. If `SubactionGrammar` does not declare a `chain` field, TypeScript strict mode would produce a compile error here — meaning either `SubactionGrammar` was updated in a prior commit (not visible in this diff) or the field is permitted via an index signature. Either way, `chain` in `SUBACTION_SPECS` is not consumed by any visible code path: the `--chain` boolean is registered directly in `scanVerbFlags('roadmap', args, NO_DOC, ['apply', 'clear', 'chain'], ...)` at line 103, not derived from `SUBACTION_SPECS`. The entry in `SUBACTION_SPECS` is decorative at best. This either needs to be removed (if dead code) or `SubactionGrammar` needs a visible `chain?: boolean` field and the consuming scan logic updated to read it from the spec instead of hardcoding it in `scanFlags`.

---

### AUDIT-20260619-87 — `--chain` with a single child silently no-ops

Finding-ID: AUDIT-20260619-87
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/roadmap/cluster.ts:133-138 (chainPredecessor at index 0); src/roadmap/roadmap.ts:218-220

When `--chain` is passed with exactly one child, `chainPredecessor(doc, children, 0)` returns `null` (by design — no predecessor for the first element). The `predecessor` map stays empty, no `depends-on` edges are written, and the `--chain` flag has zero observable effect. The operator receives no warning that the flag was accepted but did nothing. A common UX mistake here: an operator who misremembers that `--chain` means "chain this child to an existing predecessor" (rather than "chain the children to each other") would pass `--children single-item --chain` and see a successful exit with silent no-op on the dependency wiring. A short note in the success output (or a `process.stderr.write` warning) when `chain: true && children.length === 1` would surface this. Not a correctness defect, but a discoverability gap.

### AUDIT-20260619-88 — Decompose dedups only within each `part-of` line, not across the unit

Finding-ID: AUDIT-20260619-88
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/mutations.ts:52-66, src/roadmap/mutations.ts:235-257

`decompose` now claims to de-duplicate repointed edges when an item already references one of the new parts, but the implementation runs `repoint` through `rewriteEdgeLine`, which transforms each matching line independently. That means repeated `part-of` lines can still produce duplicate merged targets. Example: a unit with `- part-of: multi:feature/old` and another line `- part-of: impl:feature/a`; decomposing `multi:feature/old` into `impl:feature/a, impl:feature/b` rewrites the first line to `a, b` and leaves the second line as `a`, so the parsed aggregate becomes `a, b, a`.

This matters because the feature explicitly widened `part-of` to multi-parent and the nearby `cluster` tests assert aggregate dedup for repeated `part-of` lines, but the related `decompose` path still violates that contract. Blast radius is medium: it does not usually break validation, but it creates duplicate graph metadata that downstream views or later mutations consume as real targets. A reasonable fix is to replace the line-local rewrite for edge fields with an aggregate real-edge-line rewrite, or add a dedicated `rewriteEdgeTargets` helper that collects all real lines for a field, applies the transform once, and writes a deduped target list back once.

### AUDIT-20260619-89 — Decompose still rewrites fenced `part-of` examples as metadata

Finding-ID: AUDIT-20260619-89
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/mutations.ts:52-66, src/roadmap/mutations.ts:253-257

`cluster` added fence-aware handling because field-looking bullets inside code fences are prose, not metadata. `decompose` still uses `rewriteEdgeLine`, whose regex maps every line matching `- part-of:` regardless of whether it is inside a fenced block. If a unit has a real `part-of` edge to the decomposed item plus a fenced example mentioning the same id, the guard at lines 253-257 enters the rewrite path, and lines 57-66 mutate both the real metadata and the fenced example.

That is content corruption in a repository whose core object is markdown content. The blast radius is medium because it only hits roadmap items containing fenced examples, but when it does, a valid mutation silently rewrites prose the document parser would have ignored. The fix should make shared edge rewrites use the same fence-awareness as `appendEdge` and `scopeOf`, then cover decompose/reclassify with a fenced-field regression test.

## 2026-06-19 — audit-barrage lift (20260619T041505100Z-027-roadmap-edge-mutation-and-cluster-phase-5)

### AUDIT-20260619-90 — Stale "RED until T017" comment misleads future readers

Finding-ID: AUDIT-20260619-90
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/honest-header.test.ts:9-12

Lines 9–12 say *"RED until T017 rewrites the skeleton from the bare 'manage with stackctl roadmap — do not hand-edit' to the honest-interim form."* But commit `58db0117` (in the audited range) is titled `feat(027): Phase 5 US3 — honest-interim ROADMAP header (T016-T017)` — both tasks were landed together. This file *is* T016; T017 is the scaffold rewrite in the same commit. If the tests are passing (as expected after that commit), the skeleton no longer has the old text, so the comment is describing a state that no longer exists.

The blast-radius: an agent picking up this worktree and reading the comment would believe T017 is still pending and either skip it or re-implement it. At minimum it creates confusion about which tasks in `tasks.md` are complete. Per the project rule against "just for now" / stale IOU comments, this is a bug-factory: the comment should have been updated (or removed) when T017 landed.

Reasonable fix: replace lines 9-12 with a backwards-looking statement — e.g. *"T017 landed in the same commit; the skeleton is now the honest-interim form."* Or remove the RED-phase note entirely; the commit history is the authoritative record of when it turned green.

---

### AUDIT-20260619-91 — `toContain(verb)` assertions are too broad — match any occurrence, not CLI-command form

Finding-ID: AUDIT-20260619-91
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/honest-header.test.ts:25-28

```ts
for (const verb of ['add', 'advance', 'reclassify', 'defer', 'cluster']) {
  expect(ROADMAP_SKELETON).toContain(verb);
}
```

`toContain('add')` passes if the word "add" appears anywhere in the skeleton — including prose like "In *addition* to the above" or "you can *add* custom nodes". The intent (per the T016 comment and FR-016) is to verify that the skeleton *names the mutation verbs as CLI commands available to the agent*. A skeleton that mentions "add" only in explanatory prose, without ever presenting `stackctl roadmap add` as an invokable command, would make all five assertions green while the actual operator-discipline contract (agent knows what commands exist) remains unmet.

Compare this to the next test (line 33), which anchors to the actual CLI syntax pattern `/roadmap cluster .*--children/`. Four of the five verbs get the weaker version. The blast-radius: an agent (or operator) reading green test output concludes the skeleton adequately names the mutation surface, when in fact the skeleton could have regressed to prose-only descriptions.

Reasonable fix: replace `toContain(verb)` with `toMatch(new RegExp(`roadmap ${verb}`, 'i'))` (or the `stackctl` prefix if that's the documented form) for each verb — consistent with how the `cluster` verb's worked-example test is anchored.

---

### AUDIT-20260619-92 — `/edit|hand-edit/i` regex is logically equivalent to `/edit/i` — asserts too little

Finding-ID: AUDIT-20260619-92
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/honest-header.test.ts:37

```ts
expect(ROADMAP_SKELETON).toMatch(/edit|hand-edit/i);
```

The alternation `edit|hand-edit` means "edit OR hand-edit". Since "hand-edit" is a superset of "edit" (it contains the substring), the `edit` branch will always win first if `hand-edit` is present, and the regex is logically identical to `/edit/i`. Any occurrence of the substring "edit" — including in words like "reclassify" being described as an "edit operation", or in surrounding docs referencing the editor — will make this assertion green.

The intent is to verify the escape-hatch sentence: *"when no verb exists, hand-edit then revalidate"*. A pattern like `/hand.?edit/i` (requiring "hand" adjacent to "edit") would make the assertion mean what the comment claims. As written the assertion is nearly vacuous and would pass even if the hand-edit fallback were removed from the skeleton entirely, as long as "edit" appears anywhere else.

---

### AUDIT-20260619-93 — Implementation counterpart (`scaffold.ts`) absent from the provided diff

Finding-ID: AUDIT-20260619-93
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/setup/scaffold.ts (not present in diff)

Commit `58db0117` is titled `feat(027): Phase 5 US3 — honest-interim ROADMAP header (T016-T017)`. T016 is this test file; T017 is the rewrite of `ROADMAP_SKELETON` in `src/setup/scaffold.ts`. The diff provided for audit contains only the test file — `scaffold.ts` does not appear.

This means the audit cannot verify:
- that `ROADMAP_SKELETON` actually satisfies the contracts the four tests assert (e.g. does it contain `roadmap cluster --children` in a copy-pasteable form?);
- that the "do not hand-edit" text is truly absent from the new skeleton;
- that no other caller of `ROADMAP_SKELETON` (e.g. the `setup` command or the auto-scaffold read path mentioned in the test comment) was left with a stale reference.

If the full diff was trimmed before being passed to this session, this informational note may be moot. If `scaffold.ts` genuinely wasn't changed in the audited range (implying T017 landed before commit `0737431f`), the test's own comment at lines 9-12 would then be describing a past-tense base commit rather than work in this range — which is consistent with finding -01 but warrants a cross-check against the actual `scaffold.ts` HEAD to confirm the skeleton matches what the tests assert.

## 2026-06-19 — audit-barrage lift (20260619T041804131Z-027-roadmap-edge-mutation-and-cluster-phase-5)

### AUDIT-20260619-94 — Regex dot won't match newline — cluster example test can silently skip multiline invocations

Finding-ID: AUDIT-20260619-94
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    tests/roadmap/honest-header.test.ts:32

The assertion `expect(ROADMAP_SKELETON).toMatch(/roadmap cluster .*--children/)` uses JavaScript's default regex mode where `.` does not match `\n`. If the worked example in the skeleton spans two lines — the common readable form for CLI examples with flags:

```
stackctl roadmap cluster <slug>
  --children child1,child2
```

— the regex fails to find a match, and `toMatch` fails rather than passes. That means the test is **not a false pass** — it would correctly fail. But the opposite fragility exists too: if someone updates the skeleton to the more readable multiline form, this test starts failing and the maintainer's first instinct may be to "fix the test" by loosening it, not to re-examine the intent. More concretely: the test claims "a concrete, copy-pasteable cluster invocation" but silently cannot verify that invocation if it spans lines.

The fix is straightforward: add the `s` (dotAll) flag — `/roadmap cluster .*--children/s` — or use `/roadmap cluster[\s\S]*?--children/`. Either form handles both single-line and multiline invocations without changing the test's intent.

Blast-radius: an agent reading ROADMAP_SKELETON at runtime is not harmed by this test gap — the skeleton ships whatever it ships. The harm is test-suite brittleness: a valid skeleton update would break this test for the wrong reason, and the test gives no signal about whether multiline invocations are actually present.

---

### AUDIT-20260619-95 — Fallback contract split into two disjoint assertions — proximity is untested

Finding-ID: AUDIT-20260619-95
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    tests/roadmap/honest-header.test.ts:37–39

The test "states the hand-edit-then-`roadmap order` fallback for a verb-less edit" asserts two things independently:

```ts
expect(ROADMAP_SKELETON).toMatch(/edit this file/i);
expect(ROADMAP_SKELETON).toMatch(/roadmap order/);
```

Both assertions can pass even if "edit this file" appears in one section of the skeleton (say, a general editor note) and "roadmap order" appears in a completely different section (say, an ordering-only context unrelated to the fallback). The test claims to verify the *paired* fallback instruction — the "edit THIS file then revalidate with `roadmap order`" pattern — but nothing in the test enforces that the two halves are co-located or linked.

A minimal tightening would be a single `toMatch` with both halves in one regex with proximity enforced, e.g. `/edit this file[\s\S]{0,200}roadmap order/i`, or a `toMatch` on the combined prose phrase if the skeleton's wording is stable enough. The current split assertions verify presence of two tokens, not the coherent instruction the comment describes.

Blast-radius: an agent reading the skeleton could encounter the two fragments in unrelated sections and not construct the correct fallback mental model. This is a test-fidelity gap, not a runtime defect, but test fidelity is the load-bearing claim here (the commit message explicitly calls these RED-first, meaning the tests are the spec).

---

### AUDIT-20260619-96 — Negative assertion catches only one exact trap phrase

Finding-ID: AUDIT-20260619-96 (claude-03 + codex-01; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    tests/roadmap/honest-header.test.ts:18

```ts
expect(ROADMAP_SKELETON).not.toMatch(/do not hand-edit/i);
```

This negative guard catches the specific documented prior bad form. Equivalent trap phrases — "do not edit", "do not manually edit", "never hand-edit", "this file is auto-generated, do not modify" — would all pass this test silently while still trapping an agent between "cannot edit" and "no verb exists."

The comment calls out the exact phrase that was retired, so this is intentional targeting. But if the skeleton is regenerated from a template that uses a different "do not touch" idiom (common in auto-generated file headers), the guard misses it. Given the skeleton is authored in `scaffold.ts` under this project's control, the risk is bounded — but a future edit to the scaffold header by a less-context-aware contributor would bypass this guard silently.

Blast-radius: low. The skeleton is a small, controlled constant. The test is documenting history as much as enforcing a contract. But noting it here for completeness since the test header explicitly frames this as the defect being retired.

---

### AUDIT-20260619-97 — No findings — the core export and import surface

Finding-ID: AUDIT-20260619-97
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    tests/roadmap/honest-header.test.ts (import line 13)

The import `from '../../src/setup/scaffold.js'` uses the `.js` extension, which is the correct ESM TypeScript convention for this project (TypeScript resolves `.ts` source at the `.js` emit path). The named export `ROADMAP_SKELETON` is imported directly, so if the export is missing or renamed in `scaffold.ts`, the test fails loudly at import time rather than silently. The verb list `['add', 'advance', 'reclassify', 'defer', 'cluster', 'group']` covers the mutation surface the feature introduced; `order` is deliberately tested separately via the fallback assertion (line 39), not in the verb-list loop — a correct split. No fabricated behavior, no mock data, no swallowed exceptions, no hardcoded paths outside of the import path (which is structurally fixed by the test file's location).
