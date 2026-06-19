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
