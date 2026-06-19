---
slug: 028-front-door-completeness
targetVersion: ""
---

# Audit log — 028-front-door-completeness

## 2026-06-19 — audit-barrage lift (20260619T165114688Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-01 — `smoke-front-door.sh` is a gating script that always exits 0 — a fallback by another name

Finding-ID: AUDIT-20260619-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    scripts/smoke-front-door.sh:19-22

The script is documented as "the local pre-PR smoke for the front-door completeness invariant" but unconditionally exits 0 with a single echo line. A developer running this before opening a PR gets a false green — the gate they believe they are exercising has no teeth whatsoever.

The project's agent-discipline.md §"Just for now is bullshit" is precise on this shape: *"'Disabled the test for now' — The test will never get re-enabled,"* *"'Stub for now, real impl in next pass' — The stub IS the impl now."* The inline comment `"T003 lands the SKELETON only — it exits 0 until US4 (T118) wires the two checks above"` is exactly the IOU comment pattern the rule names as a bug-factory nucleation site. Naming T118 in a code comment is not the same as T118 being in scope and tracked; the comment will outlive the intention.

CLAUDE.md is also direct: *"Never implement fallbacks or use mock data outside of test code. Throw errors with a description of the missing functionality."* A smoke script that exits 0 without testing anything is a fallback. The compliant shape is to exit non-zero with a descriptive message when the implementation is absent, not to silently pass. Replace the body with: `echo "smoke-front-door: not yet implemented (US4/T118 required)"; exit 1` — that makes the skeleton behavior visible rather than invisible to anyone who runs it.

---

### AUDIT-20260619-02 — `CommandDescriptor` conflates single-action and multi-action verbs without a discriminated union — `mediationClass` and `flags` are semantically undefined for multi-action verbs

Finding-ID: AUDIT-20260619-02
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:43-54

`CommandDescriptor` carries `mediationClass: MediationClass` with the comment *"For a single-action verb; a multi-action verb's class is per-sub-action."* and `flags: readonly FlagDescriptor[]` with *"Verb-level flags (single-action verbs)."* Both fields are typed as unconditionally present. For a multi-action verb (`subActions.length > 0`), reading `descriptor.mediationClass` or `descriptor.flags` is semantically undefined — the type gives no sentinel value, no guard pattern, and no documentation of what to populate.

Blast-radius: Phase 2 (T004–T011) will build the commander-tree walker and the completeness/mediation guards that consume these types. Code written against the current types has two equally-plausible readings: (a) for a multi-action verb, `mediationClass` is `'read-only'` by convention (a zero-value), or (b) the field should not be consulted at all. An agent building Phase 2 from this skeleton will choose one reading without evidence — and if it chooses (a), it will silently mis-classify mutating multi-action verbs as read-only, undermining the mediation gate.

A discriminated union removes the ambiguity with no runtime cost:
```typescript
export type CommandDescriptor =
  | { readonly kind: 'single'; readonly verb: string; readonly description: string;
      readonly flags: readonly FlagDescriptor[]; readonly mediationClass: MediationClass;
      readonly deprecatedAliasOf: string | null }
  | { readonly kind: 'multi'; readonly verb: string; readonly description: string;
      readonly subActions: readonly SubActionDescriptor[];
      readonly deprecatedAliasOf: string | null };
```
The same ambiguity applies to the `flags` field on a multi-action verb; the discriminated union resolves both at once.

---

### AUDIT-20260619-03 — `liveVerbs()` silently returns `[]` when the `Verbs:` line is present but empty — downstream test loops pass vacuously

Finding-ID: AUDIT-20260619-03
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:28-37

The function throws correctly when the `Verbs:` line is entirely absent (`line === undefined`). But when the line IS present with no verbs — e.g., `"Verbs:\n"` — the parse chain produces `[]` without error:

```
"Verbs:".slice(6)        → ""
"".split(',')            → [""]
[""].map(v => v.trim())  → [""]
[""].filter(v => v.length > 0) → []   ← silently empty
```

Any test that iterates over `liveVerbs()` and asserts properties for each verb would trivially pass with zero iterations. This is the vacuous-pass failure mode: the harness signals clean precisely when the CLI's help surface has collapsed to zero verbs, which is the regression it exists to catch.

Fix: add a post-parse guard alongside the existing absence guard:
```typescript
const verbs = ...parse chain...;
if (verbs.length === 0) {
  throw new Error(
    `command-surface-harness: 'Verbs:' line found but contained no verbs. ` +
    `stdout:\n${out}`
  );
}
return verbs;
```

---

### AUDIT-20260619-04 — Committed skeleton/deferred-work comments reference task IDs but not GitHub issue links — per `agent-discipline.md` these are untracked IOUs

Finding-ID: AUDIT-20260619-04 (claude-04 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    scripts/smoke-front-door.sh:17; src/cli-help/command-surface.ts:10-11

`agent-discipline.md` §"Just for now is bullshit" specifies: *"grep your changes for `for now`, `just for now`, `TODO`, `FIXME`, `HACK`, `XXX`, `temporary`, `stub`, `placeholder`, `pending`, `until F`, `until v` — any hit is a flag to either fix the underlying thing or file the issue. None of these strings should land in a commit unless paired with a GitHub issue number."*

The diff contains:
- `smoke-front-door.sh:17`: *"T003 lands the SKELETON only — it exits 0 until US4 (T118) wires the two checks above"*
- `command-surface.ts:10`: *"T001 lands the type skeleton ONLY (no commander-tree walker yet). The walker… are introduced in Phase 2 (T004–T011)"*

Both reference internal task IDs (`T001`, `T003`, `T118`), not GitHub issue numbers. The rule's explicit framing is that a code comment is not a disposition — it creates the illusion of tracking without the substance. If T118 is tracking the `smoke-front-door.sh` wiring, a link to that issue belongs in the comment (and ideally also in the smoke script itself so a reader has a clickable path to the open work). Task IDs inside a plugin's internal system are not portable the way GitHub issue links are.

---

### AUDIT-20260619-05 — `isHelpConformant()` ignores stderr — false negatives if `--help` output migrates to stderr

Finding-ID: AUDIT-20260619-05
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:68-70

```typescript
export function isHelpConformant(probe: HelpProbe): boolean {
  return probe.status === 0 && probe.stdout.trim().length > 0;
}
```

Some CLI frameworks (notably older versions of commander, yargs, and oclif) write help output to stderr rather than stdout. If `stackctl`'s help routing were to change — or if a specific verb's help falls back to a framework default that writes to stderr — this predicate would return `false` for an exit-0 invocation that emitted a full usage block to stderr. The HelpProbe interface already captures `stderr` (line 52), so the information is available. The current predicate would mark the verb as non-conformant and surface a spurious test failure rather than a real help-surface defect, which is a maintainability cost.

A minimal fix: `probe.status === 0 && (probe.stdout.trim().length > 0 || probe.stderr.trim().length > 0)`. A stricter reading of SC-001 ("exits 0 with a non-empty usage body on **stdout**") would leave the predicate as-is but add a comment explaining the stdout-only policy is intentional so future maintainers don't consider it a bug.

### AUDIT-20260619-06 — Smoke gate reports success while doing no checks

Finding-ID: AUDIT-20260619-06
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    scripts/smoke-front-door.sh:3-22

The new `smoke-front-door.sh` is described as “the local pre-PR smoke for the front-door completeness invariant,” but its executable behavior is only `echo ...; exit 0` on lines 21-22. The comments on lines 4-10 describe the real contract: run `stackctl check-front-door` and `scripts/smoke-interceptor-loaded.sh`. Because neither is invoked, any downstream operator or unattended agent using this script as the advertised smoke gate gets a false green even when the front-door invariant is completely broken.

Blast radius is high because this is a test/smoke surface, not inert documentation: success from this script can be used as release or PR evidence. A reasonable fix is to either make the script run the two named checks now, or make the skeleton fail/skip with a non-zero exit so it cannot be mistaken for passing verification.

## 2026-06-19 — audit-barrage lift (20260619T165832405Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-07 — `CommandDescriptor.mediationClass` is undefined behavior for multi-action verbs

Finding-ID: AUDIT-20260619-07
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/cli-help/command-surface.ts:43-52

The `CommandDescriptor` interface requires a `mediationClass: MediationClass` field on every descriptor, but the field comment says "For a single-action verb; a multi-action verb's class is per-sub-action." This creates a silent semantic hole: the type forces every multi-action verb to carry a verb-level `mediationClass` value that is simultaneously **required by the type** and **meaningless by specification**. No guidance is given on what value to write there.

The blast radius is direct: the file header at lines 9–11 names "the completeness guard" and "the mediation-class guard" as the downstream consumers that will iterate over `CommandDescriptor[]` and read `mediationClass` for mediation registration. A guard that checks `descriptor.mediationClass` without first branching on `descriptor.subActions.length > 0` will silently classify all multi-action verbs with whatever default value was written (likely `'read-only'` as the safer-looking option), causing real mutating sub-actions to be registered as read-only and bypassing mediation. There is no type-level signal that alerts the consumer: `mediationClass` on a `CommandDescriptor` looks identical for single-action and multi-action verbs. The natural reading — iterate over descriptors, read `mediationClass`, register — is the wrong reading for multi-action verbs.

The backlog item `task-300` (visible in git status) acknowledges the flat-shape vs discriminated-union design consideration was parked. That's a scope decision. But parking the discriminated union doesn't mean the current flat shape is safe: at minimum, `mediationClass` should be typed `MediationClass | null` with `null` as the specified value for multi-action verbs, so the compiler forces every consumer to handle the null case rather than silently consuming a stale default. As written, a guard author gets no compiler help.

---

### AUDIT-20260619-08 — Shared verb-level flags on multi-action verbs are not representable

Finding-ID: AUDIT-20260619-08
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:44-46

`CommandDescriptor.flags` is documented "Verb-level flags (single-action verbs)", implying it must be empty for multi-action verbs. But multi-action verbs commonly carry shared top-level flags — for example `--format`, `--output`, or `--dry-run` that apply across all sub-actions. If a multi-action verb has such flags, there is no representable place for them in this model: they belong neither at the verb level (the comment says that's single-action territory) nor exclusively on one sub-action. A builder of the surface would either drop them (losing coverage in help + the completeness guard) or put them on every sub-action descriptor (data duplication that can drift). Neither outcome matches "so drift between what the CLI does and what it documents is structurally impossible" (line 6). This is a medium-severity design gap rather than blocking because the current set of verbs may not exhibit this case yet — but when the first multi-action verb with a shared flag is added, the model breaks silently.

---

### AUDIT-20260619-09 — `command-surface-harness.ts` committed with no test consumers in the same diff

Finding-ID: AUDIT-20260619-09
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface-harness.ts (entire file)

The harness exports three runtime functions — `liveVerbs()`, `probeHelp()`, and `isHelpConformant()` — and exists specifically to support FR-001/002/SC-001 test files. However, the diff contains no `*.test.ts` files in `src/__tests__/cli-help/`, and the git status shows `src/__tests__/cli-help/` as entirely untracked (`??`) with only the harness file present. The harness has no current consumers.

This means: (a) the harness functions are themselves untested — if `liveVerbs()` has a parsing bug on the actual `stackctl --help` output format, no test will catch it before the consumer tests are written; (b) the feature's stated test coverage for FR-001 ("every fronted op is discoverable without reading source") and SC-001 ("every verb exits 0 with a non-empty usage body") is not in place yet, despite the spec referencing T002. The harness is infrastructure committed ahead of the tests it serves — per project rules, that's deferred work living in a committed artifact rather than a tracked issue.

---

### AUDIT-20260619-10 — `smoke-front-door.sh` deferral tracked only in a code comment, not a task system entry

Finding-ID: AUDIT-20260619-10 (claude-04 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    scripts/smoke-front-door.sh:17-20

The script fails closed unconditionally, citing "specs/028-front-door-completeness task T118" as the wiring point. The failing-closed behavior is correct per project rules (throw on missing functionality, don't silently pass). However, the only record of T118's obligation is inside this file's comment. A future reader or agent starting fresh on this branch will see a smoke script that always exits 1; the T118 reference is navigable only if the reader opens this file and follows the reference. If T118 slips (never implemented, renamed, or out-of-scope'd), the smoke script remains broken indefinitely — which at least fails loudly, but gives no path to resolution without re-reading this file. The project rule "just for now is bullshit" specifically names the code-comment-as-tracking failure mode. A GitHub issue number alongside or instead of the task reference would make the obligation trackable independent of this file.

---

### AUDIT-20260619-11 — `_run-helpers.js` import is not shown in the diff — dependency provenance unverified

Finding-ID: AUDIT-20260619-11
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:17

Line 17 imports `{ runCli }` from `'../_run-helpers.js'`, resolving to `src/__tests__/_run-helpers.ts` (or `.js`). This file does not appear in the diff. The git status shows `src/__tests__/cli-help/` as new and untracked, but `src/__tests__/` itself is not listed as new — meaning `_run-helpers` may be a pre-existing helper from an earlier commit, or it may be missing. If it doesn't exist, the harness fails to compile and every downstream consumer fails with it. This is informational because the diff provides insufficient evidence to determine whether the file was already shipped; an operator who can run `ls src/__tests__/_run-helpers.*` can resolve it in seconds. Flagged so the operator has the provenance check on the triage list.

### AUDIT-20260619-12 — Top-level help discovery ignores a non-zero `stackctl --help` exit

Finding-ID: AUDIT-20260619-12
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/__tests__/cli-help/command-surface-harness.ts:24-45`

`liveVerbs()` parses stdout from `runCli(['--help'])` but never asserts `r.status === 0`. If `stackctl --help` exits non-zero while still printing a `Verbs:` line, the harness will return verbs and downstream tests can proceed as though the top-level discovery surface is healthy. That weakens the contract the helper claims to test: “discovered the SAME way an operator would” from `stackctl --help`.

The blast radius is medium because per-verb probes may still catch many real failures, but a broken top-level help command could slip through this shared fixture. The fix is to fail loud when `r.status !== 0`, before parsing the `Verbs:` line.

## 2026-06-19 — audit-barrage lift (20260619T170440171Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-13 — `CommandDescriptor.mediationClass` invariant is documented but not type-enforced

Finding-ID: AUDIT-20260619-13
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:47-62

The invariant "multi-action verb ↔ `mediationClass: null`, single-action verb ↔ `mediationClass: MediationClass`" is stated clearly in the comment at lines 56–62 and was shaped by a previous barrage finding (AUDIT-BARRAGE-claude-01, Phase 1). However, it is still enforced only by documentation and developer discipline — not by the TypeScript type system. A caller constructing a `CommandDescriptor` for a multi-action verb can set `mediationClass: 'mutating'` and the compiler accepts it without error. Conversely, a single-action verb can be built with `mediationClass: null` and also compile cleanly.

The mediation-class guard and completeness guard cited as upcoming (comment, line 11: T004–T011) will consume this field. Both will need to write their own runtime branches for the multi/single distinction rather than relying on exhaustive type narrowing. If either guard authors a `CommandDescriptor` for a new multi-action verb and accidentally includes a non-null `mediationClass`, the guard logic will silently misclassify operations — a correctness defect not visible until runtime. The untracked `task-300` file in the git status (`028-design-consideration-CommandDescriptor-flat-shape-vs-discriminated-union-single-multi-action.md`) shows this is a recognized open design consideration, but the current implementation chose the flat shape without closing the invariant gap.

A discriminated union (`type CommandDescriptor = SingleActionCommand | MultiActionCommand`) would let the compiler enforce it. Alternatively, a narrowing helper (`isSingleAction(d: CommandDescriptor): d is SingleActionCommand`) defined in this module and required by all consumers would catch the gap at the call-site without a shape change. As-is, the invariant is the same class of "prose-only typing" the project rules prohibit (`Never bypass typing`).

---

### AUDIT-20260619-14 — `CommandDescriptor.flags` semantics on multi-action verbs are undefined

Finding-ID: AUDIT-20260619-14
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:53-55

The field comment at line 53 reads `"Verb-level flags (single-action verbs)"`, but the type allows `flags` to be a non-empty array on a multi-action verb without any constraint — documentary or type-level. The spec and type definition are silent on what verb-level flags ON a multi-action verb mean: do they apply to every sub-action (like a global `--apply` or `--json` flag)? Are they displayed at the top-level help entry? Do any of them affect the mediation routing for the sub-actions beneath?

This ambiguity is load-bearing because the three consuming surfaces (help renderer, mediation-class guard, completeness guard — T004–T011) will independently build against this interface. If they each resolve the undefined case differently, the behavior will be inconsistent: the renderer might display verb-level flags in the sub-action usage blocks while the guard ignores them entirely. A multi-action `CommandDescriptor` with non-empty `flags` is a plausible shape for verbs like `roadmap` that may share cross-cutting flags across sub-actions, so the undefined case is likely to appear in real data. Fixing at this stage is cheap (either document the invariant precisely, or add an explicit field like `sharedFlags` on the multi-action branch, or use the discriminated union from task-300 to make the multi-action branch structurally incapable of carrying `flags`).

---

### AUDIT-20260619-15 — `liveVerbs()` silently truncates if the `Verbs:` line wraps in help output

Finding-ID: AUDIT-20260619-15
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:33-45

`liveVerbs()` extracts the verb list by finding the first line starting with `"Verbs:"` and splitting it on `","` (lines 33, 38–43). The guards at lines 27–35 and 46–52 fail loud on two cases: the line is absent, or the parsed list is empty. Neither guard detects a TRUNCATED list produced by line-wrapping. If `stackctl --help` emits the verb list across multiple lines — either via a continuation indent or because the terminal width causes the help library to wrap — only the verbs on the first `Verbs:` line are captured. The result is a non-empty, non-empty-checking-passing list that silently omits the wrapped verbs.

The blast-radius: tests that iterate `liveVerbs()` and probe each verb would pass against a SUBSET of the actual verb surface. A newly-added verb whose name happens to be wrapped onto the second line would never be checked for help conformance, defeating the primary goal of SC-001 completeness detection. The error message at line 32 prints the full stdout (helpful for a human reading a test failure), but the dangerous path is a PASSING test suite that silently covers fewer verbs than exist. A mitigation is to either assert `verbs.length >= EXPECTED_MIN_VERB_COUNT` with a named constant, or parse the full multi-line block rather than only the first matching line.

### AUDIT-20260619-16 — Help conformance accepts any stdout, not a usage body

Finding-ID: AUDIT-20260619-16
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:82-89

`isHelpConformant()` claims to validate “exit 0 with a non-empty usage body on STDOUT,” but the implementation only checks `probe.stdout.trim().length > 0`. That means a broken verb that exits 0 and prints any non-empty stdout, such as a warning, banner, JSON blob, or partial error text, passes the SC-001 helper even if no usage text was rendered.

The blast radius is medium because this is test infrastructure for the front-door completeness feature: downstream tests built on this predicate can falsely pass while the actual help contract is broken. A reasonable fix would assert a recognizable usage/help marker from the renderer, for example `Usage:` or the expected `stackctl <verb>` invocation shape, while still keeping the stdout-only routing check.

## 2026-06-19 — audit-barrage lift (20260619T171020114Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-17 — `SubActionDescriptor.positional` cannot represent multi-positional sub-actions

Finding-ID: AUDIT-20260619-17
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/cli-help/command-surface.ts:29-30

The `positional` field is typed `string | null`, meaning the descriptor model can express exactly two states: "takes one positional argument" (non-null) or "takes none" (null). Many CLI sub-actions take two or more positionals — `roadmap add-edge` is the immediately plausible example (`<from> <to>`), and any `move`, `rename`, or `link`-style sub-action is likely to follow the same pattern. The second and subsequent positionals are silently dropped; the descriptor compiles without error, and any consumer (help renderer, completeness guard, mediation-class guard) built from this type will produce systematically wrong output for multi-positional sub-actions. Because the downstream consumers described in the file header comment ("each landed behind its own RED test") build directly from this shape, an incorrect type is baked in before they are even written. The fix is `readonly positionals: readonly string[]` (empty = none; one entry = one positional; two = two); or, if ordering isn't needed, `readonly positionals: ReadonlySet<string>`. Either form makes the current single-positional callers write `[positional]` rather than a bare string, which surfaces any affected sites at compile time.

---

### AUDIT-20260619-18 — `CommandDescriptor.flags` has undefined semantics for multi-action verbs

Finding-ID: AUDIT-20260619-18 (claude-02 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:42-44

The `CommandDescriptor.flags` JSDoc says "Verb-level flags (single-action verbs)." This comment scopes the field to single-action verbs, implying it carries no contract for multi-action verbs (`subActions.length > 0`). However, multi-action verbs commonly have shared cross-cutting flags — `--dry-run`, `--format`, `--output` — that apply regardless of which sub-action is selected. With `flags` undefined-by-contract for multi-action descriptors, two divergent consumer behaviors are equally plausible: (a) ignore `CommandDescriptor.flags` entirely when `subActions` is non-empty, and (b) always union `CommandDescriptor.flags` with `SubActionDescriptor.flags`. Neither is wrong *from the type*. A help renderer that takes path (a) silently drops shared flags; one that takes path (b) incorrectly shows single-action flags on a multi-action verb. The fix is an explicit decision documented in the field comment: either "always `[]` for multi-action verbs — use `SubActionDescriptor.flags` for per-sub-action flags and add a `sharedFlags` field here for cross-cutting ones" or "also populated for multi-action verbs to capture flags that apply to all sub-actions." Either direction eliminates the ambiguity; the current comment creates it.

---

### AUDIT-20260619-19 — `FlagDescriptor` has no short-flag alias field

Finding-ID: AUDIT-20260619-19
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:14-22

`FlagDescriptor` carries `name` (the long form, e.g. `"depends-on"`) but has no field for the short alias (e.g. `"d"`). Commander option definitions routinely bind both (`-d, --depends-on`), and the canonical help format users expect is `"-d, --depends-on <value>"`. Without a `shortFlag: string | null` field, the descriptor type structurally can't represent this duality. The commander-tree walker that builds `CommandDescriptor` instances will silently drop short aliases when it populates `FlagDescriptor.name`, and the help renderer built from the descriptor will never emit them. The blast-radius is every generated `--help` surface: adopters using short flags at the command line will see them work but not appear in help, breaking discoverability. The fix is adding `readonly shortFlag: string | null` to `FlagDescriptor` and populating it in the commander-tree walker; `null` for flags that genuinely have no short form.

---

### AUDIT-20260619-20 — `liveVerbs()` parses stdout regardless of exit code

Finding-ID: AUDIT-20260619-20
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:26-27

`liveVerbs()` calls `runCli(['--help'])` and proceeds directly to parse `r.stdout` without checking `r.status`. The exit code is only surfaced inside error-message strings if the `Verbs:` line is missing or empty. If a future CLI regression causes `stackctl --help` to exit non-zero while still emitting partial output (e.g., a middleware error that fires before the usage printer but writes an error banner followed by partial usage), the function may parse a stale or malformed verb list and return it successfully — while every other test in the suite then passes vacuously against a broken surface. The guard is trivial: `if (r.status !== 0) throw new Error(\`...\`)` before the `split('\n')` parse. The error message can include the full stdout so the failure is still diagnosable.

---

### AUDIT-20260619-21 — `isHelpConformant` regex `/usage:/i` over-matches

Finding-ID: AUDIT-20260619-21
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:83-84

The conformance predicate passes if `probe.stdout` contains the substring `usage:` anywhere, case-insensitively. This admits false positives from error messages ("Illegal usage: …"), content descriptions, or unrelated banners that happen to include the token. The stated intent is to detect a `Usage:` header emitted by the descriptor renderer (as the file comment says), so a line-anchored match is more honest: `/^usage:/im` (multiline, so `^` matches start-of-line, not just start-of-string). The current form risks a future verb that exits 0 and emits an error banner containing "usage:" — it would pass SC-001 even though no actual usage block is present, eroding the test's ability to catch help-routing regressions.

---

### AUDIT-20260619-22 — Flat `CommandDescriptor` shape allows structurally inconsistent instances (tracked as task-300)

Finding-ID: AUDIT-20260619-22
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/cli-help/command-surface.ts:40-60

The invariant "if `subActions.length > 0` then `mediationClass === null`, else `mediationClass !== null`" is expressed only in a comment; TypeScript cannot enforce it. A `CommandDescriptor` with `subActions: [x]` and `mediationClass: 'mutating'` compiles cleanly. The `mediationClass | null` design forces null-handling (which is the intent per the comment referencing a prior AUDIT-BARRAGE-claude-01 Phase 1 finding), but it doesn't prevent the dual-populated inconsistent case. The open task `".stack-control/backlog/tasks/task-300 - 028-design-consideration-CommandDescriptor-flat-shape-vs-discriminated-union-single-multi-action.md"` already captures this as a live design question. Surfacing it here only to confirm it remains open and that the current flat shape, before task-300 is resolved, carries that structural risk — especially relevant to any consumer that uses `subActions.length === 0` as the discriminant rather than `mediationClass !== null` (the two checks should be equivalent but aren't enforced to be).

### AUDIT-20260619-23 — Uncollected help harness adds no actual coverage

Finding-ID: AUDIT-20260619-23
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:1-2; missing collected `*.test.ts` consumer in the audited diff

The new harness explicitly says it is “NOT a `*.test.ts`, so vitest does not collect it” at lines 1-2, and the audited diff does not add any collected test file that imports `liveVerbs()`, `probeHelp()`, or `isHelpConformant()`. That means the SC-001/FR-001 help-surface contract described throughout this file is not enforced by this change as written; Vitest will ignore the file unless some separate `*.test.ts` consumer exists.

The blast radius is high because downstream governance can read this as an implemented command-surface probe while the test suite gets no new failing signal when a verb lacks `--help` output. A reasonable fix is to add the collected test surface in this same feature slice, importing the harness and asserting every live verb exits 0 with conformant stdout usage.

## 2026-06-19 — audit-barrage lift (20260619T172227649Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-24 — Type invariants for multi-action `CommandDescriptor` are documentation-only, not type-enforced

Finding-ID: AUDIT-20260619-24
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:55-68

The `CommandDescriptor` interface specifies two correlated invariants for multi-action verbs: when `subActions.length > 0`, `flags` MUST be `[]` and `mediationClass` MUST be `null`. These invariants are enforced by prose comments only. The TypeScript type system cannot express "this field must equal `[]` when another field's array is non-empty," so a `CommandDescriptor` literal with `subActions: [...]`, `flags: [someFlag]`, and `mediationClass: 'mutating'` compiles without error. An agent building the commander-tree walker or the completeness guard from these contracts alone would get no compile-time feedback if it populates both fields on a multi-action verb — the mediation-class guard would then silently classify every sub-action's mutating operations as having an already-classified verb-level class, bypassing per-sub-action gating. The comment at lines 59-60 acknowledges the flat-shape vs. discriminated-union question is deferred to TASK-300. Until that lands, a narrow runtime validator (e.g., `assertCommandDescriptorInvariants(d: CommandDescriptor): void` that throws if `d.subActions.length > 0 && (d.flags.length > 0 || d.mediationClass !== null)`) would make the invariant enforceable by the walker and testable in a RED test, without requiring the discriminated-union restructure.

---

### AUDIT-20260619-25 — `liveVerbs()` silently truncates if the `Verbs:` line wraps

Finding-ID: AUDIT-20260619-25
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:38-56

The comment at lines 38-44 asserts that `spawnSync` captures raw bytes with no TTY-width wrapping, "so the single matched line carries the complete set; there is no multi-line continuation to truncate." This assertion is documented but not validated at runtime. `split('\n').find(l => l.startsWith('Verbs:'))` returns the first matching line — if the `Verbs:` output ever wraps (e.g., the verb list grows, `printUsage` is reformatted, or the caller somehow inherits a TTY-width environment variable), the harness parses only the first fragment. The empty-list guard at lines 58-64 catches complete collapse (`verbs.length === 0`) but NOT partial truncation: if the first line contains ten verbs and the second contains five, the guard passes, the harness returns ten verbs, and the per-verb help-probe loop covers only those ten — the five truncated verbs never get a conformance check. Every test in the suite then passes vacuously for the missing verbs, inverting the "fail loud" principle stated in the harness comment. A simple postcondition — asserting that `verbs.length` meets a known minimum, or cross-checking the parsed count against a constant derived from the registered command table — would make this truncation detectable.

---

### AUDIT-20260619-26 — `FlagDescriptor.required` semantics are underspecified between parser-enforcement and business-logic

Finding-ID: AUDIT-20260619-26
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-surface.ts:20-21

The `required: boolean` field's description is "Whether the flag is mandatory for the operation." This does not distinguish between two materially different interpretations: (a) the CLI parser refuses the command and exits non-zero if the flag is absent, or (b) the flag is documented as mandatory by convention but the parser does not enforce it. An agent building the help renderer might annotate required flags with a `*` marker or `<required>` placeholder. An agent building the mediation interceptor might treat `required === true` as a parser-level guarantee it can rely on to reject malformed invocations. A validator agent might generate test cases that omit required flags and expect exit 1 vs. expect a business-logic error message. All three are plausible readings of "mandatory for the operation." Clarifying the semantics in the field doc — even one sentence distinguishing "the commander parser enforces this" from "the operation errors at runtime if absent" — would prevent divergent implementations without changing the type.

---

### AUDIT-20260619-27 — `SubActionDescriptor` has no `deprecatedAliasOf` field, creating asymmetry with `CommandDescriptor`

Finding-ID: AUDIT-20260619-27
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/cli-help/command-surface.ts:34-48 (SubActionDescriptor), src/cli-help/command-surface.ts:71-77 (CommandDescriptor)

`CommandDescriptor` carries `deprecatedAliasOf: string | null` and documents its use with the concrete example `check-editor-symmetry → check-module-symmetry`. `SubActionDescriptor` has no equivalent field. The pattern of retiring a sub-action name while keeping the old name as an alias (e.g., `roadmap add-dep → roadmap add-edge`) is plausible as the surface matures. If that need arises, adding `deprecatedAliasOf` to `SubActionDescriptor` would be a structural addition to the type contract — any downstream consumer that exhaustively patterns over `SubActionDescriptor` fields would need an update. The asymmetry may be intentional (no sub-action aliases exist today), but it is undocumented in the type. A brief comment noting "no sub-action aliasing is modeled; add `deprecatedAliasOf` here if sub-action renames follow the top-level pattern" would make the design choice explicit and prevent a future agent from assuming the field is simply missing by oversight.

## 2026-06-19 — audit-barrage lift (20260619T175717145Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-28 — Optional positional arguments always rendered as required `<arg>` notation

Finding-ID: AUDIT-20260619-28 (claude-01 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=high, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:230 (`projectSubAction`)

`projectSubAction` builds the `positionals` array as:

```typescript
positionals: sub.registeredArguments.map((a) => `<${a.name()}>`),
```

Commander's `Argument` class distinguishes required (`<arg>`) from optional (`[arg]`) via its `required` boolean property — an argument declared as `command.argument('[path]', ...)` has `a.required === false` and `a.name()` returns `'path'` (just the identifier, no brackets). The current code unconditionally wraps every argument in `<...>`, rendering optional arguments as if they were required.

Because the descriptor is the upstream source for the help renderer, the verb reference, and the mediation guard, a consumer building help text or validating invocations from `CommandDescriptor` will see `<path>` where the parser actually accepts `[path]`, causing misleading help output and potentially incorrect arity validation. The fix is to branch on `a.required`:

```typescript
positionals: sub.registeredArguments.map((a) =>
  a.required ? `<${a.name()}>` : `[${a.name()}]`
),
```

---

### AUDIT-20260619-29 — Commander's auto-added `--help` option pollutes every descriptor's `flags` array

Finding-ID: AUDIT-20260619-29
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:240–250 (`projectCommand`)

`projectCommand` builds `universalFlags` from `command.options` unfiltered:

```typescript
const universalFlags = command.options.map(projectFlag);
```

Commander adds a `-h, --help` option to every `Command` by default (and `-V, --version` on the root program). These live in `command.options` and are therefore projected into `universalFlags`. For a multi-action verb, they propagate into every `SubActionDescriptor.flags`; for a single-action verb, they appear in `CommandDescriptor.flags`. Every consumer of the descriptor (help renderer, verb reference, mediation guard) will see a `{name: 'help', shortFlag: 'h', ...}` entry that was never declared as part of the API contract — it is a framework implementation detail.

A help renderer emitting `Flags: -h, --help  display help for command` inside a `--help` response is circular. A mediation guard checking whether any flag signals a write might special-case this flag unnecessarily. Filter framework-owned options before projecting:

```typescript
const universalFlags = command.options
  .filter((o) => !['help', 'version'].includes((o.long ?? '').replace(/^--/, '')))
  .map(projectFlag);
```

---

### AUDIT-20260619-30 — Test files exist on disk as untracked but were not committed alongside the implementation

Finding-ID: AUDIT-20260619-30
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    git status (session context): `?? src/__tests__/cli-help/command-surface.test.ts`, `?? src/__tests__/cli-help/render-help.test.ts`

The session-start git status shows two untracked test files:

```
?? src/__tests__/cli-help/command-surface.test.ts
?? src/__tests__/cli-help/render-help.test.ts
```

Commit `1315b4eb` lands both the descriptor type contracts (`command-surface.ts`) and the test harness (`command-surface-harness.ts`), but the test files that exercise the contracts were not staged or committed. The commit therefore shipped implementation without the tests that the harness is designed to support. Per the project's TDD discipline (`.claude/rules/testing.md`: "Write tests alongside implementation, not after"), these must be committed in the same phase — a test harness committed without the tests it serves is itself vacuous. The missing test files also mean CI cannot verify the descriptor contracts or the completeness guard fires correctly.

---

### AUDIT-20260619-31 — Short-only flags (no `--long` form) produce a `name` field with a leading `-` dash

Finding-ID: AUDIT-20260619-31
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-surface.ts:200–209 (`projectFlag`)

```typescript
const long = option.long ?? option.flags;
return {
  name: long.replace(/^--/, ''),
  ...
};
```

When a commander option has no long form (e.g., only `-v`), `option.long` is `undefined` and the fallback is `option.flags` — a string like `"-v"`. The `replace(/^--/, '')` pattern strips exactly `--`; it is a no-op against a single-dash string, leaving `name` as `"-v"` (with the dash), violating the contract described in the JSDoc ("Dashed long form, e.g. `depends-on`"). Any downstream consumer that assumes `name` is dash-free would misrender or misroute. The fix is to also strip a single leading dash in the fallback:

```typescript
name: long.replace(/^-+/, ''),
```

---

### AUDIT-20260619-32 — Variadic positional arguments lose their variadic indicator in the descriptor

Finding-ID: AUDIT-20260619-32
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-surface.ts:230 (`projectSubAction`)

Commander supports variadic arguments declared as `command.argument('<files...>', ...)`. The commander `Argument` class exposes this via a `variadic` boolean property. The current mapping:

```typescript
positionals: sub.registeredArguments.map((a) => `<${a.name()}>`),
```

produces `<files>` instead of `<files...>`, dropping the `...` indicator. A help renderer consuming this descriptor would show a fixed-arity positional where the CLI actually accepts one or more, silently misrepresenting the invocation contract. This compounds with finding -01 above (both stem from the same mapping not consulting `Argument` metadata). The fix:

```typescript
positionals: sub.registeredArguments.map((a) => {
  const name = a.variadic ? `${a.name()}...` : a.name();
  return a.required ? `<${name}>` : `[${name}]`;
}),
```

---

### AUDIT-20260619-33 — `isHelpConformant` can false-positive on a verb that exits 0 with structured output containing a `usage:` line

Finding-ID: AUDIT-20260619-33
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:89–108 (`isHelpConformant`)

The conformance predicate is:

```typescript
return probe.status === 0 && /^usage:/im.test(probe.stdout);
```

The `m` (multiline) flag makes `^` match the start of ANY line, not just the document start. If a verb exits 0 while emitting structured output (JSON, YAML, or machine-readable text) that happens to contain a line beginning with `usage:` — e.g., `"usage": 5` in a JSON response, or a `usage: <count>` field in YAML — the predicate returns `true` and classifies the verb as help-conformant even though it printed no help text.

The status-zero guard reduces this risk considerably (a non-help verb that exits 0 with structured data would need to specifically have a `usage:` key at line-start), and the code comment correctly identifies the design intent. The blast-radius is limited: a false-conformance reading causes a test to pass when the verb is not actually help-conformant, which is a missed regression rather than a data-corruption issue. Noted here for the operator's awareness if any query verbs are added that emit structured output on success; the predicate may need to also require, e.g., a `Usage:` line on stdout from a specific known prefix format.

### AUDIT-20260619-34 — Command surface omits most live verbs

Finding-ID: AUDIT-20260619-34
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/cli-help/command-surface.ts:83-89, src/cli-help/command-surface.ts:133-139

`buildCommandSurface()` is documented as projecting the stack-control command surface, but `MOUNTED` contains only `roadmap`. The comments explicitly say this descriptor generalizes the roadmap-only pattern to all verbs, while the implementation hardcodes a one-entry registry and relies on a subsequent migration to append the other families.

The blast radius is high because downstream consumers named in this file, such as the descriptor artifact, verb reference, and fronted-operations registry, would read an incomplete surface and treat every non-roadmap verb as absent. Nothing in `buildSurfaceFrom()` or `assertSurfaceComplete()` compares `MOUNTED` against the live `stackctl --help` verb set, so omissions pass cleanly. A reasonable fix is to add a guard that compares descriptor verbs with the live/declared top-level command registry, or rename/scope this API so consumers cannot mistake the roadmap-only subset for the full front door.

## 2026-06-19 — audit-barrage lift (20260619T180308082Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-35 — `liveVerbs()` silently under-covers when the `Verbs:` line wraps

Finding-ID: AUDIT-20260619-35
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface-harness.ts:38-51

The `liveVerbs()` function's parsing logic picks up exactly one line — the first line matching `l.startsWith('Verbs:')` — and treats it as the complete verb set. This is correct only if `printUsage` in `src/cli.ts` places all verbs on a single `\n`-terminated line. The harness comment cites the implementation (`Verbs: ${keys.join(', ')}\n`) as justification. That claim may be accurate today, but it creates implicit coupling to a distant implementation detail: if `printUsage` ever introduces a column-width wrap (e.g. for readability), `liveVerbs()` would silently return the verbs from only the first wrapped segment. The failure mode is particularly dangerous: with some verbs present, neither the empty-list guard nor the non-zero-exit guard fires. Every per-verb downstream loop would pass vacuously for the missing verbs, giving a "green" coverage signal while exercising a strict subset of the surface.

A more robust alternative is to either (a) parse the entire block from `Verbs:` until the next blank line or section header, or (b) add an assertion that `liveVerbs().length` equals a known minimum, so a silently-incomplete parse trips a test before the per-verb suite runs. The current design converts a `printUsage` wrapping change (a cosmetic formatting decision) into an invisible regression in the test harness's coverage accuracy — the worst category of test-infrastructure failure.

---

### AUDIT-20260619-36 — `assertSurfaceComplete` does not check flag descriptions for completeness

Finding-ID: AUDIT-20260619-36 (claude-02 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=low, codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/cli-help/command-surface.ts:268-289

`assertSurfaceComplete` iterates over every `CommandDescriptor` and `SubActionDescriptor` and asserts that their `.description` fields are non-empty. The same completeness contract is not applied to `FlagDescriptor.description`. A commander option registered with an empty description string (e.g. `.option('--dry-run', '')`) passes through `projectFlag` (line ~206) with `description: option.description` — an empty string — and then through `assertSurfaceComplete` without any error. The descriptor's help renderer (a later phase) and the verb reference will then emit an empty help row for that flag, exactly the drift the completeness guard was designed to prevent.

The fix is a third nested loop in `assertSurfaceComplete` that walks `verb.flags` and each `sub.flags`, throwing on any entry where `f.description.trim().length === 0`. Given that the guard already iterates the full surface, adding this loop is low cost.

---

### AUDIT-20260619-37 — `projectFlag` `name` field is corrupt when `option.long` is undefined

Finding-ID: AUDIT-20260619-37
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-surface.ts:196-208

In `projectFlag`, the name is derived via:

```ts
const long = option.long ?? option.flags;
return {
  name: long.replace(/^-+/, ''),
  ...
};
```

When `option.long` is `undefined` (a short-only option such as `program.option('-v', 'verbose')`), the fallback is `option.flags`, which is the raw flags string as declared (e.g. `'-v'`). After `replace(/^-+/, '')` this yields `'v'` — a single-character opaque identifier rather than a meaningful long-form name. This results in a `FlagDescriptor` where `name: 'v'` and `shortFlag: 'v'` are identical, and the descriptor carries no semantic name. More critically, the `FRAMEWORK_FLAGS` filter on line ~224 uses the same `(o.long ?? '').replace(/^-+/, '')` path: if a framework-owned short-only flag were ever added, it would not be filtered out of the descriptor.

No current stackctl verb appears to use a short-only option, so the blast radius is low today. It is still a latent correctness bug that becomes active the moment any such option is registered, and the fallback's intent (use `option.flags` as a last resort) will not produce a usable name for a multi-token flags string like `'-d, --depends-on <id>'` if `long` were somehow absent for such a definition.

---

### AUDIT-20260619-38 — `ROADMAP_SUBACTION_MEDIATION` completeness is not statically enforced against the live roadmap command

Finding-ID: AUDIT-20260619-38
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/cli-help/command-surface.ts:148-173

`ROADMAP_SUBACTION_MEDIATION` is a hand-authored `Record<string, MediationClass>` with 14 entries. It is declared parallel to the sub-actions that `buildRoadmapCommand()` registers, with no compile-time or test-time mechanism to verify they match. When a new sub-action is added to the roadmap command, `requireSubActionMediation` (lines ~232-240) will throw at runtime — a loud failure, not a silent one — but only at the point a test or production invocation calls `buildCommandSurface()`. There is no RED test that exercises "every sub-action registered on the live roadmap command has a mediation entry."

This is already better than the alternative (silent default), and the pattern is consistent with Decision 4 (declared, not inferred). The improvement is a test that iterates `buildRoadmapCommand().commands` and asserts each name is a key in `ROADMAP_SUBACTION_MEDIATION` — catching the gap at test time rather than runtime.

### AUDIT-20260619-39 — Deferral comments normalize missing front-door consumers

Finding-ID: AUDIT-20260619-39
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-surface.ts:5-12,57-63,133-139

The diff contains explicit deferred-work comments: lines 5-12 describe several promised consumers while saying they do not exist yet, lines 57-63 defer a shared-flags shape to a backlog item, and lines 133-139 say additional mounted families are appended in a later phase. The audit prompt’s hard constraint says to surface deferral phrases found in the diff, and the project guide also calls placeholder/deferred comments operator-discipline traps.

The immediate runtime blast radius is low because these comments do not change behavior. The risk is process drift: unattended agents may treat the missing renderer/artifact/registry/shared-flag work as already dispositioned by comment instead of enforcing the current feature boundary. A tighter fix is to remove or rephrase these as current-state constraints and encode pending work in the workplan/backlog, not in shipped source comments.

## 2026-06-19 — audit-barrage lift (20260619T181252754Z-028-front-door-completeness-phase-2)

### AUDIT-20260619-40 — `render-help.ts` committed without its test file

Finding-ID: AUDIT-20260619-40
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/cli-help/render-help.ts (entire file); `src/__tests__/cli-help/render-help.test.ts` is absent from the diff

`render-help.ts` is included in this commit — it ships `renderVerbHelp`, `renderSubActionHelp`, `flagToken`, and the private helpers `table` and `universalFlags`. None of these are covered by the tests in this diff. `src/__tests__/cli-help/render-help.test.ts` appears in the working-tree git status as `??` (untracked), meaning it exists on disk but was not staged or committed. The project's TDD discipline requires tests alongside implementation, not after.

The blast radius is concrete: `renderVerbHelp` has several untested branches — multi-action vs. single-action, deprecated-alias annotation, the universal-flags re-extraction and rendering path, and the case of a verb with no flags. `renderSubActionHelp`'s error path (unknown sub-action name) and its positionals rendering are also untested. These are the primary user-visible outputs of the feature; a silent regression in any branch would not be caught by the existing test suite.

Fix: commit `render-help.test.ts` alongside `render-help.ts`. At minimum cover: `flagToken` with and without a short flag; `renderVerbHelp` for a multi-action verb with universal flags, a single-action verb with flags, a deprecated alias, and a verb with no flags; `renderSubActionHelp` happy path, positionals rendering, and the unknown-sub-action throw.

---

### AUDIT-20260619-41 — `assertSurfaceComplete` does not validate flag descriptions

Finding-ID: AUDIT-20260619-41
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:254-270

The completeness guard (T007) checks that every verb and sub-action carries a non-empty `description`, but it never inspects `FlagDescriptor.description`. A commander option registered with an empty or whitespace description — possible when a flag is added to the `roadmap-command` without a description string — passes the guard silently and then renders as a blank right-column in the help table or verb reference.

```typescript
// assertSurfaceComplete only checks:
if (verb.description.trim().length === 0) { throw … }
if (sub.description.trim().length === 0) { throw … }
// flag.description is never checked
```

The stated purpose of the guard is to make description-drift a build-time failure. A flag with an empty description is exactly that failure: the registered surface and its documentation diverge. The blast radius is two surfaces: the help output (a blank row) and the verb-reference artifact (a gap in the flag table). Neither is caught by any existing test.

Fix: extend the loop in `assertSurfaceComplete` to also check `flag.description.trim().length > 0` for every flag in `verb.flags` and `sub.flags`. Mirrors the existing verb/sub-action checks in shape.

---

### AUDIT-20260619-42 — Positional-count test normalizes to a boolean — would false-fail a correctly-implemented multi-positional sub-action

Finding-ID: AUDIT-20260619-42
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/cli-help/command-surface.test.ts:49-57

```typescript
const expected = (grammar?.positionals ?? 0) >= 1 ? 1 : 0;
expect(sub.positionals.length, `positionals for ${sub.name}`).toBe(expected);
```

The expression `(grammar?.positionals ?? 0) >= 1 ? 1 : 0` collapses any count ≥ 1 to the constant `1`. If a future roadmap sub-action requires two positionals (e.g. `add-edge <from> <to>`) and `grammar.positionals` is `2`, the `SubActionDescriptor` correctly projects `2` positionals — but the test asserts `2 === 1` and fails. The implementation is correct; the test reports it broken. This is a false failure that will cause a maintainer to look at the test before the implementation, and the misleading error (`expected 2, got 1`) obscures the actual problem.

The fix is an exact-count assertion: `expect(sub.positionals.length).toBe(grammar?.positionals ?? 0)`. The test description already says "one `<identifier>` or none" — if that invariant holds for the current grammar, the simpler assertion is still satisfied; if a multi-positional sub-action is ever added, the test correctly fails with an exact mismatch rather than a misleading one.

---

### AUDIT-20260619-43 — Usage line always says `[flags]` even for flags-free single-action verbs

Finding-ID: AUDIT-20260619-43
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/render-help.ts:42-46

```typescript
lines.push(
  isMulti
    ? `Usage: stackctl ${descriptor.verb} <subaction> [flags]`
    : `Usage: stackctl ${descriptor.verb} [flags]`,
);
```

For a single-action verb with no flags (`descriptor.flags.length === 0`), `renderVerbHelp` renders `Usage: stackctl <verb> [flags]`. The `[flags]` token implies optional flags are accepted, but the "Flags:" section is omitted (`else if (descriptor.flags.length > 0)`). The resulting help body says `[flags]` in the usage line and then shows nothing under flags — a contradiction the operator would notice.

`--help` and `--version` are filtered by `FRAMEWORK_FLAGS`, so they don't appear in the flag table, yet the usage line implicitly claims them via `[flags]`. For the current `roadmap` verb (multi-action, so this branch is not reached) this is invisible today, but any future single-action verb with no business-logic flags will exhibit the contradiction.

Fix: conditionally include `[flags]` in the single-action usage line only when `descriptor.flags.length > 0`.

---

### AUDIT-20260619-44 — Unreachable guard after length check in `universalFlags` (render-help.ts)

Finding-ID: AUDIT-20260619-44
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/render-help.ts:28-35

```typescript
function universalFlags(subActions: readonly SubActionDescriptor[]): readonly FlagDescriptor[] {
  if (subActions.length === 0) return [];
  const first = subActions[0];
  if (first === undefined) return [];   // ← unreachable
  return first.flags.filter(…);
}
```

After the `subActions.length === 0` guard returns early, the next line assigns `subActions[0]`, which is guaranteed to be a `SubActionDescriptor`. The `if (first === undefined) return []` check is dead code: control can only reach it when the array is non-empty, so `first` is never `undefined` at runtime.

If `noUncheckedIndexedAccess` is enabled in `tsconfig`, TypeScript would type `subActions[0]` as `SubActionDescriptor | undefined` and require the guard for type safety. But the prior length check is the correct way to handle that — TypeScript's control-flow narrowing doesn't narrow array-index access after a length check, so the dead-code guard is the workaround. If that is the intent, a code comment clarifying the `noUncheckedIndexedAccess` motivation would prevent the next reader from incorrectly removing the check as obviously dead. Without such context the check reads as an oversight.

---

### AUDIT-20260619-45 — No mechanism to detect when a CLI verb is mounted in the parser but absent from `MOUNTED`

Finding-ID: AUDIT-20260619-45
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/cli-help/command-surface.ts:134-138 (the `MOUNTED` constant)

`MOUNTED` is a manually-maintained registration array. When Phase 3 adds the remaining verb families to the commander tree, each new verb must be explicitly added to `MOUNTED`. There is no test or runtime guard that detects a mounted-but-absent verb: a verb added to the CLI entry point without a corresponding `MOUNTED` entry would be silently omitted from the help surface, verb reference, and fronted-operations registry — exactly the drift the descriptor system exists to prevent.

The test `'returns one descriptor per mounted verb'` checks that `roadmap` is present, but it does not assert that `MOUNTED.length` equals the number of verbs on the live `stackctl` program instance. A completeness test in this spirit — e.g., asserting that every sub-command registered on the root program appears in the surface — would close the gap. This is informational because the gap is structural to the current phase (only `roadmap` is mounted), but it becomes load-bearing in Phase 3 when additional families join.

### AUDIT-20260619-46 — Required positionals are rendered as optional

Finding-ID: AUDIT-20260619-46
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/cli-help/command-surface.ts:176-180; src/cli-help/render-help.ts:81-83

`projectPositional()` preserves commander’s declared optional syntax, and `renderSubActionHelp()` prints that value directly. For roadmap, commander intentionally declares required semantic identifiers as `[identifier]` so missing-argument errors keep legacy behavior, but the operation still requires the identifier. The new descriptor therefore makes `roadmap add`, `advance`, `blocks`, `cluster`, etc. render as `stackctl roadmap add [identifier] [flags]`, even though running without the identifier fails.

Blast radius is high because downstream help, descriptor artifacts, and agent consumers will treat a required operand as optional. A reasonable fix is to project semantic arity from the grammar/metadata, or add an explicit descriptor field distinguishing parser optionality from required operation input, and render required roadmap identifiers as `<identifier>`.

### AUDIT-20260619-47 — Command surface omits almost every live verb

Finding-ID: AUDIT-20260619-47
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/cli-help/command-surface.ts:83-89; src/cli-help/command-surface.ts:133-139; src/__tests__/cli-help/command-surface.test.ts:21-33

`buildCommandSurface()` is advertised as the source that downstream help, verb reference, descriptor artifact, and fronted-operation registry consume, but `MOUNTED` contains only `roadmap`. The tests only assert that `roadmap` is present and matches `SUBACTION_SPECS`; they do not compare the descriptor surface to the live top-level verb set from `stackctl --help` / `SUBCOMMANDS`.

Blast radius is blocking for front-door completeness: a consumer using this as the authoritative command surface will silently miss the rest of the shipped CLI verbs, so generated references and guardrails can pass while most operations remain undiscovered or ungoverned. A reasonable fix is to either build from the live dispatcher’s registered verbs or add a hard parity guard that fails until every live verb has a descriptor entry.

## 2026-06-19 — audit-barrage lift (20260619T182427443Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-48 — `reconcile` declared `read-only` — requires verification against actual sub-action behavior

Finding-ID: AUDIT-20260619-48
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/cli-help/command-surface.ts:162 (`reconcile: 'read-only'` in `ROADMAP_SUBACTION_MEDIATION`)

In the `ROADMAP_SUBACTION_MEDIATION` map, `reconcile` is classified as `read-only`. The word "reconcile" in roadmap CLI contexts typically means "write derived state back to the file" or "sync computed graph state to disk." If `stackctl roadmap reconcile` actually writes to the roadmap markdown document, the mediation interceptor will allow the call through without prompting — silently bypassing the capability gate for a mutating write operation. The whole point of the `MediationClass` machinery (Decision 4, referenced throughout the file) is that `mutating` writes are gated. A wrong classification at the map level defeats that gate for exactly the operations where it matters most.

This cannot be verified from the diff alone — the roadmap command implementation isn't in scope — but the classification must be confirmed against the actual sub-action behavior before the mediation guard goes live. A similar question applies to `order` (shown as `read-only`): if `roadmap order` rearranges entries in the file, it is also mutating. The blast radius of a wrong `read-only` classification is a write operation that bypasses the gate with no observable failure; the blast radius of a wrong `mutating` classification is only an unwanted prompt, which the operator can dismiss. Asymmetric risk argues for verifying both before proceeding.

---

### AUDIT-20260619-49 — `ROADMAP_SUBACTION_MEDIATION` has no exhaustiveness guard against the live command tree

Finding-ID: AUDIT-20260619-49
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:155–176 (`ROADMAP_SUBACTION_MEDIATION`), src/cli-help/command-surface.ts:215–225 (`requireSubActionMediation`)

`ROADMAP_SUBACTION_MEDIATION` is a static object literal declaring mediation classes for 14 roadmap sub-actions. `requireSubActionMediation` throws at runtime if a sub-action name is missing from the map. The guard is loud, which is good, but it is late: the failure surfaces only when `buildCommandSurface()` is first called (e.g., when a help probe runs or the descriptor artifact is built), not when the sub-action is added to `buildRoadmapCommand()`. There is no compile-time or test-time assertion that the map's key set exactly matches the set of sub-commands actually registered in the commander tree.

The practical failure mode: a developer adds a new sub-action to `buildRoadmapCommand()` without knowing to update `ROADMAP_SUBACTION_MEDIATION`. The build compiles cleanly; the unit tests that don't call `buildCommandSurface()` pass; the failure surfaces as a thrown error only when the surface is first exercised. Phase 3 explicitly plans to mount additional verb families; the same gap will recur for each new multi-action verb. A test that calls `buildCommandSurface()` — or even `buildSurfaceFrom(MOUNTED)` — at module load would catch this immediately, but the test files that would exercise it are untracked and not committed (see Finding-ID claude-04).

A structural fix: add a type-level exhaustiveness check using a mapped type or a `satisfies` assertion against the live sub-command names. Alternatively, make the first line of the mounted verb's `build()` invocation compute the authoritative name set and cross-reference it against `subActionMediation` keys at surface-build time.

---

### AUDIT-20260619-50 — Parent command flags merged into sub-actions without deduplication or collision detection

Finding-ID: AUDIT-20260619-50
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:244 (`flags: [...universalFlags, ...projectFlags(sub.options)]` in `projectSubAction`)

`universalFlags` are the parent verb's filtered options spread into every sub-action descriptor ahead of that sub-action's own options. If a sub-action declares a flag whose long name matches a universal flag (e.g., both the parent and a sub-action declare `--apply` or `--doc`), the resulting `FlagDescriptor[]` contains two entries with the same `name`. No deduplication or collision-detection guard exists anywhere in the projection path.

Downstream consumers — the help renderer, the verb reference artifact, the mediation guard — all iterate over `flags`. A duplicate entry means the help surface renders the same flag twice, the verb reference has a repeated row, and any flag-name-keyed lookup (e.g., finding the mediation class from a flag name) picks whichever entry happens to come first. None of these are catastrophic for the current roadmap command (which may not have any collisions), but the contract is not enforced and will not be detected until the surface is rendered. Adding a post-merge uniqueness assertion — `throw if two FlagDescriptors share a name` — in `projectSubAction` would catch this at surface-build time.

---

### AUDIT-20260619-51 — `assertSurfaceComplete` does not validate `FlagDescriptor.description`, inconsistent with its stated scope

Finding-ID: AUDIT-20260619-51
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/command-surface.ts:271–310 (`assertSurfaceComplete`)

The function's docstring says "Help, the verb reference, and the descriptor artifact all render a description per node, so a blank one is drift between the registered surface and its documentation — a defect to surface at build time." It then guards only verb-level and sub-action-level descriptions, not flag descriptions. Commander's `Option.description` is `''` for undocumented flags (no compiler error, no runtime throw). When the help renderer renders a flag row, a `description: ''` produces an empty description column — the exact drift the completeness guard is stated to prevent.

The backlog task TASK-302 (visible in the working-tree status as an untracked file) acknowledges the gap: `assertSurfaceComplete-should-validate-FlagDescriptor.description-but-roadmap-flags-carry-empty-commander-descriptions-until-T013.md`. The problem: (a) the docstring as written implies completeness for "every node" but the implementation is narrower, and (b) the gap is real today — commander flags with no description will pass the guard and produce empty help rows. The TASK-302 note defers the fix to T013 based on the current roadmap flags carrying empty descriptions, but that is the generator, not the fix. Empty flag descriptions are the defect; the fix is to require descriptions on every flag at registration time (not wait for T013), or to narrow the docstring to match the implementation.

---

### AUDIT-20260619-52 — Committed harness has no committed consumers — dead exported code in the repo snapshot

Finding-ID: AUDIT-20260619-52
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/cli-help/command-surface-harness.ts (entire file)

`command-surface-harness.ts` is committed in this snapshot as a shared fixture exporting `liveVerbs()`, `probeHelp()`, `HelpProbe`, and `isHelpConformant()`. The git status shows `src/__tests__/cli-help/command-surface.test.ts` and `src/__tests__/cli-help/render-help.test.ts` as untracked (`??`), meaning they exist on disk but are not committed. No committed code imports any of the harness exports. In the committed state, every export in the harness is dead code: untested, unreachable by vitest, and silently decoupled from any downstream consumer.

The risk is API drift: if the harness interface changes between this commit and the commit that adds the test files, the test files will require updating — and the gap will only be discovered when the tests are finally collected by vitest. A cleaner phase boundary would either commit the harness and the tests that use it together in the same commit, or leave the harness untracked until its consumers are ready. As-is, the harness is a spec artifact with no verification that it compiles correctly in the import graph (TypeScript will type-check it, but nothing exercises the exported functions end-to-end).

---

### AUDIT-20260619-53 — `positionalsRequired` override is verb-level with no per-sub-action escape hatch

Finding-ID: AUDIT-20260619-53
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/cli-help/command-surface.ts:128–138 (`VerbMetadata.positionalsRequired`), src/cli-help/command-surface.ts:240 (usage in `projectSubAction`)

`VerbMetadata.positionalsRequired: boolean` is applied uniformly to ALL sub-actions of the verb when `true`. The current use case (roadmap's `[identifier]` declared optional in commander but semantically required) works because every id-taking roadmap sub-action does in fact require the identifier. But the interface as designed cannot express a mixed verb where some sub-actions have optional positionals and some require them. A future verb author who sets `positionalsRequired: true` at the verb level to force a single sub-action's positional will silently misrepresent genuinely-optional positionals in every other sub-action as required — and the rendered help will mislead callers.

The fix is straightforward: change `positionalsRequired?: boolean` in `VerbMetadata` to `positionalsRequired?: boolean | readonly string[]` (where the array form names specific sub-actions that override), or move the field to `subActionMediation`'s value type. This is a forward-compatibility concern rather than a current defect, but the interface is the public extension point Phase 3 authors will read; a misleading interface shape produces misleading verb registrations.

### AUDIT-20260619-54 — `buildCommandSurface()` is named as full-surface but only returns `roadmap`

Finding-ID: AUDIT-20260619-54
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    `src/cli-help/command-surface.ts:83-89`, `src/cli-help/command-surface.ts:143-155`, `src/cli-help/command-surface.ts:278-284`

`buildCommandSurface()` is documented as the command surface that “the single source `--help`, the verb reference, the descriptor artifact, and the fronted-operations registry all read” (`278-281`), but `MOUNTED` contains only `roadmap` (`143-155`). The file also acknowledges that the remaining verb families are not mounted (`83-89`). Any downstream completeness guard or generated reference that trusts this API as the full stackctl surface will silently omit every flat-dispatched verb still present in `stackctl --help`.

The blast radius is high because the feature is about front-door completeness: a consumer acting on this descriptor as written can mark the surface complete while most real verbs are absent. A reasonable fix is to either make this builder cover the same top-level verb set as the live dispatcher, or rename/scope the API so only roadmap-specific consumers can use it until the full surface is represented.

### AUDIT-20260619-55 — Collected tests for the new descriptor builder are missing from the audited diff

Finding-ID: AUDIT-20260619-55
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    missing test surface for `src/cli-help/command-surface.ts`

The diff adds nontrivial production logic in `src/cli-help/command-surface.ts`, including commander introspection, flag filtering, positional rendering, mediation-class enforcement, and completeness checks (`157-310`). The only test-adjacent file in the diff is `src/__tests__/cli-help/command-surface-harness.ts`, which explicitly says it is “NOT a *.test.ts” (`1-2`), so it is shared test support rather than a collected test.

The blast radius is medium: the code may work for roadmap today, but regressions in descriptor projection or guard behavior would not be caught by this audited change. A reasonable fix is to include collected Vitest coverage that exercises `buildCommandSurface()`, `buildSurfaceFrom()`, mediation-class failures, and blank-description failures against controlled commander fixtures.

## 2026-06-19 — audit-barrage lift (20260619T182805548Z-028-front-door-completeness-phase-2)

### AUDIT-20260619-56 — `render-help.test.ts` exists on disk but was never committed alongside `render-help.ts`

Finding-ID: AUDIT-20260619-56
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/cli-help/render-help.ts` (committed in this diff) vs. `src/__tests__/cli-help/render-help.test.ts` (untracked in git status, not in diff)

The git status shows `?? src/__tests__/cli-help/render-help.test.ts` — the `??` prefix means the file exists on disk but was never staged or committed. The diff commits `render-help.ts` (100 lines, two exported functions with multiple non-trivial code paths) without committing its test. The testing rules and TDD discipline in `agent-discipline.md` both require tests alongside implementation, not after. The consequence is that the committed `render-help.ts` has zero test coverage in the repository's current state. Any CI run on this commit passes without exercising `renderVerbHelp` or `renderSubActionHelp`. The file must be committed as part of this phase or `render-help.ts` must be deferred until its tests are committed first.

---

### AUDIT-20260619-57 — `renderSubActionHelp` always emits `[flags]` in the usage line regardless of whether the sub-action carries any flags

Finding-ID: AUDIT-20260619-57
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/cli-help/render-help.ts:82`

```typescript
lines.push(`Usage: stackctl ${descriptor.verb} ${sub.name}${positionals} [flags]`);
```

This line unconditionally appends `[flags]` to every sub-action usage line. The verb-level help renderer in the same file handles this correctly with a conditional:

```typescript
const flagsToken = isMulti || descriptor.flags.length > 0 ? ' [flags]' : '';
```

For a sub-action with an empty `flags` array, the rendered output would be:

```
Usage: stackctl roadmap next <identifier> [flags]

<description>
```

— with no "Flags:" section below it, because that section is guarded by `if (sub.flags.length > 0)`. The usage line advertises flags that do not exist and are not documented. In the current implementation all roadmap sub-actions inherit the parent's `--doc` flag through `projectSubAction`, so `sub.flags` is never empty in practice. But the contract of `renderSubActionHelp` is general — it accepts any `CommandDescriptor` and sub-action name — and future verbs with flag-free sub-actions will emit misleading help. The fix is the same conditional applied at the verb level: `const flagsToken = sub.flags.length > 0 ? ' [flags]' : '';`.

---

### AUDIT-20260619-58 — `projectFlag` produces a malformed `name` for short-only Commander options

Finding-ID: AUDIT-20260619-58
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/cli-help/command-surface.ts:163–175`

```typescript
function projectFlag(option: Option): FlagDescriptor {
  const long = option.long ?? option.flags;
  return {
    name: long.replace(/^-+/, ''),
    shortFlag: option.short ? option.short.replace(/^-+/, '') : null,
    ...
  };
}
```

For a short-only Commander option (declared as `-v` with no `--verbose` long form), `option.long` is `undefined` and the fallback is `option.flags`. For a short-only option, `option.flags` is the full declaration string `-v`. After `replace(/^-+/, '')`, `name` becomes `'v'` (a single character). Since `option.short` is also `-v`, `shortFlag` also becomes `'v'`. `flagToken` then renders:

```
-v, --v
```

The `--v` form is not a valid long flag and was never declared. The framework-flags filter (`FRAMEWORK_FLAGS.has((o.long ?? '').replace(/^-+/, ''))`) also silently passes these options through because `o.long ?? ''` is `''` for short-only options, and `FRAMEWORK_FLAGS.has('')` is `false`. No mounted verb currently uses a short-only option, so this does not fire today. But it is a latent correctness bug in the projection layer — the component that is supposed to make drift "structurally impossible." A short-only option slipping through would produce a descriptor (and rendered help) that misrepresents the CLI's actual grammar.

---

### AUDIT-20260619-59 — `assertSurfaceComplete` does not validate `FlagDescriptor.description`, allowing silent help-row drift for flags

Finding-ID: AUDIT-20260619-59
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/cli-help/command-surface.ts:282–298`

```typescript
export function assertSurfaceComplete(surface: readonly CommandDescriptor[]): void {
  for (const verb of surface) {
    if (verb.description.trim().length === 0) { ... }
    for (const sub of verb.subActions) {
      if (sub.description.trim().length === 0) { ... }
    }
  }
}
```

The guard enforces non-empty descriptions for verbs and sub-actions but not for flags. A `FlagDescriptor` with an empty `description` passes the completeness guard and propagates into rendered help as a blank entry in the flag table — exactly the "blank help row = drift" the guard is designed to prevent. This is already tracked as `task-302` in the backlog (visible in the untracked file listing in git status), so the operator is aware. Noting it here because it is an active gap in the guard's contract and because the rationale in the guard's own JSDoc ("Help, the verb reference, and the descriptor artifact all render a description per node, so a blank one is drift") applies equally to flag rows. The fix and its dependency on T013 (roadmap flags currently carry empty commander descriptions) are already scoped; this finding is informational confirmation that the gap is real, not new.

---

### AUDIT-20260619-60 — `universalFlags` in `render-help.ts` uses name-only equality; flags with the same name but differing `arg`/`description` across sub-actions would silently render the first sub-action's version

Finding-ID: AUDIT-20260619-60
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/cli-help/render-help.ts:28–35`

```typescript
return first.flags.filter((f) => subActions.every((s) => s.flags.some((g) => g.name === f.name)));
```

The predicate identifies "universal" flags (present on all sub-actions) by `name` alone. Two flags with the same `name` but different `arg`, `required`, or `description` values across sub-actions would be treated as the same flag; the rendered "Universal flags" section would show the first sub-action's version, silently dropping the divergent values. This is not an active defect in the current implementation: all sub-actions receive the same parent-command flags via the fixed `[...universalFlags, ...projectFlags(sub.options)]` projection in `projectSubAction`, so the values are identical across sub-actions. But the equality contract is weaker than the actual invariant the code relies on, and future verbs that construct sub-action flag lists differently could produce subtly wrong rendered help without any warning.

### AUDIT-20260619-61 — Defers Required 028 Surfaces To Nonexistent Consumers

Finding-ID: AUDIT-20260619-61
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/cli-help/command-surface.ts:6-11

The header says the commander-tree walker, completeness guard, mediation-class guard, generic help renderer, verb reference, descriptor artifact, and fronted-operations registry “are derived FROM these shapes” and “are defined alongside,” but then immediately says “Until those consumers exist these are the contracts they build against.” In this diff, only the walker, completeness guard, mediation guard, and renderer exist; the verb reference, descriptor artifact, and fronted-operations registry are not present.

That is a governance trap for 028-front-door-completeness: a downstream unattended consumer can read this as the feature already having the single-source derived surfaces, when several named surfaces are absent from the audited work product. Blast radius is high because the stated feature is about front-door completeness and drift prevention; shipping comments that claim missing derived surfaces exist weakens the audit signal and can hide unfinished required work. A reasonable fix is to either add the missing generated/derived surfaces in this change or rewrite the contract comments to state exactly which surfaces are implemented in this diff without implying absent ones exist.

### AUDIT-20260619-62 — Universal Flag Detection Collapses Distinct Flags By Name Only

Finding-ID: AUDIT-20260619-62
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/render-help.ts:25-37

`universalFlags()` decides a flag is universal if every sub-action has some flag with the same `name`: `s.flags.some((g) => g.name === f.name)`. It ignores `shortFlag`, `arg`, `required`, and `description`, so two sub-actions with the same long name but different value placeholders or semantics would be collapsed into one verb-level “Universal flags” row using the first sub-action’s descriptor.

The current roadmap surface may not hit this today, but the renderer is explicitly generic for “ANY CommandDescriptor,” so this becomes a compounding design issue as more verbs are mounted. The blast radius is medium: it can produce misleading help for future migrated verbs without failing loud, but it does not break the current roadmap projection by itself. A reasonable fix is to compare the full rendered flag token plus description, or only mark flags universal when their complete descriptor fields match across all sub-actions.

## 2026-06-19 — audit-barrage lift (20260619T192019422Z-028-front-door-completeness-phase-1)

### AUDIT-20260619-63 — Verb reference and descriptor artifact are not surfaced as CLI/build artifacts

Finding-ID: AUDIT-20260619-63
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/src/cli-help/verb-reference.ts:16-30 and plugins/stack-control/src/cli-help/verb-reference.ts:93-99; missing CLI/build surface

The implementation adds `renderVerbReference()` and `emitDescriptorArtifact()` as exported TypeScript helpers, but the audited diff does not add any `stackctl` subcommand, package script, bin entry, generated file, or build step that exposes either output. That conflicts with the marked-complete work item at `plugins/stack-control/specs/028-front-door-completeness/tasks.md:107`, which says the reference must be surfaced as a reference verb or build emitter, and with `spec.md:171`, which requires the descriptor artifact to be emitted as a build/CLI artifact.

The blast radius is high because external consumers named by FR-052, such as docs-site, MCP, and cross-vendor parity consumers, cannot obtain the promised artifact from the installed plugin; only in-repo TypeScript tests can import the helper. A reasonable fix is to add an actual `stackctl` reference/artifact command or a package build emitter that prints/writes these derived outputs, and test that installed consumers can invoke it without importing source modules.

### AUDIT-20260619-64 — Descriptor artifact emits `null` for command mediation where the contract promises a string

Finding-ID: AUDIT-20260619-64
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    plugins/stack-control/src/cli-help/verb-reference.ts:49-53 and plugins/stack-control/src/cli-help/verb-reference.ts:80-83

The descriptor artifact type allows `ArtifactCommand.mediationClass` to be `string | null`, and `commandObject()` copies `descriptor.mediationClass` directly into the artifact. Multi-action verbs have `descriptor.mediationClass === null`, so the emitted JSON contains `"mediationClass": null` for those commands. The published C4 contract at `plugins/stack-control/specs/028-front-door-completeness/contracts/command-surface.md:78-86` documents command-level `mediationClass` as `"mutating" | "read-only"`.

The blast radius is high because a downstream consumer validating the generated artifact against the published shape will reject common multi-action verbs, while a looser consumer may treat `null` as an unclassified operation. The fix is to make the artifact shape and contract agree: either emit only per-sub-action mediation for multi-action verbs and update the schema accordingly, or provide a non-null command-level classification that external consumers can rely on.

## 2026-06-19 — audit-barrage lift (20260619T192643482Z-028-front-door-completeness-phase-2)

### AUDIT-20260619-65 — Verb reference and descriptor artifact are implemented but not surfaced

Finding-ID: AUDIT-20260619-65
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    plugins/stack-control/specs/028-front-door-completeness/tasks.md:106-109; plugins/stack-control/src/cli-help/verb-reference.ts:16-30,93-98

The workplan marks T039 complete with “surface it as a reference verb / build emitter,” and T041 complete for the descriptor artifact. The implementation only adds library functions: `renderVerbReference()` and `emitDescriptorArtifact()`. The new tests call those functions directly, but no changed CLI/subcommand/build surface exposes either artifact to an adopter or agent.

Blast radius: a downstream consumer acting on the completed task and SC-001 claim cannot actually obtain the generated verb reference or descriptor through `stackctl`; the artifact exists only inside test/import code. A reasonable fix is to add an explicit `stackctl` surface or build emitter for both outputs, document it, and test it through the public command path rather than only through direct function calls.

## 2026-06-19 — audit-barrage lift (20260619T193413542Z-028-front-door-completeness-phase-3)

### AUDIT-20260619-66 — Sub-action detection in `tryRenderVerbHelp` is defeated by `--doc path` or any `--flag value` placed before the sub-action

Finding-ID: AUDIT-20260619-66
Status: migrated-to-backlog TASK-303
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/cli.ts:163-175`

`tryRenderVerbHelp` locates the sub-action name with:

```typescript
const sub = args.find((a) => !a.startsWith('-'));
```

This returns the first non-flag token in `args`. Because `--doc <path>` is documented as a "universal" (allowed everywhere) flag in the inbox and other handlers — see the comment at `src/subcommands/inbox.ts` ("--doc is universal") and the backlog SKILL.md examples that pass `--doc` inline — a realistic invocation like `stackctl inbox --doc /some/INBOX.md list --help` produces `args = ['--doc', '/some/INBOX.md', 'list', '--help']`. The find returns `'/some/INBOX.md'`, which fails the sub-action lookup, and `renderVerbHelp` is rendered instead of `renderSubActionHelp(descriptor, 'list')`. The user gets verb-level help when they asked for sub-action help.

The test coverage in `help-full-surface.test.ts` calls `probeHelp(descriptor.verb, sub.name)` which spawns `stackctl <verb> <sub> --help` with no preceding flags, so this case is never exercised. A minimal fix is to skip tokens that are the value of a preceding `--flag` — or, since sub-action names in this CLI never begin with a path separator or digit, filter more tightly. An alternative: only attempt sub-action routing when the first token that doesn't begin with `-` appears at `args[0]` (i.e., before any flags), which matches every real usage pattern in the codebase's SKILL.md examples.

---

### AUDIT-20260619-67 — `help-scope-checks.test.ts` asserts verb order while every peer test sorts — fragile ordering dependency

Finding-ID: AUDIT-20260619-67
Status: migrated-to-backlog TASK-304
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/__tests__/cli-help/help-scope-checks.test.ts:18-25`

```typescript
it('mounts every declared scope-check verb', () => {
    expect(surface.map((d) => d.verb)).toEqual([
      'check-anti-patterns',
      'check-adopters',
      'check-module-symmetry',
      'check-editor-symmetry',
      'check-deprecations',
    ]);
  });
```

No `.sort()` is applied to either side, so the test asserts both PRESENCE and DECLARATION ORDER. Every peer test in this diff (`help-scope-clones.test.ts:18-27`, `help-capability.test.ts:19-24`) calls `.sort()` on both sides, testing only set membership. If the order of `SCOPE_CHECKS_VERBS` changes for any reason (alphabetical re-sort, newly inserted verb, refactor) this test breaks while the scope-clones and capability tests do not. The inconsistency means a maintainer adding a new scope-check verb must know to insert it at a specific position — an invisible convention not captured in any comment.

---

### AUDIT-20260619-68 — `afterEach` in `session-active-spec-completeness.test.ts` clears the tracking array but never deletes the temp directories

Finding-ID: AUDIT-20260619-68 (claude-03 + codex-02; cross-model)
Status: migrated-to-backlog TASK-305
Severity:   low
Per-lane:   claude=low, codex=low
Decision:   agreement (gate-counted low)
Surface:    `src/__tests__/session-active-spec-completeness.test.ts:14-16`

```typescript
afterEach(() => {
  roots.length = 0;
});
```

`makeFeature` calls `mkdtempSync(join(tmpdir(), 'sc-active-spec-'))` and appends the path to `roots`, but `afterEach` only truncates the array — it never calls `rmSync`. Each test run leaves three `sc-active-spec-*` directories in `/tmp`. In CI environments that reuse an agent across many runs, these accumulate indefinitely. The fix is:

```typescript
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
```

`rmSync` is available in `node:fs` (Node 14.14+) and is already imported by the surrounding code pattern.

---

### AUDIT-20260619-69 — `session-discovery-path-portability.test.ts` only scans `src/session/` — hardcoded paths in other `src/` modules are invisible to it

Finding-ID: AUDIT-20260619-69
Status: migrated-to-backlog TASK-306
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    `src/__tests__/session-discovery-path-portability.test.ts:13-23`

The test guards the literal string `plugins/stack-control/bin/stackctl` in `src/session/*.ts` files only. Source files in `src/subcommands/`, `src/capability/`, `src/cli-help/`, and other subdirectories are not scanned. Given that the SKILL.md updates in this diff (backlog, extend, roadmap) replace the full path in documentation, and the separate `session/` test ensures the session module is clean, the scope is intentional — but a stale path reference introduced in e.g. a new subcommand file would not be caught by any test, only discovered at adopter install time. Worth a comment in the test to make the intentional scope explicit, or a broader sibling test that walks all `src/` TypeScript files.

### AUDIT-20260619-70 — Unknown sub-action help exits successfully as parent help

Finding-ID: AUDIT-20260619-70
Status: migrated-to-backlog TASK-307
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli.ts:163-174

`tryRenderVerbHelp` treats any argv containing `--help`/`-h` as a successful help request, then picks the first non-flag token as a possible sub-action. If that token is not a known sub-action, lines 169-172 fall back to `renderVerbHelp(descriptor)` and line 174 returns `true`, so `main()` exits 0 at lines 200-201. That means a typo like `stackctl workflow statuz --help` or `stackctl backlog captuer --help` is reported as successful parent help instead of an unknown sub-action.

The blast radius is medium because agents and scripts commonly use `--help` exit status to probe whether an operation exists. As written, invalid sub-actions become false positives. A reasonable fix is to distinguish “no sub-action requested” from “unknown sub-action token requested”: render parent help only when there is no positional token, render sub-action help for a known sub-action, and return/throw a usage error for an unknown sub-action.

## 2026-06-19 — audit-barrage lift (20260619T194135545Z-028-front-door-completeness-phase-3)

### AUDIT-20260619-71 — `SELF_HELP_VERBS` is a manually-maintained denylist with no in-band declaration mechanism

Finding-ID: AUDIT-20260619-71
Status: migrated-to-backlog TASK-308
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli.ts:157-188

`tryRenderVerbHelp` short-circuits on `SELF_HELP_VERBS.has(verb)` before it ever consults the descriptor registry. The denylist is a bare hardcoded `Set<string>` containing only `'roadmap'`. There is no reciprocal flag in the `CommandDescriptor` type (e.g., `selfHandlesHelp: boolean`) that would let the verb declare its own preference; the denylist is the only mechanism.

The blast-radius scenario: a developer mounts a new self-documenting verb (one whose flat handler already emits rich, context-aware `--help`) into the command surface, publishes a descriptor for it (so the capability-coverage test stays green), but forgets to add it to `SELF_HELP_VERBS`. From that commit forward, `tryRenderVerbHelp` will intercept every `<verb> --help` invocation, render the descriptor-based body, and exit 0 before the flat handler runs — silently discarding the richer output the handler was built to produce. The regression is invisible to the developer because `help-full-surface.test.ts` passes (it only asserts `Usage:` presence and `exit 0`, not that the right renderer fired) and there is no compile-time or test-time enforcement of the denylist membership.

The fix is to move the opt-out onto the descriptor: add an optional `selfHandlesHelp: true` field to `CommandDescriptor`, set it on the roadmap entry, and replace the `SELF_HELP_VERBS.has(verb)` check with `descriptor?.selfHandlesHelp`. Then forgetting to set the field defaults to descriptor-based help (no silent override), and the annotation is visible alongside the descriptor that defines the verb.

---

### AUDIT-20260619-72 — `inferChainPosition` hardcodes `'tasks.md'` independently of the artifact path table

Finding-ID: AUDIT-20260619-72
Status: migrated-to-backlog TASK-309
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/session/chain-position.ts:103-106

The new guard block reads:

```typescript
if (present.has('tasks') && isFullyImplemented(join(featureAbs, 'tasks.md'))) {
  return null;
}
```

`present.has('tasks')` is populated by iterating the `ARTIFACTS` table (not in this diff) which maps the `'tasks'` key to its on-disk filename — almost certainly via `existsSync(join(featureAbs, 'tasks.md'))`. The guard then independently re-constructs the same path `join(featureAbs, 'tasks.md')` without going through that table.

The coupling is benign as long as both sides agree, but they can drift silently: if the artifact table ever changes the filename or the `isFullyImplemented` call site is copied into another function with a different path expression, `present.has('tasks')` can be true while `isFullyImplemented` reads a different (or nonexistent) file — causing it to return `false` and never suppress the stale "active spec" signal (the TASK-130 bug re-emerges). The fix is to have `isFullyImplemented` receive the resolved path from the same table lookup that established `present.has('tasks')` — or to expose the artifact→path mapping as a constant that both sites import.

---

### AUDIT-20260619-73 — `session-discovery-path-portability.test.ts` guards only `src/session/` while the forbidden path may leak elsewhere in `src/`

Finding-ID: AUDIT-20260619-73
Status: migrated-to-backlog TASK-310
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/session-discovery-path-portability.test.ts:1-28

The test correctly identifies `plugins/stack-control/bin/stackctl` as a source-repo-only path that must not appear in adopter-visible output, and it scans every `.ts` file under `src/session/`. The accompanying scope note acknowledges this is intentional: "a stale path in another src/ subtree would surface elsewhere."

That "elsewhere" is unspecified. Subcommand files, capability modules, and any new helper that emits user-facing advice about how to invoke `stackctl` are all plausible leak sites. The three SKILL.md files updated in this diff (`backlog`, `extend`, `roadmap`) were the immediate source of the path leaks; the test guards the programmatic discovery code specifically. A broader grep-based test over all of `src/` (not just `src/session/`) would close the remaining gap at low cost, but the current scoping is explicitly documented and represents a reasonable triage decision rather than an oversight.

### AUDIT-20260619-74 — Descriptor artifact drops short flag aliases

Finding-ID: AUDIT-20260619-74
Status: migrated-to-backlog TASK-311
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/cli-help/verb-reference.ts:31-64

`emitDescriptorArtifact()` claims to emit the descriptor artifact with “EXACTLY the verbs / sub-actions / flags the live surface exposes,” but `ArtifactFlag` only carries `arg`, `required`, and `description`; `flagsObject()` omits `shortFlag` even though `FlagDescriptor` has it and `flagLine()` renders it into the human reference. A downstream manifest consumer cannot reconstruct aliases like `-h`/other short options from the artifact, so the artifact is not a true round-trip of the command surface.

The blast radius is medium: this does not break help rendering directly, but it makes the new machine-readable artifact incomplete while the tests still pass because they only compare long flag names. A reasonable fix is to include `shortFlag: string | null` in `ArtifactFlag` and assert it in `descriptor-artifact-roundtrip.test.ts`.

## 2026-06-19 — audit-barrage lift (20260619T201758854Z-028-front-door-completeness-phase-3)

### AUDIT-20260619-75 — `--reason` is collected, validated, and echoed — but never persisted to the backing store

Finding-ID: AUDIT-20260619-75
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/backlog.ts:147–173 (`emitDone`)

`emitDone` requires `--reason`, validates it is non-empty, and writes it to stdout in the success message (`backlog done: closed ${id} (reason: ${reason})\n`). The user sees all the signals of a persisted audit trail. But `backend.close(id)` is called with only the ID — no `reason` argument. The reason is validated then silently dropped; it never reaches the backing store.

If FR-010 specifies terminal closure with a captured reason (the flag's presence as a required named argument strongly implies this), the spec surface the operator sees — a mandatory `--reason` flag — sets an expectation that the backing store records it. That expectation is false. The blast radius is an audit trail that appears populated but isn't: every `done` closure from this point forward carries no reason in the store, and any downstream query, report, or review surface that tries to surface reasons will come back empty.

Reasonable fix: extend `BacklogBackend.close(id, reason: string)` to accept the reason and store it (e.g. as a `closureReason` field in the item's YAML), then thread `reason` through the call here.

---

### AUDIT-20260619-76 — Dry-run in `emitDone` returns before validating item existence — inconsistent with `emitArchive`

Finding-ID: AUDIT-20260619-76 (claude-02 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/subcommands/backlog.ts:153–157 (`emitDone`) vs. 177–199 (`emitArchive`)

`emitDone` gates on `!flags.apply` and returns immediately — before any existence check. Dry-running against a nonexistent ID prints a success-looking message and exits 0. In apply mode, `backend.close(id)` will throw a `BacklogError` (assuming the backend fails loud on unknown IDs), which is caught and exits 1.

`emitArchive` does the opposite: it performs the existence check and status guard *before* the dry-run gate, so `backlog archive --dry-run <bad-id>` exits 1. Dry-run is the operator's safety check before committing a write. When dry-run returns 0 for an input that apply would reject, the safety check is broken. The inconsistency means `done` and `archive` behave differently for the same class of input, and the operator cannot trust dry-run as a pre-flight for `done`.

Reasonable fix: mirror `emitArchive`'s structure — call `backend.list().find(i => i.id === id)` before the dry-run gate, emit exit 1 if the item is absent, then continue to the dry-run/apply branch.

---

### AUDIT-20260619-77 — Non-null assertion `!` after a TOCTOU gap in `emitCapture`

Finding-ID: AUDIT-20260619-77
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/backlog.ts:126–130 (`emitCapture`)

```ts
if (ref !== undefined && backend.exists(ref)) {
  const existing = backend.list().find((i) => i.refs.includes(ref))!;
```

`backend.exists(ref)` and `backend.list().find(...)` are two separate reads. If the item is removed between the two calls — or if `exists()` and `list().find()` resolve against the store differently (e.g. one reads a cached view, the other a fresh scan) — the assertion `!` crashes at runtime with an unhandled `TypeError: Cannot read properties of undefined`. The comment on the `exists()` call notes it "fails loud on an undecidable-negative (malformed store)," which suggests store integrity issues are a real concern; if the store is partially malformed, the divergence between `exists()` and `list()` becomes more likely.

Additionally, the project CLAUDE.md rule "Never bypass typing — No `as Type`, no `@ts-ignore`" extends to non-null assertion `!` as a semantically equivalent bypass of TypeScript's null safety: it suppresses the compiler's correct warning that `find` may return `undefined`. This should instead use a null guard and exit cleanly with an informative error.

Reasonable fix: replace the non-null assertion with an explicit guard and a `BacklogError` path (or a `process.stderr` + `process.exit(1)`) so a store inconsistency produces a clean diagnostic rather than an uncaught exception.

---

### AUDIT-20260619-78 — `--analyze-clean` flag infrastructure wired in `roadmap-command.ts` with no visible grammar entries enabling it

Finding-ID: AUDIT-20260619-78
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap-command.ts:68–75 (`flagsFromCommand`), 127–130 (`registerSubaction`)

The diff adds `analyzeClean` to the skip list in `flagsFromCommand` and adds `--analyze-clean` registration to `registerSubaction` conditional on `grammar.analyzeClean === true`. But the diff does not show any roadmap subaction grammar definition that sets `analyzeClean: true`. In `backlog.ts` the analogous grammar table (`SUBACTION_SPECS`) is inline and visible; the absence of corresponding roadmap grammar entries from this diff leaves the wiring with no activating grammar — `--analyze-clean` will never be registered for any subcommand.

If the grammar entries live in the non-diffed portion of `roadmap-command.ts`, this is a non-issue and the finding closes immediately on inspection. But if they are genuinely absent, the entire `analyzeClean` pathway is dead code: the `flagsFromCommand` skip, the boolean parse, and the `registerSubaction` branch are all inert, and `--analyze-clean` will not appear on any help surface or be accepted by any subcommand. An agent building from this diff alone (e.g. to wire a test or add a dependent feature) will not be able to discover which subcommand(s) accept the flag.

Reasonable fix: verify the grammar definition exists and, if not, add the entry in the same commit so the flag is reachable.

---

### AUDIT-20260619-79 — `emitDone` does not guard against double-close (already-`Done` item)

Finding-ID: AUDIT-20260619-79
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/backlog.ts:161–171 (`emitDone`)

`emitDone` calls `backend.close(id)` without first checking whether the item is already in `Done` status. Whether double-close is safe depends entirely on `BacklogBackend.close`'s implementation — if it is idempotent (no-op on already-done items), the behavior is acceptable; if it overwrites a timestamp, re-emits a lifecycle event, or throws an uninformative error, it is a silent misbehavior.

The analogous `emitArchive` explicitly guards the status: `if (item.status !== BACKLOG_DONE_STATUS) { failUsage(...) }`. There is no symmetric guard in `emitDone` (`if (item.status === BACKLOG_DONE_STATUS) { failUsage('already done') }`). The inconsistency means `archive` is explicit about preconditions and `done` is not, which makes the contract of `done` harder to reason about. The blast radius is small (single-item, non-destructive), but the idempotency assumption is implicit rather than stated.

Reasonable fix: add a pre-call status check mirroring `emitArchive`'s guard, or document explicitly in the function comment that `backend.close` is idempotent so the assumption is visible.

### AUDIT-20260619-80 — `backlog done` drops the required closure reason

Finding-ID: AUDIT-20260619-80
Status:     open
Severity:   blocking
Per-lane:   codex=blocking
Decision:   single-model (gate-counted blocking)
Surface:    src/subcommands/backlog.ts:151-171

`emitDone` requires `--reason` and prints it, but the applied path only calls `backend.close(id)` at line 163. The backend close API sets status to `Done`; no reason is passed or recorded. That contradicts the feature contract for “one disposition (`done`) + `--reason`”, where the reason carries fixed-vs-wontfix nuance.

Blast radius is blocking because an adopter can run the sanctioned terminal closure command exactly as documented and permanently lose the governance rationale. A reasonable fix would make closure persist the reason, likely by extending the backend close operation or composing `edit(... appendNotes ...)` with the status change while preserving fail-loud behavior.

### AUDIT-20260619-81 — `roadmap close-related` still bypasses the new closure semantics

Finding-ID: AUDIT-20260619-81
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    missing update to src/subcommands/roadmap.ts:291-315

The feature requires `roadmap close-related` to be repointed so there is exactly one backlog closure mechanism. The existing handler still calls `backend.close(t)` directly at line 314, with no closure reason and no route through the new `backlog done` semantics added in `src/subcommands/backlog.ts`.

Blast radius is high because two sanctioned front doors now close backlog items differently: `backlog done` requires a reason, while `roadmap close-related` silently closes without one. A reasonable fix would centralize closure behind a shared backend/helper that records the required reason and make both verbs call it.

## 2026-06-19 — audit-barrage lift (20260619T202017087Z-028-front-door-completeness-phase-4)

### AUDIT-20260619-82 — `unpromote` unconditionally calls `setNotes` even when only label is present, risking note erasure

Finding-ID: AUDIT-20260619-82
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/backlog/promote.ts:103–112 (the `if (req.apply)` block)

`unpromote` always includes `setNotes: stripPromotedToLines(notes)` in the `edit` call regardless of whether `hasLine` is true. When an item carries only the `promoted` label (no `Promoted-to:` line in the notes — e.g., a hand-tagged item, or a future code path that adds the label without the line), `notes` equals the result of `extractNotes`, which returns `''` when the `<!-- SECTION:NOTES:BEGIN -->` fence is absent. `stripPromotedToLines('')` returns `''`, and `setNotes: ''` is passed to `backend.edit`, which runs `task edit <id> --notes ''`. If the backlog binary interprets `--notes ''` as "replace the notes section with empty", any notes the item carried are silently erased.

The blast radius is data loss on a write path with no undo in the backlog binary. The fix is to gate the `setNotes` on `hasLine`:

```ts
...(hasLine ? { setNotes: stripPromotedToLines(notes) } : {}),
```

Without that guard, any `unpromote --apply` on an item where the promote flow wrote the label but the `Promoted-to:` notes line was missing or stripped earlier will silently destroy the item's notes.

---

### AUDIT-20260619-83 — `move-edge.test.ts` "cycle detection" test never reaches the cycle-detection path

Finding-ID: AUDIT-20260619-83
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/roadmap/move-edge.test.ts:103–133

The test titled "zero-write when the move would create a cycle" constructs a fixture where `impl:feature/a` has NO `depends-on` edges. It then calls `moveEdge(docPath, 'impl:feature/a', 'depends-on', 'impl:feature/c', ...)` — asking to move a `depends-on: impl:feature/c` edge that does not exist on `a`. The test expects `DocumentModelError` and zero-write, which is correct, but the error is thrown by the "from edge not present" guard, NOT by the cycle-detection logic. The comment inside the test ("give `a` a dep on c, then move it to b → a depends-on b, while b depends-on a ⇒ cycle") describes an intent that the fixture does not implement.

Blast radius: `moveEdge`'s cycle-prevention path has zero test coverage. A regression that silently accepts a cyclic reparent would go undetected. A correct cycle test would add `- depends-on: impl:feature/c` to `impl:feature/a`'s fixture block before calling `moveEdge`.

---

### AUDIT-20260619-84 — `assertNoDanglingTerminalEdge` accesses `doc.grammar.edgeFields` without a null guard

Finding-ID: AUDIT-20260619-84
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/curate.ts:15–21

```ts
const unitRefFields = new Set(
  doc.grammar.edgeFields.filter((f) => f.references === 'unit').map((f) => f.name),
);
```

If the loaded document's grammar does not define `edgeFields` (e.g., a non-roadmap document type, an older grammar version, or a grammar that simply omits the field), this line throws a `TypeError: Cannot read properties of undefined (reading 'filter')` rather than the expected `DocumentModelError`. The existing `if (unitRefFields.size === 0) return;` guard only fires after a successful `.filter()` call; it does not protect against a missing property.

Blast radius: any `curate` invocation on a document whose grammar lacks `edgeFields` crashes with an unhandled TypeError, exposing an unexpected stack trace instead of a clean `DocumentModelError`. Fix: `(doc.grammar.edgeFields ?? []).filter(...)`.

---

### AUDIT-20260619-85 — Two-step title restore (`create` + `edit --title`) leaves an orphan with a truncated title on partial failure

Finding-ID: AUDIT-20260619-85
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/backlog/backend.ts:300–311

```ts
const id = m[1]!;
if (safeTitle !== spec.title) {
  run(['task', 'edit', id, '-t', spec.title, '--plain']);
}
return id;
```

If `task create` succeeds but the follow-up `task edit -t <full-title>` throws (binary crash, timeout, or any error propagated by `run()`), the item is permanently stranded in the live store with the truncated filename-safe title. The caller receives an exception and therefore does not hold the `id`. The item is unreachable by the caller and must be manually located and corrected.

Blast radius: a partially-created item with a wrong title constitutes invisible data corruption in the backlog store — exactly the silent-failure mode the project rules prohibit. No test covers this path. A mitigation would be to have `create` return the id even on second-step failure and let the caller clean up, or to use a single atomic binary operation if the backlog binary supports it.

---

### AUDIT-20260619-86 — `normalize` called in `reconcile.ts` additions is not visible as an import or local definition in the diff

Finding-ID: AUDIT-20260619-86
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/reconcile.ts — `nodeIdForOrphan` (new), `reconcileUnorphan` (new)

Both new functions call `normalize(specRel)` and `normalize(spec)`, but the diff's import block for `reconcile.ts` adds only `basename` and `join` from `node:path` — `normalize` (i.e., `path.normalize`) is not imported. If `normalize` is not defined as a local helper elsewhere in the file (not visible in this diff because it predates this commit), both functions would throw `ReferenceError: normalize is not defined` at runtime.

Blast radius: `reconcile --unorphan` and the `nodeIdForOrphan` helper both crash on first invocation if `normalize` is a missing import. Since the diff is not exhaustive (only shows changed lines), this may be a pre-existing local helper. However, the risk is high enough to warrant verification: confirm that `normalize` resolves to a defined symbol in the complete file before shipping.

---

### AUDIT-20260619-87 — `nodeIdForOrphan` hard-codes `impl:feature/` prefix — no mechanism for other node types

Finding-ID: AUDIT-20260619-87
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/roadmap/reconcile.ts — `nodeIdForOrphan` (new, ~line 139)

```ts
return `impl:feature/${slug}`;
```

Every orphan spec dir is resolved to an `impl:feature/<slug>` node. But orphan specs can represent design phases (`design:feature/…`), multi-feature umbrellas (`multi:feature/…`), or other node types. The operator has no way to override the inferred type when calling `reconcile --unorphan <spec>`. If the orphan corresponds to a design spec and the caller cannot supply a type flag, the command creates a structurally mistyped node.

Blast radius: the roadmap type prefix is semantically load-bearing — `design:` nodes have different lifecycle semantics than `impl:` nodes (the `design-approved` marker, compass transitions). A silently wrong prefix corrupts the roadmap graph. The fix is to accept an optional `--type <prefix>` flag, or at minimum document the hard-coded default prominently and validate that the derived slug matches the expected prefix convention.

---

### AUDIT-20260619-88 — `edge-subactions-cli.test.ts` test name promises "bare reconcile exits 0" but never asserts it

Finding-ID: AUDIT-20260619-88
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/roadmap/edge-subactions-cli.test.ts:121–133

The `it` description reads: "reconcile --unorphan on a non-orphan → exit 2; bare reconcile stays report-only exit 0". The test body only exercises the `--unorphan specs/no-such-orphan --apply` path and asserts exit 2. The "bare reconcile stays report-only exit 0" half of the claim is never exercised by an assertion in the body.

Blast radius: if a future change causes bare `stackctl roadmap reconcile` to exit non-zero or emit a mutation, this test would not catch it. The test names a safety invariant it doesn't enforce. Adding a `runCli(['roadmap', 'reconcile', '--doc', docPath])` call with `expect(r.status).toBe(0)` would close the gap.

---

### AUDIT-20260619-89 — `backlog-unpromote.test.ts` label-presence regex matches any label containing "promoted" as a substring

Finding-ID: AUDIT-20260619-89
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/subcommands/backlog-unpromote.test.ts:53–54, 68–69

```ts
expect(file).toMatch(/labels:[\s\S]*promoted/);
// ...
expect(file).not.toMatch(/labels:[\s\S]*promoted/);
```

The regex `[\s\S]*promoted` matches any label that contains "promoted" as a substring (e.g., `promoted-candidate`, `not-yet-promoted`). If a future label schema introduces a label whose text includes "promoted", the assertions would produce false positives (before-check) or false negatives (after-check) without detecting a real defect.

Blast radius: test correctness, not production correctness. No user-facing regression, but the test would silently pass even if the `promoted` label specifically was not removed while another label containing "promoted" remained. A more precise pattern — `/labels:[\s\S]*\bpromoted\b/` or checking for the exact YAML label line — would make the assertion unambiguous.

### AUDIT-20260619-90 — `backlog done` dry-run reports success for unknown IDs

Finding-ID: AUDIT-20260619-90
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/backlog.ts:151-171

`emitDone` validates `<id>` and `--reason`, but on dry-run it returns before constructing the backend or checking that the item exists. That means `stackctl backlog done TASK-999999 --reason x` exits 0 and prints a “would close” line for an item that cannot be closed. The same verb treats unknown IDs as runtime exit 1 only in the `--apply` branch, via `backend.close`.

The blast radius is medium: no data is corrupted, but the lifecycle verb gives operators false confidence during the default dry-run path. Other new lifecycle verbs validate existence before dry-run reporting (`archive` lists first; `unpromote` calls `unpromote` before reporting), and the feature contract describes unknown id as exit 1. A reasonable fix is to resolve the backend and verify the item exists before the dry-run message, while still only calling `backend.close` under `--apply`.

## 2026-06-19 — audit-barrage lift (20260619T203740527Z-028-front-door-completeness-phase-3)

### AUDIT-20260619-91 — `backend.list()` call is unguarded by try/catch, inconsistent with `backend.close()` error handling

Finding-ID: AUDIT-20260619-91
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/backlog.ts:157-161 (new lines)

The new existence check (`backend.list().find((i) => i.id === id)`) is placed outside the try/catch that wraps `backend.close(id)`. `list()` is an I/O read operation — it can realistically fail for disk errors, a corrupted or partially-written backlog state file, or a race with a concurrent write. When it does, the caller receives a raw, unformatted exception stack trace rather than whatever error message the catch block would emit.

The original code also placed `createBacklogBackend(...)` outside the try/catch, but backend instantiation is typically an in-memory operation (parsing config, constructing an object) rather than a full read of the item list. `backend.list()` is a materially different operation: it reads and decodes the full item store. Adding it outside the try/catch enlarges the unguarded I/O surface beyond what was there before.

The blast radius: any disk-level or file-format failure during a `backlog done --apply` call now produces two distinct error paths — a raw exception for the pre-check and a formatted error for the close — depending on exactly which line faults. A user who hits a list-read failure on a malformed file gets an opaque stack trace instead of a diagnostic message.

Reasonable fix: either wrap the entire `backend.list()` → `backend.close()` block in a single try/catch, or add a narrow try/catch around the `list()` call that emits the same formatted error as the rest of the error surface.

---

### AUDIT-20260619-92 — No test added for the new dry-run + unknown-ID exit path

Finding-ID: AUDIT-20260619-92
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/backlog.ts:157-161 (new lines); expected: backlog.test.ts or equivalent

The commit fixes a previously-untested code path (dry-run `backlog done` reporting "would close" for an unknown ID — the AUDIT-BARRAGE-codex-01 finding from Phase 4). The diff shows no corresponding test file change. Per the codebase's own testing rules ("Write tests alongside implementation, not after") and the stated TDD discipline ("a test that exercises the bug is written before the fix is implemented"), a regression test asserting `stderr contains "no item '<id>'"` + `exit code === 1` for a dry-run invocation with a non-existent ID should have landed in this commit.

Without the test, the fix is one refactor of `emitDone` away from silent regression. This path is now specifically identified as previously-broken behavior, which makes it a high-value regression-test target. The absence is especially notable because the commit message explicitly references the barrage finding that triggered the fix (AUDIT-BARRAGE-codex-01) — TDD discipline requires the test to precede or accompany the implementation, not follow it.

Blast radius: the next edit to `emitDone` (e.g., extracting validation helpers, adding a new flag, reordering the argument checks) could reintroduce the exact bug this commit fixes with no failing test to catch it.

---

### AUDIT-20260619-93 — Dry-run now requires an initialized backlog project — undocumented behavior change

Finding-ID: AUDIT-20260619-93
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/backlog.ts:154 (new line, `ensureBacklogProject()`)

Before this commit, `backlog done --id X --reason Y` (no `--apply`) executed with zero filesystem access: argument validation ran, the dry-run message printed, and the function returned. A user in an environment without an initialized backlog project could preview the command's effect.

After this commit, the same invocation calls `ensureBacklogProject()` and `backend.list()` unconditionally, even when `--apply` is absent. If the project is not initialized, the command now exits with an error rather than printing the dry-run message.

The comment in the diff ("consistent with archive/unpromote, which resolve first") indicates this was intentional alignment with sibling commands. That rationale is sound, but the behavior change isn't reflected in the commit message or any updated `--help` text / skill documentation visible in the diff. If a user has relied on dry-run as a "preview without setup" affordance, this silently breaks that usage.

Blast radius: low — the intent is clearly correct (why would a dry-run be meaningful without a valid project?), and the comment documents the design choice. The gap is missing documentation coverage, not a logic error.

### AUDIT-20260619-94 — Dry-run existence check treats malformed backlog files as definitely absent

Finding-ID: AUDIT-20260619-94
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/backlog.ts:155-163

`emitDone` now uses `backend.list().find((i) => i.id === id)` as an authoritative existence check before both dry-run and apply. But the backlog backend’s `list()` is an availability/read path: malformed task files are skipped with warnings rather than making the answer fail loud. That means a malformed task file for the requested id, or any malformed file that makes the negative answer undecidable, is reported as `backlog: no item '<id>'` at lines 160-162 instead of surfacing store corruption or allowing the backend’s mutation path to decide.

The blast radius is medium because normal healthy stores behave correctly, but corrupted or partially edited stores now get a misleading “no item” runtime result on a mutating lifecycle verb. A reasonable fix would use an integrity-oriented existence helper for id lookup, analogous to the backend’s `exists(ref)` negative-answer handling, or add a backend method that resolves a task id while failing loud when malformed files make absence undecidable.

## 2026-06-19 — audit-barrage lift (20260619T204004441Z-028-front-door-completeness-phase-4)

### AUDIT-20260619-95 — `normalize` called in `reconcile.ts` but not present in the visible import diff

Finding-ID: AUDIT-20260619-95
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/roadmap/reconcile.ts` (lines added at end of file — `nodeIdForOrphan`, `reconcileUnorphan`)

The new `reconcileUnorphan` and `nodeIdForOrphan` functions call `normalize(specRel)` and `report.orphans.map(normalize)`, but the only change to the `node:path` import line is adding `basename` alongside the pre-existing `join`. `normalize` does not appear in that import. If there is no pre-existing local `normalize` helper in the unchanged portion of the file (between the imports and the last line of `reconcile()`), every call to either function would throw `ReferenceError: normalize is not defined` at runtime — silently breaking `roadmap reconcile --unorphan` and all tests that call `reconcileUnorphan` directly.

The diff is not conclusive: unchanged content is not shown. The `reconcile.ts` file does export `globParent` (consumed by the now-removed `reconcileBaseDir` in `roadmap.ts`), so helper functions plausibly exist in the gap. However, that gap is also the most natural home for a `path.normalize` import alias. If `normalize` IS a local utility, it should be verified to handle the separator-normalization and trailing-slash-stripping that the call sites expect. If it is NOT defined, the fix is `import { basename, join, normalize } from 'node:path'`.

---

### AUDIT-20260619-96 — `backend.archive()` passes `--plain` to a subcommand that may not accept it

Finding-ID: AUDIT-20260619-96
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/backlog/backend.ts:397` (`run(['task', 'archive', id, '--plain'])`)

Every other `--plain` usage in `backend.ts` is paired with `task edit` (see `close()` at line 365, and the `task edit -t` restore call in `create()`). The `archive` method at line 397 passes `--plain` to `task archive`, but the backlog binary's `archive` subcommand is not shown to accept this flag. If `task archive` rejects `--plain` with a non-zero exit code, `run()` will throw a `BacklogError` on every invocation, making `backend.archive()` permanently broken. The post-run verification (`if (taskFilePath(id) !== undefined) throw`) would never be reached.

The integration test `backlog-archive.test.ts` exercises the full CLI path and would catch this regression if run against the real binary; however, the diff does not include test-run output. The fix is to verify the backlog binary's `task archive` synopsis — if `--plain` is not valid, drop it and rely on the `taskFilePath` post-check alone.

---

### AUDIT-20260619-97 — Two-step `create()` assumes `task edit -t` updates frontmatter without renaming the file

Finding-ID: AUDIT-20260619-97
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/backlog/backend.ts:303–325` (the `create()` title-restore block)

The filename-safety strategy creates the item with a truncated title (≤ `TITLE_FILENAME_BUDGET` bytes), then restores the full title via `run(['task', 'edit', id, '-t', spec.title, '--plain'])`. The comment at line 303 asserts that `task edit -t` "updates frontmatter WITHOUT renaming the file — the slug is fixed at create time." This is a load-bearing claim about the binary's semantics. Many task-manager CLIs that expose `-t`/`--title` regenerate the file slug from the new title and rename the file. If the backlog binary does this, `task edit -t <very-long-title>` would trigger the same ENAMETOOLONG the strategy was designed to prevent — now on the edit step rather than the create step.

The `backlog-capture-hardening.test.ts` test at line 36 checks `Buffer.byteLength(files[0]!, 'utf8') <= 255` after the create+restore cycle, which would catch this regression end-to-end. But because the test targets the on-disk filename after the complete two-step, it will only detect the bug if both steps succeed and the filename is then inspected. A rename-on-edit failure would surface as a `BacklogError` rather than a filename violation. The correct verification is to confirm, via the binary's docs or source, that `task edit -t` is a frontmatter-only operation.

---

### AUDIT-20260619-98 — `--reason` is required for `backlog done` but never persisted to the task file

Finding-ID: AUDIT-20260619-98
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/backlog.ts:162–165` (`emitDone`); `src/backlog/backend.ts:363–366` (`close()`)

`emitDone` enforces a non-empty `--reason` (exit 2 on missing or whitespace-only value), prints it in the confirmation line (`backlog done: closed ${id} (reason: ${reason})`), and routes to `backend.close()`. `backend.close()` calls `task edit -s Done --plain` — the reason string is not appended to notes, tags, or any persistent field. The reason appears only in the session's stdout.

For a governance tool where audit trail matters, requiring an operator to articulate a reason but discarding it creates a false sense of accountability: the operator is gated on providing an explanation, but the task file carries no record of why it was closed. Future reads of the item see `status: Done` with no closure rationale. If the requirement is intentional (friction gate, not archival), the inline comment or the contract description should say so explicitly to prevent a future agent from "fixing" this by adding notes persistence and introducing an unintended side-effect.

---

### AUDIT-20260619-99 — `stripPromotedToLines` may leave consecutive internal blank lines in notes

Finding-ID: AUDIT-20260619-99
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/backlog/promote.ts:96–102` (`stripPromotedToLines`)

```typescript
function stripPromotedToLines(notes: string): string {
  return notes
    .split('\n')
    .filter((line) => !line.includes(PROMOTED_TO_TOKEN))
    .join('\n')
    .trim();
}
```

When a notes block contains multiple `Promoted-to:` lines with blank separator lines between them — or when the `Promoted-to:` line sits between two paragraphs — removing the token lines leaves adjacent blank lines (`\n\n\n`) in the middle of the result. `trim()` removes only leading and trailing whitespace, not internal runs. The stripped notes are then written back via `setNotes`, so the task file may accumulate blank lines with each promote/unpromote cycle. This is cosmetic but compounds across multiple promotion operations on the same item and could confuse downstream parsers that treat blank lines as section delimiters.

The fix is to collapse runs of blank lines after filtering: `.replace(/\n{3,}/g, '\n\n')` before `trim()`.

---

### AUDIT-20260619-100 — `--help` smoke tests accept any string containing the generic usage prefix

Finding-ID: AUDIT-20260619-100 (claude-sonnet-06 + codex-01; cross-model)
Status:     open
Severity:   low
Per-lane:   claude=low, codex=medium
Decision:   agreement (gate-counted low)
Surface:    `src/__tests__/roadmap/edge-subactions-cli.test.ts:117–124` (the `--help` loop)

```typescript
for (const sub of ['add-edge', 'remove-edge', 'move-edge', 'rename', 'remove-node', 'approve-design']) {
  const r = runCli(['roadmap', sub, '--help']);
  expect(r.status, `${sub} --help exit`).toBe(0);
  expect(r.stdout, `${sub} --help body`).toContain('Usage: stackctl roadmap');
  expect(r.stdout.length, `${sub} --help non-empty`).toBeGreaterThan(0);
}
```

The help assertion `toContain('Usage: stackctl roadmap')` is satisfied by ANY help output — including one that is wired to the wrong subcommand (e.g., `add-edge --help` routing to `rename`'s grammar) or to the generic `roadmap` parent help. The test neither checks that the subaction name appears in the usage line nor that the subaction-specific flags (e.g., `--field`, `--from`, `--to`, `--analyze-clean`) appear in the body. A routing bug that silently falls back to parent help would pass all three assertions. Adding `expect(r.stdout).toContain(sub)` to the loop would make the test actually verify per-subaction routing.

---

### AUDIT-20260619-101 — `assertNoDanglingTerminalEdge` loads the document a second time before `runCurate`

Finding-ID: AUDIT-20260619-101
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    `src/subcommands/curate.ts:78–81` (`runCurateCli` body)

`assertNoDanglingTerminalEdge(doc)` calls `loadDocument(docPath, opts)` to inspect grammar and units. `runCurate(doc, { apply, ...grammarDirs() })` loads the same document a second time internally. For ~50-node roadmaps the overhead is negligible. The issue worth noting is semantic: the precheck reads one snapshot of the document, then `runCurate` reads another. On a single-user tool this is safe, but if two concurrent `curate` invocations run simultaneously the edge check and the actual archival could see different states. Passing the loaded document (or its computed unit/edge snapshot) from the precheck into `runCurate` would eliminate the double load and close the TOCTOU window.

### AUDIT-20260619-102 — Archive success is verified only by live removal, not preservation

Finding-ID: AUDIT-20260619-102
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/backlog/backend.ts:377-389

`archive()` claims the preserve-not-delete contract, but after `task archive` it only verifies that `taskFilePath(id)` no longer exists in the live store. If the backend deletes the file, moves it to an unexpected location, or otherwise fails the “still readable” part of FR-011 while removing it from live tasks, this method reports success.

Blast radius is medium: with the current backend behavior this likely passes, but the feature’s stated safety property is preservation, and this adapter is the boundary that should enforce it. A reasonable fix is to resolve and verify the archived task under `backlog/archive/tasks/` after the command, ideally by parsing the archived file and confirming the same `id` is readable before returning success.

## 2026-06-19 — audit-barrage lift (20260619T205002775Z-028-front-door-completeness-phase-4)

### AUDIT-20260619-103 — `normalize` used in `reconcile.ts` without a visible import

Finding-ID: AUDIT-20260619-103
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/roadmap/reconcile.ts:153–189 (new `nodeIdForOrphan` + `reconcileUnorphan` additions)

Both `nodeIdForOrphan` and `reconcileUnorphan` call `normalize(...)` as a bare function — `normalize(specRel)`, `normalize(spec)`, `report.orphans.map(normalize)`. The file's import from `node:path` was changed by this diff from `import { join }` to `import { basename, join }`. `normalize` is **not in that import line**, and `normalize` is not a Node.js global. If no local `normalize` helper exists in the non-diffed portion of `reconcile.ts` (lines 13–124), every call to `reconcileUnorphan` or `nodeIdForOrphan` will throw `ReferenceError: normalize is not defined` at runtime.

The diff is ambiguous: TypeScript compilation would have caught a truly undefined name, so a local `normalize` helper defined in the unchanged file body (lines 13–124) is possible — the diff does not show that region. But the import line was edited in this very commit, and `basename` was explicitly added; if the author meant to add `normalize` from `node:path` as well, the omission is a bug. The `reconcile-unorphan.test.ts` tests exercise this code path; if those tests pass with the new code, `normalize` exists somewhere. The finding warrants an explicit check: read the full `src/roadmap/reconcile.ts` file and confirm `normalize` is either (a) imported from `node:path` or (b) defined as a local helper before line 126. If neither, the `--unorphan` verb silently dies at runtime.

---

### AUDIT-20260619-104 — `setNotes: ''` edge case — binary behavior with empty notes unspecified

Finding-ID: AUDIT-20260619-104
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/backlog/promote.ts:116–118 + src/backlog/backend.ts:352–361

When an item's notes section contains **only** a `Promoted-to:` line and nothing else, `stripPromotedToLines(notes)` returns `''` after `trim()`. The spread in `unpromote` then passes `{ setNotes: '' }` to `backend.edit`, which generates `['task', 'edit', id, '--notes', '', '--plain']`. The downstream behavior of `--notes ''` with the backlog binary is not documented in the diff and is not tested.

Two failure modes exist: (a) the binary interprets `--notes ''` as "clear the notes section entirely" — correct behavior; or (b) the binary interprets it as "no change" (empty string = no-op) — leaving the now-stripped `Promoted-to:` line behind; or (c) the binary rejects an empty `--notes` value and exits non-zero — turning a valid unpromote into an error. The test suite covers the inverse case (label-only promoted item where `hasLine` is false, so `setNotes` is never set), but there is no test for an item whose notes consist **solely** of a `Promoted-to:` line. A targeted test — create an item with the `promoted` label and exactly one notes line (`**Promoted-to:** spec:specs/012-x`), run unpromote, assert that `readNotes` returns `''` and the label is gone — would confirm or deny the binary's behavior here.

---

### AUDIT-20260619-105 — `reconcile --unorphan --type` CLI flag not exercised by any test

Finding-ID: AUDIT-20260619-105
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/roadmap.ts:96 (`reconcile: { valueFlags: ['unorphan', 'type'], ... }`) + src/roadmap/reconcile.ts:153 (`nodeIdForOrphan` `typePrefix` parameter)

`SUBACTION_SPECS.reconcile` advertises `valueFlags: ['unorphan', 'type']`, meaning `stackctl roadmap reconcile --unorphan <spec> --type <phase>:<kind>` is a documented call shape. `nodeIdForOrphan` and `reconcileUnorphan` both accept a `typePrefix` parameter that defaults to `'impl:feature'` when omitted. However, the dispatch handler (`emitReconcile` in `src/subcommands/roadmap-reconcile-emit.ts` — not in this diff) must read `flags.values.get('type')` and forward it to `reconcileUnorphan`. If that forwarding was omitted, `--type` is silently ignored: every spec reconciled via the CLI defaults to `impl:feature/<slug>` regardless of what the operator passes.

No test in the diff exercises `roadmap reconcile --unorphan <spec> --type design:gap` (or any non-default type prefix). The only CLI-level `--unorphan` test in `edge-subactions-cli.test.ts` passes no `--type` flag. The `reconcile-unorphan.test.ts` tests call the library function directly with an explicit `typePrefix`, so they do not cover the CLI routing gap. A CLI-level test that passes `--type multi:feature` and asserts the created node identifier starts with `multi:feature/` would close this gap.

---

### AUDIT-20260619-106 — `emitDone` reports "would close" on an already-Done item (dry-run)

Finding-ID: AUDIT-20260619-106
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/backlog.ts:148–174 (`emitDone`)

`emitDone` verifies the item exists via `backend.list().find(...)` but does not check whether the item's status is already `BACKLOG_DONE_STATUS`. On a dry-run invocation against an already-closed item, the function prints `"backlog done: dry-run — would close <id> (reason: ...)"` — a misleading message since there is nothing to close. On an `--apply` invocation against an already-closed item, `backend.close` is called (which internally runs `task edit -s Done`); the binary's behavior (idempotent success vs. error) is not documented and not tested. If the binary returns non-zero for a redundant close, the handler exits with code 1 — treating a no-op as a runtime error. A test covering `backlog done <already-done-id> --apply` would resolve the ambiguity and prevent a confusing operator-facing error message.

---

### AUDIT-20260619-107 — `roadmap-edge-emit.ts` and `roadmap-reconcile-emit.ts` are out of diff scope — audit coverage gap

Finding-ID: AUDIT-20260619-107 (claude-sonnet-4-6-05 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=informational, codex=medium
Decision:   adjudicated (gate-counted medium) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — medium retained.
Surface:    src/subcommands/roadmap-edge-emit.ts + src/subcommands/roadmap-reconcile-emit.ts (referenced but not in diff)

`src/subcommands/roadmap.ts` imports `emitAddEdge`, `emitApproveDesign`, `emitMoveEdge`, `emitRemoveEdge`, `emitRemoveNode`, `emitRename` from `./roadmap-edge-emit.js` and `emitReconcile` from `./roadmap-reconcile-emit.js`. All six new edge-mutation verbs and the extended reconcile verb dispatch through these files, but neither file appears in the committed diff. The test suite exercises these handlers via `runCli` integration tests (T071 in `edge-subactions-cli.test.ts`) which provides meaningful behavioral coverage. However, the implementation details — flag extraction, error mapping, exit-code assignment, the `--type` forwarding gap noted in finding -03 — cannot be audited from this diff. Any correctness defect in those files (wrong exit code on an unknown node, flags silently dropped, wrong `DocumentModelError`→exit-2 mapping) would not surface here. The operator should confirm these files were reviewed in a prior session or request a separate diff that includes them.

### AUDIT-20260619-108 — `backlog done --reason` discards the required reason

Finding-ID: AUDIT-20260619-108
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/backlog.ts:151-179; src/backlog/backend.ts:362-367

`emitDone` requires a non-empty `--reason`, but on `--apply` it only passes the id to `backend.close(id)` and prints the reason to stdout. The backend closure implementation only sets status to `Done`; it does not persist the reason into notes, comments, metadata, or any durable audit surface. A required operator-supplied reason that exists only in transient CLI output is effectively lost as soon as the process exits.

The blast radius is medium: closure still works, so the lifecycle verb is not broken, but a downstream operator or unattended agent acting on the interface will reasonably assume the required reason is part of the governed record. A reasonable fix is to make the closure mechanism accept and persist the reason, for example by appending a closure note before/with `backend.close`, and update the shared `roadmap close-related` path deliberately if it should use the same mechanism.

## 2026-06-19 — audit-barrage lift (20260619T205621544Z-028-front-door-completeness-phase-4)

### AUDIT-20260619-109 — Archive success is not verifying preservation

Finding-ID: AUDIT-20260619-109
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/backlog/backend.ts:377-389

`archive()` implements the preserve-not-delete contract, but after running `task archive` it only verifies that `taskFilePath(id)` no longer exists in the live store. That proves removal from `backlog/tasks`, not preservation under `backlog/archive/tasks`. If the backend deletes the file, moves it somewhere unexpected, or changes archive layout, this method reports `backlog archive: archived ... (preserved)` even though the item is no longer readable.

The blast radius is high because FR-011 is explicitly about preserving content databases, and an operator acting on the success message can lose the only live pointer to the item. A reasonable fix is to verify the archived item exists and parses after the command, for example by locating a matching `TASK-*` file under `backlog/archive/tasks/` and checking its frontmatter id before reporting success.

### AUDIT-20260619-110 — Unpromote can clobber concurrent note edits

Finding-ID: AUDIT-20260619-110
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/backlog/promote.ts:124-140, src/backlog/backend.ts:352-358

`unpromote()` reads the whole notes block, strips `Promoted-to:` lines from that snapshot, then calls `backend.edit(... { setNotes })`, which maps to `task edit --notes <full replacement>`. This is a read-modify-write path over the entire notes section. If another process appends notes after `readNotes()` and before `edit()`, the stale `setNotes` replacement drops that intervening content.

The blast radius is medium: it requires concurrent or near-concurrent edits, but the code comments and feature scope emphasize field-preserving mutations and avoiding clobbering operator notes. A safer fix would make the removal operation conditional on the current file contents, or use a backend primitive that removes only the promotion linkage line without replacing the whole notes section.

## 2026-06-19 — audit-barrage lift (20260619T212507043Z-028-front-door-completeness-phase-3)

### AUDIT-20260619-111 — `mediate-list` / `mediate-recover` implementation surfaces are absent from the diff

Finding-ID: AUDIT-20260619-111
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    (the entire diff — missing surfaces)

The commit title is "US3 — mediation recovery, never wedged or wrongly refused (T079-T098)," implying implementation of two new commands (`mediate-list`, `mediate-recover`) and the behavioral guarantee that backs them. The diff contains exactly one file: a test that adds two expectations to a `subActions` registration assertion. No implementation code is present — no command handler, no CLI verb registration, no capability-model update, no SKILL.md or help-text update for the new sub-actions.

For the test at line 52–53 (`src/__tests__/cli-help/help-capability.test.ts`) to pass, the subactions must be registered somewhere. Either (a) the implementation exists in prior commits and was simply not included in the audit diff, or (b) the implementation is genuinely absent and the test is dead (would fail). If (a), the behavioral surfaces for `mediate-list` and `mediate-recover` are not auditable from this diff — the governance pass cannot verify correctness, error handling, or the wedged-state recovery cycle from these artifacts. If (b), this is a blocking defect: the test asserts things the implementation doesn't back.

A complete audit of the "never wedged or wrongly refused" guarantee requires the command handler code, the state it reads, the mutations it makes, and how it handles partial failure.

---

### AUDIT-20260619-112 — Registration test does not verify the "never wedged or wrongly refused" guarantee

Finding-ID: AUDIT-20260619-112
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/__tests__/cli-help/help-capability.test.ts:50–55`

The added test lines confirm that `mediate-list` and `mediate-recover` appear in `frontDoor.subActions` with the correct `mediationClass` values. This is a structural registration test — it verifies the help system knows about these entries, not that they work. The commit's stated guarantee is behavioral: a user or agent that is wedged (a prior mediation check blocked an action) must always be able to escape, and legitimate operations must never be wrongly refused.

Satisfying that guarantee requires tests that cover: (1) an initial `mediate-check` that refuses an action produces a detectable wedged state; (2) `mediate-list` surfaces the condition that caused the refusal; (3) `mediate-recover` clears it; (4) a subsequent `mediate-check` on the same action now passes. None of those behavioral steps are in the diff. The T079-T098 task range implies substantial test coverage was planned — if behavioral tests exist in other files, they are not in the auditable diff.

Blast-radius: a registration test that passes while the behavioral guarantee is absent lets the feature graduate looking green while the core promise is unverified.

---

### AUDIT-20260619-113 — `mediate-check` is not in `subActions` but `mediate-list` and `mediate-recover` are — asymmetry unexplained

Finding-ID: AUDIT-20260619-113
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/__tests__/cli-help/help-capability.test.ts:50–55` and line 57

The test asserts that `subActions` contains `mediate-list` and `mediate-recover` but checks `mediate-check` via `byVerb.get('mediate-check')` separately. All three are `mediate-*` siblings, yet they are classified differently: two are sub-actions, one is a verb-only entry. The diff provides no comment or documentation explaining the distinction — is `mediate-check` invoked automatically (not user-initiated) and thus excluded from the user-facing sub-action list? Is there a design rule that `read-only` check commands don't appear as named sub-actions?

If the asymmetry is intentional, a comment on the test or the capability model would prevent a future maintainer from "fixing" the test by adding `mediate-check` to the subActions array and accidentally changing the observable help surface. Currently the test enforces the exact-match invariant but doesn't explain the design decision, making it a potential source of confusion in downstream review.

---

### AUDIT-20260619-114 — Describe block labeled `028 US1` contains US3 assertions

Finding-ID: AUDIT-20260619-114
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/__tests__/cli-help/help-capability.test.ts:50` (describe block label implied by context)

The describe block is named `'capability family --help (028 US1)'` (visible from the context header in the diff). The added expectations for `mediate-list` and `mediate-recover` belong to US3. Mixing story-level assertions under a US1 describe block makes it harder to bisect failures by user story, and makes the test file's traceability to the spec ambiguous. If a future change breaks `mediate-recover` registration, the failing test block reports a US1 failure, not a US3 one.

This is hygiene, not a correctness defect, but in a codebase that relies on test output to confirm per-phase graduation (the `after_implement` governance hook reads test results), mislabeled test blocks can produce misleading signals.

### AUDIT-20260619-115 — Recovery alias is omitted from the audited help contract

Finding-ID: AUDIT-20260619-115
Status:     open
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/cli-help/help-capability.test.ts:50-55

The added `front-door` sub-action expectation covers `mediate-list` and `mediate-recover`, but it does not cover the documented recovery alias `reset`. In the current command surface, `front-door reset` is accepted as a true alias of `mediate-recover`, so the CLI help/descriptor contract should either expose that alias or have an explicit test proving aliases are intentionally excluded from descriptor output. As written, this test locks in an incomplete public help contract: downstream consumers generating docs or invoking `front-door reset --help` from the descriptor would not see a recovery path that the CLI accepts.

Blast radius is low because the primary recovery command remains present and operators can still recover via `mediate-recover`; the defect is discoverability and descriptor drift rather than failed recovery behavior. A reasonable fix is to add `reset:mutating` to the descriptor expectation and command surface, or add a focused assertion/comment that aliases are deliberately hidden from descriptor artifacts while remaining accepted by the raw subcommand parser.

## 2026-06-19 — audit-barrage lift (20260619T212704880Z-028-front-door-completeness-phase-5)

### AUDIT-20260619-116 — FR-050 read-only exemption wired only at the unit level — dead code in all production call paths

Finding-ID: AUDIT-20260619-116 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/capability/mediate.ts:24-56 / src/capability/intercept.ts:84-123 / src/subcommands/mediate-check.ts:72-99 / src/__tests__/capability/read-only-exemption.test.ts

The diff introduces `OpMediationClass` and a `mediationClass` parameter (defaulting to `'mutating'`) on `decideMediation`. The read-only exemption logic fires correctly when `'read-only'` is passed and is exercised by `read-only-exemption.test.ts` (T081). However, neither production caller of `decideMediation` supplies the parameter:

- `interceptDecision` (`intercept.ts:123`): `return decideMediation(registry, surface, identity, deps.resolveActive(cwd, session));` — no `mediationClass`.
- `mediateCheck` (`mediate-check.ts:98`): `const decision = decideMediation(CAPABILITY_REGISTRY, surfaceTyped, identity, active);` — no `mediationClass`.

There is also no mechanism in either caller to determine a per-identity mediation class (no registry lookup, no CLI flag, no payload field). The result is that `backlog list` — a read-only query FR-050 declares mediation-exempt — is refused whenever no marker is set, exactly like a mutating call. The test coverage is real but does not represent production behaviour: T081 passes because it calls `decideMediation` directly; the hook and the `mediate-check` verb ignore the parameter entirely. FR-050 is spec'd and tested in isolation, but does not hold end-to-end. Fix: either wire a mediation-class lookup from the capability registry into both callers, or add a `--class` argument to `mediate-check` and an equivalent field to the `InterceptDeps` resolver so callers can pass the correct class.

---

### AUDIT-20260619-117 — `interceptDecision` `resolveInstalled` defaults to `true` — FR-020 no-installation short-circuit will not fire for the hook path unless the production caller is updated

Finding-ID: AUDIT-20260619-117
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/intercept.ts:90-99 / src/subcommands/mediate-check.ts (updated) vs. the `stackctl intercept` CLI command (not in this diff)

`InterceptDeps.resolveInstalled` is optional with `?? true` as the back-compat default (`intercept.ts` line 31, `interceptDecision` line 91: `const installed = deps.resolveInstalled?.(cwd) ?? true;`). The docstring acknowledges this: "the production adapter supplies the real probe." By contrast, `mediate-check` IS updated — `defaultResolveInstalled` is defined and wired into `runMediateCheck` (`mediate-check.ts:107-117`). The `stackctl intercept` subcommand (the TypeScript file that parses the PreToolUse JSON payload and calls `interceptDecision`) is not in this diff. If that caller is not similarly updated to supply `resolveInstalled: defaultResolveInstalled`, the hook will assume `installed = true` for every cwd — including cwd values outside any stack-control installation. In that case, a fronted backend call (e.g. `backlog list`) issued outside an installation will be refused instead of permitted (empty active set → refuse), contradicting FR-020 and breaking the contract that the hook and `mediate-check` agree. The `cwd-linchpin-reconcile.test.ts` tests exercise `mediateCheck` (not `interceptDecision`), so this gap is uncovered by the test suite in this diff. The "no-installation short-circuit" test (T079) targets `mediate-check`, not the hook. Fix: confirm the production `stackctl intercept` command provides `resolveInstalled: findInstallation(at) !== null` alongside `resolveActive`, or add a missing-dep test for `interceptDecision` that asserts the FR-020 permit with `resolveInstalled: () => false`.

---

### AUDIT-20260619-118 — `mediate-recover` discards `deps.clear()` return value; always emits "cleared marker" even on no-op

Finding-ID: AUDIT-20260619-118
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/front-door.ts:114-119

```typescript
deps.clear(root, session);
return { code: 0, stdout: `front-door mediate-recover: cleared marker for session ${session}\n`, stderr: '' };
```

`clearMarker` (and its `FrontDoorDeps.clear` seam) returns `boolean`: `true` if a file was removed, `false` if there was nothing to clear. The return value is not captured. The success message unconditionally says "cleared marker for session X" even when `clear` returns `false` (no marker existed). An operator running `mediate-recover` on a session that was already clean receives a misleading confirmation. For a recovery tool whose audience is an agent in a wedged state, message fidelity matters: "cleared marker" vs "no marker to clear" is the difference between "the recovery worked" and "the session was already clean before you ran this". The test suite covers the case where a marker IS cleared (`front-door-recovery.test.ts:97-111`) and the no-installation case (exit 0 + specific message), but there is no test for "installation exists, no marker for session" — the exact case where the misleading message fires. Fix: capture the return value and branch on it: `const removed = deps.clear(root, session); return { code: 0, stdout: removed ? 'cleared marker …' : 'no marker for session …', … }`.

---

### AUDIT-20260619-119 — `runSpeckitGuard` exposes unhandled-exception path when `CLAUDE_CODE_SESSION_ID` is a path-traversal string

Finding-ID: AUDIT-20260619-119
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/speckit-guard.ts:94-107

```typescript
const session = process.env.CLAUDE_CODE_SESSION_ID ?? '';
const viaFrontDoor = session.length > 0 && resolveViaFrontDoorFile(skill, session, process.cwd());
```

The `session.length > 0` guard prevents an empty-string session from reaching `resolveViaFrontDoorFile`, but it does not filter path-traversal values such as `'../evil'`. `resolveViaFrontDoorFile` calls `activeCapabilities(installation.root, session)` → `readMarker` → `markerPath` → `assertSafeSession(session)`, which throws a sync error with `/filename-safe/`. Since `runSpeckitGuard` is `async` and has no `try/catch`, the thrown error becomes a rejected promise, producing an unhandled rejection rather than a clean `process.exit(2)`. Node.js behaviour on unhandled rejection depends on version and flags (exit 1 or crash with stack trace), neither of which is the documented `2 = usage error` exit code. This path is in security-relevant code: a compromised environment variable could cause non-deterministic guard behaviour. Fix: add `isSafeSession(session)` (already imported into `marker.ts`) as a guard before calling `resolveViaFrontDoorFile`, returning a refusal (exit 1) or usage-error (exit 2) for an unsafe session id; or wrap the call in `try/catch` and treat any thrown error as "not via front door".

---

### AUDIT-20260619-120 — `listMarker` TOCTOU: ENOENT from concurrent delete misclassified as `corrupt`

Finding-ID: AUDIT-20260619-120
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/marker.ts:248-261

```typescript
if (!existsSync(path)) return { corrupt: false, entries: [] };
let parsed: unknown;
try {
  parsed = JSON.parse(readFileSync(path, 'utf8'));
} catch {
  return { corrupt: true, entries: [] };
}
```

`listMarker` reads without holding the marker lock. If a concurrent `clearMarker` (which does hold the lock) deletes the file between the `existsSync` check and the `readFileSync` call, `readFileSync` throws `ENOENT`. The bare `catch` collapses all exceptions — including `ENOENT` — into `{ corrupt: true, entries: [] }`. An operator running `mediate-list` concurrently with a `mediate-recover` (or a naturally-expiring session cleanup) would see the recovery tool report "corrupt (unparseable)" and then a subsequent `mediate-list` would show "(no marker)", which is confusing for a diagnostic surface. The fix is minimal: inspect the caught error for `code === 'ENOENT'` and return `{ corrupt: false, entries: [] }` in that branch rather than `corrupt: true`. This corrects the classification without changing any other behaviour.

---

### AUDIT-20260619-121 — `failOpenSignal` exported and tested but not called by any current production code path; shell script handles the same concern independently

Finding-ID: AUDIT-20260619-121
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/intercept.ts:104-115 / bin/intercept:28-31

`failOpenSignal(reason: string): string` is exported from `intercept.ts` and verified by `intercept-fail-open-signal.test.ts` (T091). The shell `bin/intercept` handles the analogous concern (stackctl not found/executable → write hardcoded notice to stderr) independently, with slightly different wording ("SKIPPED" vs "was SKIPPED", "stackctl dispatcher not found/executable" vs "could not reach stackctl: …"). `failOpenSignal` is not called anywhere in the diff — neither from the shell script (which cannot call TypeScript directly) nor from any other TypeScript file visible here. If the current `bin/intercept` shell is the only production adapter, `failOpenSignal` is dead exported code: it has tests and a docstring that describe a TypeScript-layer spawn-failure scenario, but no caller. If a future TypeScript interceptor replaces the shell, the function is available; until then, any downstream reader of `failOpenSignal` may not realise it is not on the active code path. Fix: either document explicitly that `failOpenSignal` is reserved for a future TypeScript hook adapter, or add a `// used by: <future adapter>` note, or suppress the export until the caller exists. Not blocking, but the two independent notice texts (`failOpenSignal` vs the shell's `printf`) will diverge over time if one is maintained and the other is not.

## 2026-06-19 — audit-barrage lift (20260619T215433722Z-028-front-door-completeness-phase-3)

### AUDIT-20260619-122 — Path-qualified backend invocations lose the read-only exemption

Finding-ID: AUDIT-20260619-122
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:434-447

`argv0OfTokens()` normalizes a path-qualified backend with `basename(tok)`, so `/usr/local/bin/backlog list` is correctly recognized as the fronted `backlog` backend. The new `subActionOfTokens()` then tries to locate that normalized `argv0` with `tokens.indexOf(argv0)`, but the token array still contains `/usr/local/bin/backlog`, not `backlog`, so it returns `null` at lines 436-441. `mediationClassForIdentity()` treats that as mutating, so a declared read-only operation like `backlog list` is refused when invoked via an absolute or relative path.

The blast radius is bounded to path-qualified backend calls, but it violates the feature’s stated end-to-end read-only exemption for a normal shell invocation form. A reasonable fix is to preserve the resolved token index from argv0 resolution, or make sub-action lookup compare `basename(token)` against the normalized backend while still respecting wrapper parsing.

## 2026-06-19 — audit-barrage lift (20260619T215709246Z-028-front-door-completeness-phase-5)

### AUDIT-20260619-123 — `resolveInstalled` not wired in the production `stackctl intercept` CLI entry point

Finding-ID: AUDIT-20260619-123
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/intercept.ts:85-96 and the (absent) production `runIntercept` CLI wrapper

`interceptDecision` adds `resolveInstalled?: (cwd: string) => boolean` as an optional dep defaulting to `true` — meaning "always assume an installation exists." The no-installation short-circuit (FR-020) only fires when `deps.resolveInstalled?.(cwd) ?? true` evaluates to `false`. The production `runMediateCheck` IS updated in this diff to supply `resolveInstalled: defaultResolveInstalled` (visible in `mediate-check.ts`). But the production entry point for `stackctl intercept` — the TypeScript function that receives the PreToolUse payload from `bin/intercept` and calls `interceptDecision` — is NOT in this diff.

If that entry point was not updated to supply `resolveInstalled: (cwd) => findInstallation(cwd) !== null`, every call to `interceptDecision` in production runs with `installed = true` and skips the no-installation guard entirely. A user or agent running `backlog create` (or any mutating backend op) in a directory that has the plugin installed but no enclosing stack-control installation reaches `decideMediation` with an empty active set → refuse → the agent is told to use `/stack-control:backlog`, which is a dead end because no installation exists. The spec requires (SC-004 / FR-020) that a refusal implies an installation is present, so the setup redirect is always satisfiable. The default `?? true` breaks that guarantee on the live hook path.

The `mediate-check` and `interceptDecision` paths are supposed to be symmetric (the cwd-linchpin tests verify `mediateCheck` for this case; `T079` in `mediate-check-no-installation-permit.test.ts` covers the `mediate-check` production path). But no test in this diff exercises `interceptDecision` through a production `runIntercept` wrapper — all intercept tests call `interceptDecision` directly with custom deps. A missing `resolveInstalled` in the production wrapper would not be caught by CI.

---

### AUDIT-20260619-124 — `interceptDecision` has no no-installation test coverage — only `mediateCheck` does

Finding-ID: AUDIT-20260619-124 (claude-02 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/__tests__/capability (all intercept tests), src/__tests__/subcommands/mediate-check-no-installation-permit.test.ts

The no-installation short-circuit (FR-020 / T1) is implemented symmetrically in both `interceptDecision` (`intercept.ts:88-96`) and `mediateCheck` (`mediate-check.ts:82-93`). The test `028 T079` in `mediate-check-no-installation-permit.test.ts` covers the `mediate-check` path end-to-end, including both the short-circuit itself and the "does NOT resolve the marker when there is no installation" invariant. However, none of the intercept-specific tests (`intercept-cold-start-zero-io.test.ts`, `intercept-fail-open-signal.test.ts`, `cwd-linchpin-reconcile.test.ts`) supply `resolveInstalled: () => false` to `interceptDecision`. All intercept tests run with the default (`installed = true`).

The `cwd-linchpin-reconcile.test.ts` test "a cwd that LEFT the installation permits via the no-installation short-circuit" (line 47) uses `mediateCheck` with `liveDeps()`, not `interceptDecision`. The two functions share the same logical path but are separate implementations. If the intercept path's no-installation branch has a subtle difference (e.g., the `!installed` guard fires after `resolveActive` is already called instead of before), CI would not catch it. Given that finding 01 above flags a likely wiring gap on the production interceptor path, the absence of direct interceptor-path coverage for the no-installation case means the gap would also go undetected in tests.

A straightforward fix: add one test in the intercept suite that passes `resolveInstalled: () => false` to `interceptDecision` for a mutating backend identity and asserts `verdict === 'permit'`.

---

### AUDIT-20260619-125 — Hardcoded `ILLUSTRATIONS` in T097 test won't catch future capability-interface skills

Finding-ID: AUDIT-20260619-125
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/capability/skill-marker-example-authorizes.test.ts:35-40

The test `028 T097` is stated as verifying that "each capability-interface skill documents a `front-door enter --capability <id>` block" and that the documented marker authorizes the illustrated backend call. The preamble comment says "reads the documented `--capability` from each skill's marker block." In practice the test covers only four hardcoded entries:

```typescript
const ILLUSTRATIONS: readonly SkillIllustration[] = [
  { skill: 'backlog', surface: 'bash', backend: 'backlog list' },
  { skill: 'define', surface: 'skill', backend: 'speckit-specify' },
  { skill: 'extend', surface: 'skill', backend: 'speckit-specify' },
  { skill: 'execute', surface: 'skill', backend: 'speckit-implement' },
];
```

If a new capability-interface skill is added (e.g., `roadmap`, `inbox`, `design`) with a SKILL.md marker example that names a wrong `--capability` id or illustrates a backend call that is not authorized by that capability, this test will not catch it. The test's documented contract ("each capability-interface skill") is stronger than its implementation (four static entries). The `documentedCapability` regex (`/front-door enter --capability (\S+)/`) is also sensitive to exact SKILL.md formatting — a multi-line block or extra whitespace would silently produce a null match and throw rather than fail the assertion, which is correct but fragile.

A more robust approach: glob `skills/*/SKILL.md`, filter to files that contain a `front-door enter --capability` block, and derive the illustrations dynamically so new skills are automatically enrolled. This doesn't require changing the test contract, just the discovery mechanism.

---

### AUDIT-20260619-126 — `clearMarker` returns `true` when `rmSync({ force: true })` silently absorbs an ENOENT outside the lock

Finding-ID: AUDIT-20260619-126
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/marker.ts:280-287 (the `clearMarker` implementation)

```typescript
export function clearMarker(installRoot: string, session: string): boolean {
  const path = markerPath(installRoot, session);
  return withMarkerLock(installRoot, session, () => {
    if (!existsSync(path)) return false;
    rmSync(path, { force: true });
    return true;
  });
}
```

`withMarkerLock` serializes concurrent marker operations (enter, exit, clear) for the same session. Within the lock, another marker operation cannot delete the file. However, if a non-lock-mediated deletion occurs between `existsSync` returning `true` and `rmSync` executing — for example, a manual `rm` by the operator, an OS tmp-cleaner, or a test harness teardown — `rmSync({ force: true })` silently absorbs the ENOENT and returns without error, but the function returns `true` claiming it removed a file that was already gone.

The practical consequence is that the caller (`front-door.ts`, line ~113) prints `"cleared marker for session ${session}"` when it should print `"no marker to clear"`. The state outcome is correct (marker is gone either way), but the confirmation message is misleading. The test in `front-door-recovery.test.ts` at line 116 ("reports 'no marker to clear' when an installation exists but the session has no marker") only tests the case where `existsSync` returns `false` from the start, not the race. In operator-facing recovery flows the honesty of the confirmation message matters — an agent or operator relying on "cleared marker" as evidence of a successful recovery is misled if it fires for a pre-existing deletion.

---

### AUDIT-20260619-127 — `mediate-list` output exposes marker tokens in plaintext

Finding-ID: AUDIT-20260619-127
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/front-door.ts:48-54 (`renderListing`)

```typescript
function renderListing(listing: MarkerListing): string {
  ...
  return listing.entries
    .map((e) => `${e.capability}  token=${e.token}  writtenAt=${e.writtenAt}  ${e.fresh ? 'fresh' : 'stale'}`)
    .join('\n')
    .concat('\n');
}
```

The `token` field is the opaque authorization token written by `enterFrontDoor` and consumed by `exitFrontDoor --token <tok>` to deauthorize a capability. Exposing it in the `mediate-list` output means any agent or process that can read stdout from `stackctl front-door mediate-list` can harvest the active token and call `front-door exit --token <tok> --session <id>` to prematurely terminate an authorized capability window. Within a normally operating session this is low-risk (the agent is trusted and the capability window is expected to close after the drive). The concern is elevated if `mediate-list` output is captured in a log or if multiple agents share a session context.

`mediate-recover` (the mutating recovery verb) deliberately does NOT require a token — it clears by path alone — so the token does not need to be shown to enable recovery. The listing can omit or truncate the token (e.g., show the first 8 characters with an ellipsis) with no loss of recovery functionality. The only field needed for diagnosis is `capability`, `writtenAt`, and `fresh`.

### AUDIT-20260619-128 — Compound Bash commands can bypass mutation mediation after a read-only backend

Finding-ID: AUDIT-20260619-128
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/mediation-class.ts:52-56; src/capability/mediate.ts:45-52; src/capability/intercept.ts:103-108

`mediationClassForIdentity` returns the class for the first fronted backend command it sees. If the Bash payload is `backlog list && backlog capture --type bug`, lines 52-56 classify the whole intercepted tool call as `read-only` because the first `backlog` command is `list`. `decideMediation` then permits the entire identity on the read-only exemption at lines 45-52, so the later mutating `backlog capture` runs without a marker.

The blast radius is high because compound shell commands are explicitly supported by the identity parser, and this turns the new FR-050 exemption into a practical unmarked mutation bypass. A reasonable fix is to derive mediation over every matched fronted command in the payload: permit as read-only only if every fronted backend invocation in the command line is declared read-only; otherwise classify the invocation as mutating and require the marker.

## 2026-06-19 — audit-barrage lift (20260619T221103127Z-028-front-door-completeness-phase-5)

### AUDIT-20260619-129 — `runIntercept` production wrapper absent — `resolveInstalled` default breaks FR-020 on the hook path

Finding-ID: AUDIT-20260619-129
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/capability/intercept.ts:27-31` (interface change) + missing `src/subcommands/intercept.ts` or equivalent runner

The `InterceptDeps` interface gains an optional `resolveInstalled?: (cwd: string) => boolean` with a default of `?? true` ("assume an installation exists"). The doc-comment on the interface explicitly states: *"the production adapter supplies the real probe so the no-installation short-circuit-to-permit (FR-020) fires symmetrically with `mediate-check`."* That adapter — `runIntercept` or whatever wraps `interceptDecision` for `stackctl intercept` — is **entirely absent from this diff**.

`mediate-check`'s production runner (`runMediateCheck`) was updated in this same diff to explicitly supply `resolveInstalled: defaultResolveInstalled`. No equivalent change appears for the hook's runner. Because the optional field defaults to `true` (present installation), an `interceptDecision` call made without `resolveInstalled` wired will skip the no-installation short-circuit entirely: the verb falls through to `resolveActive`, which returns an empty active set for a non-installation directory, causing `decideMediation` to **refuse** a fronted backend. A `backlog create` issued from a directory that has no enclosing stack-control installation will be denied by the hook even though FR-020 requires it to be permitted. The `stackctl setup` redirect named in the refusal message would be unsatisfiable (no installation → setup makes no sense), creating a dead-end for the operator. The only test that exercises the `interceptDecision` no-installation code-path (`cwd-linchpin-reconcile.test.ts` line 51) calls `mediateCheck`, not `interceptDecision`, so the gap is not caught by the new tests in this diff.

---

### AUDIT-20260619-130 — SKILL.md for `speckit-guard` still describes the retired `STACKCTL_FRONT_DOOR` env-var path

Finding-ID: AUDIT-20260619-130
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    `plugins/stack-control/skills/speckit-guard/SKILL.md` (not in the diff — the file was not updated)

The implementation change in `src/subcommands/speckit-guard.ts` explicitly retires the `FRONT_DOOR_MARKER_ENV` / `STACKCTL_FRONT_DOOR` lookup and replaces it with the 026 session-keyed file marker. The header comment in the source file tracks this correctly. However, the shipping SKILL.md (visible from the skill invocation above) still reads: *"Exit `0` → reached via its front door (the `STACKCTL_FRONT_DOOR` marker is set) or not a wrapped skill — permitted."*

An agent or adopter reading the skill to understand how to establish a permitted context will believe they need to set `STACKCTL_FRONT_DOOR=1` in the environment. They will do so, and the new implementation will ignore it — `resolveViaFrontDoorFile` reads only the file marker, never the env var. The result is a raw speckit skill invocation that is refused despite the operator following the documented path. Because agents act on SKILL.md text as executable specification, this is a high-severity documentation/behavior divergence: the more natural reading (set the env var) is the wrong one, and nothing in the artifact currently corrects it. The fix is to update the skill's description of the permit condition to reflect the file-marker path established by `front-door enter --capability <id> --session <id>`.

---

### AUDIT-20260619-131 — `interceptDecision` no-installation short-circuit has no direct test coverage in this diff

Finding-ID: AUDIT-20260619-131
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/capability/intercept.ts:95-103` (new short-circuit block) + `src/__tests__/capability/` (no new test for `interceptDecision` + no-installation scenario)

The new `if (!installed) { return { verdict: 'permit', ... } }` branch in `interceptDecision` (lines 95–103) has no dedicated test. Every other FR-020 surface in this diff gets its own test file: `mediate-check-no-installation-permit.test.ts` exercises `mediateCheck`, and `speckit-guard-file-marker.test.ts` exercises `evaluateGuard(..., installed=false)`. The `interceptDecision` no-installation path is structurally identical but untested. The `intercept-cold-start-zero-io.test.ts` exercises the identity pre-filter (zero marker reads for non-backend calls) but never supplies `resolveInstalled: () => false`, so the short-circuit branch on line 97 is never exercised by the new tests. If `runIntercept` (finding -01) were later wired correctly and `resolveInstalled` supplied, a regression in the `installed` check would be caught only by the `mediate-check` tests (which test a different entry point), not by a test that exercises `interceptDecision` directly. A single test case analogous to `mediate-check-no-installation-permit.test.ts` line 27 but calling `interceptDecision` with a `resolveInstalled: () => false` dep would close this gap.

---

### AUDIT-20260619-132 — Non-ENOENT I/O errors in `listMarker` silently classified as `corrupt: true`

Finding-ID: AUDIT-20260619-132
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/capability/marker.ts:267-270` (`listMarker` catch block)

The catch in `listMarker` has two branches: ENOENT → `{ corrupt: false, entries: [] }`; anything else → `{ corrupt: true, entries: [] }`. The "anything else" bucket includes both genuine parse failures (the intended case) and non-ENOENT I/O errors such as `EACCES` (permission denied), `EMFILE` (too many open files), or `EIO` (I/O error). An operator running `front-door mediate-list` against a marker they cannot read due to permissions will see `corrupt (unparseable) — run front-door mediate-recover --session <id> to clear it`, which is factually wrong (the file may not be corrupt at all) and suggests a destructive recovery action that would delete a readable-on-the-next-try file. The blast radius is low (operator confusion rather than silent data loss), but the misleading error text is a user-trust issue. A straightforward fix: distinguish the error code in the catch — EACCES/EIO → a new `{ corrupt: false, entries: [], ioError: err.message }` variant, or at minimum include the underlying error code in the `corrupt: true` return so `renderListing` can surface a more accurate description.

---

### AUDIT-20260619-133 — Double `findInstallation(cwd)` call in `runSpeckitGuard`

Finding-ID: AUDIT-20260619-133
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/speckit-guard.ts:111-118` (`runSpeckitGuard` production path)

`findInstallation(cwd)` is called twice in the hot path of `runSpeckitGuard`: once inside `resolveViaFrontDoorFile` (line 63 of the new function) and once for the `installed` flag on line 117 (`const installed = findInstallation(cwd) !== null`). The function presumably walks the directory tree upward on each call. For a skill invocation this happens synchronously per-call, so the double probe doubles the filesystem traversal cost. More subtly, there is a TOCTOU window: if `findInstallation` is not referentially transparent (e.g., the `.stack-control/` marker directory appears or disappears between the two calls), `viaFrontDoor` and `installed` could reflect different installation states. In practice this race is negligible, but the design is cleaner if `resolveViaFrontDoorFile` returns the installation it found alongside the boolean (or if `runSpeckitGuard` does one `findInstallation` call and threads the result into both consumers). No correctness bug under normal conditions; the issue is maintainability and efficiency.

---

### AUDIT-20260619-134 — `ILLUSTRATIONS` list in `skill-marker-example-authorizes.test.ts` must be manually maintained

Finding-ID: AUDIT-20260619-134
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/__tests__/capability/skill-marker-example-authorizes.test.ts:32-37`

The `ILLUSTRATIONS` array is a static list of four `{ skill, surface, backend }` triples. The test's claimed contract is: *"a shipped SKILL.md marker example must AUTHORIZE the backend call it illustrates."* Adding a new capability-interface skill to the registry without adding its entry to `ILLUSTRATIONS` silently drops it from the contract verification; a misconfigured new skill whose marker example doesn't authorize its backend would ship without the test catching it. The `documentedCapability` function extracts the capability by parsing the SKILL.md, so the per-skill logic is general — the only static part is the membership of `ILLUSTRATIONS`. A `TODO: add new capability-interface skills here` comment without a GitHub issue number would be a deferral-comment per project rules; but the real fix is to derive `ILLUSTRATIONS` dynamically from `CAPABILITY_REGISTRY.capabilities` by reading each skill's SKILL.md at test time (if the skill list is discoverable from the registry or a directory glob), removing the need for manual maintenance. This is a test-design issue that compounds with every new skill added.

---

### AUDIT-20260619-135 — `(no marker)` renders identically for "no installation" vs "no marker file" in `mediate-list`

Finding-ID: AUDIT-20260619-135
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/subcommands/front-door.ts:99-101` (`mediate-list` branch) + `renderListing` line returning `'(no marker)\n'`

When `mediate-list` is invoked with no enclosing installation (`root === null`), it returns `{ code: 0, stdout: '(no marker)\n' }` — the same output as a genuine "no marker file for this session in a real installation." An operator diagnosing a wedged session cannot distinguish the two from the command output: they will not know whether they are in the wrong directory (outside any stack-control installation) or correctly inside an installation but with a clean session. This matters because the recovery action differs: for "wrong directory," the operator should `cd` into their project; for "genuinely no marker," there is nothing to recover. The fix is to return a distinct message for the no-installation case, e.g. `"(no installation at <at>)\n"`. This is a UX-clarity issue with no correctness consequence; low severity.

### AUDIT-20260619-136 — Read-only calls still read the strict marker before exemption

Finding-ID: AUDIT-20260619-136
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/mediate-check.ts:96-101; src/capability/intercept.ts:103-108

Both live paths derive the read-only exemption only after resolving active marker state. `mediateCheck` calls `deps.resolveActive(dir, session)` at line 96 before `mediationClassForIdentity` and `decideMediation` at lines 100-101. `interceptDecision` does the same at lines 107-108. In production, `resolveActive` uses `activeCapabilities`, whose strict read throws on malformed marker files.

That means a read-only fronted query such as `backlog list` can still fail closed or crash when the session marker is corrupt, even though FR-050 says read-only query ops are mediation-exempt. The blast radius is high because an adopter can hit this on a normal read-only inspection command while trying to understand or recover marker state; the exemption is present in the pure decision core but not actually protected from marker-read failures on the live paths.

A reasonable fix is to derive `mediationClassForIdentity(surface, identity)` before resolving active marker state, and skip `resolveActive` entirely when the class is `read-only`. Mutating fronted calls should keep the current strict marker read and fail-closed behavior.

## 2026-06-19 — audit-barrage lift (20260619T222105228Z-028-front-door-completeness-phase-5)

### AUDIT-20260619-137 — FR-020 no-installation short-circuit not provably wired in the production `stackctl intercept` handler

Finding-ID: AUDIT-20260619-137
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/intercept.ts:28-35 (`InterceptDeps`), cross-referenced against the absent `stackctl intercept` CLI entry point

`InterceptDeps.resolveInstalled` is newly added in this diff as an **optional** field with a `?? true` default:

```typescript
export interface InterceptDeps {
  readonly resolveActive: (cwd: string, session: string) => ReadonlySet<string>;
  readonly resolveInstalled?: (cwd: string) => boolean;  // ← new, optional
  readonly registry?: CapabilityRegistry;
}
```

The diff adds the FR-020 no-installation short-circuit to `interceptDecision` and gates it on `deps.resolveInstalled?.(cwd) ?? true`. The `?? true` fallback exists for back-compat — callers that don't supply `resolveInstalled` silently opt out of FR-020 and behave as though an installation always exists.

This diff does **not** show the production `stackctl intercept` CLI entry point (the handler that `bin/intercept` invokes via `"$STACKCTL" intercept`) being updated to supply `resolveInstalled`. Because the field is optional, TypeScript will not flag the omission. If the handler was authored before this diff and constructs `InterceptDeps` with only `resolveActive`, `installed` defaults to `true` on every hook invocation, meaning:

- A mutating backend call (e.g., `backlog capture`) from a directory with no stack-control installation would resolve active capabilities as empty (correct — no marker) but **then refuse** rather than short-circuiting to permit.
- This breaks the FR-020 contract ("a refusal implies an installation exists, so the `stackctl setup` redirect is always satisfiable") on the primary enforcement path (the PreToolUse hook).
- Read-only identities (`backlog list`) would still pass via the FR-050 read-only exemption, so the failure only manifests on mutating ops.

The counterpart path (`mediate-check`) is correctly updated: `runMediateCheck` explicitly supplies `defaultResolveInstalled`. That asymmetry is the evidence the hook path may not have received the same update. A reasonable fix is to make `resolveInstalled` **required** in `InterceptDeps` (forcing every callsite to audit), or to add an integration test that exercises `stackctl intercept` end-to-end from a non-installed directory with a mutating identity and asserts exit 0.

---

### AUDIT-20260619-138 — `cwd-linchpin-reconcile.test.ts` T1 test uses a read-only identity — T1 and T2 are not isolated

Finding-ID: AUDIT-20260619-138
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/capability/cwd-linchpin-reconcile.test.ts:49-62

The test named `'a cwd that LEFT the installation permits via the no-installation short-circuit (never silent refuse)'` asserts that `mediateCheck` with `--at /` (no installation) returns `code: 0`. The identity under test is `backlog list`:

```typescript
const r = mediateCheck(
  ['--surface', 'bash', '--identity', 'backlog list', '--session', 'sess', '--at', '/'],
  liveDeps(),
);
expect(r.code).toBe(0);
```

`backlog list` is a **read-only** identity. The test name claims the permit comes from the no-installation short-circuit (T1 / FR-020). But the identical `permit` verdict would be produced by the FR-050 read-only exemption (T2) even if T1 were completely broken — because the read-only path returns early without consulting `resolveInstalled` at all. If someone regresses T1 while T2 remains intact, this test stays green, giving false confidence that FR-020 is working on the `mediate-check` path.

A precise T1 test needs a **mutating** identity (`backlog capture`, `backlog create`, or similar) paired with `resolveInstalled: () => false`. The result should be `code: 0` (permit), which can only be explained by T1, not T2. Without that test, T1 in `mediateCheck` is tested only via `mediate-check-no-installation-permit.test.ts` (which uses mocked deps, not the live resolver chain `liveDeps()` exercises here).

---

### AUDIT-20260619-139 — `interceptDecision` has no unit test for the no-installation short-circuit with a mutating identity

Finding-ID: AUDIT-20260619-139
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/capability/intercept-cold-start-zero-io.test.ts (absent coverage)

`interceptDecision` now contains FR-020 logic (lines ~90-98 of the new `intercept.ts`):

```typescript
const installed = deps.resolveInstalled?.(cwd) ?? true;
if (!installed) {
  return { verdict: 'permit', capability: null, reason: 'no stack-control installation ...' };
}
```

None of the tests in `intercept-cold-start-zero-io.test.ts` supply `resolveInstalled` — the `countingResolver` provides only `resolveActive`. Every call therefore hits `?? true` and the no-installation branch is **never exercised** through `interceptDecision` in this diff's test suite. The cold-start zero-IO tests verify the read-only / non-backend paths; `cwd-linchpin-reconcile.test.ts` exercises `mediateCheck`, not `interceptDecision`.

The missing test shape:

```typescript
it('permits a mutating backend with NO installation (FR-020)', () => {
  const d = interceptDecision(
    { tool_name: 'Bash', tool_input: { command: 'backlog capture --type bug' }, session_id: 's', cwd: '/x' },
    {
      resolveInstalled: () => false,
      resolveActive: () => new Set(['backlog']), // irrelevant — should not be reached
    },
  );
  expect(d.verdict).toBe('permit');
  expect(d.reason).toMatch(/no stack-control installation/);
});
```

Without this test the FR-020 code path in `interceptDecision` has zero coverage. Combined with the concern in AUDIT-BARRAGE-claude-01, if the production handler doesn't wire `resolveInstalled`, the gap is invisible at CI time.

---

### AUDIT-20260619-140 — `runSpeckitGuard` calls `findInstallation` twice, creating a TOCTOU window

Finding-ID: AUDIT-20260619-140
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/speckit-guard.ts:111-119 (`runSpeckitGuard`)

```typescript
const viaFrontDoor = resolveViaFrontDoorFile(skill, session, cwd);  // findInstallation(cwd) ← call 1
const installed = findInstallation(cwd) !== null;                    // ← call 2
const verdict = evaluateGuard(skill, viaFrontDoor, installed);
```

`resolveViaFrontDoorFile` internally calls `findInstallation(cwd)` and `runSpeckitGuard` immediately calls it again. Between the two calls, the installation directory could appear or vanish (e.g., a concurrent `stackctl setup` or a filesystem unmount). The failure modes are bounded:

- `viaFrontDoor = true`, `installed = false` (installation disappeared between calls): `evaluateGuard` returns `{ refused: false }` via the no-installation path — a harmless (safe-side) over-permit of what was a legitimately marked drive.
- `viaFrontDoor = false`, `installed = true` (installation appeared between calls): `evaluateGuard` calls `evaluateRefusal(skill, false)` — an over-strict refuse of what is now a legitimate context.

The simpler fix is to resolve the installation once and thread it:

```typescript
const installation = findInstallation(cwd);
const installed = installation !== null;
const viaFrontDoor = installed ? activeCapabilities(installation.root, session).has(capabilityForSkill(skill) ?? '') : false;
```

Severity is low because the TOCTOU window is tiny and both failure modes are recoverable (re-invocation). But the double `findInstallation` is also a readability smell — two probes for the same fact with no comment explaining the duplication.

### AUDIT-20260619-141 — `reset` alias is not represented in the command surface

Finding-ID: AUDIT-20260619-141
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/front-door.ts:59-70; missing update in src/cli-help/surfaces/capability.ts:52-57

`frontDoor` now accepts `reset` as a true alias for `mediate-recover` by adding it to `SUBACTIONS` and normalizing it before dispatch. The mounted command-surface metadata for `front-door`, however, still declares only `enter`, `exit`, `mediate-list`, and `mediate-recover`; it does not include `reset` or a mutating mediation class for that alias.

This matters because feature 028 is explicitly about front-door completeness and command-surface accuracy. A downstream consumer reading generated help / descriptor output will not see a shipped alias that the parser accepts. The fix is to add the `reset` subcommand/alias to the command-surface declaration, with the same mutating classification and description as `mediate-recover`.

### AUDIT-20260619-142 — `speckit-guard` can crash on a corrupt marker instead of producing a controlled refusal

Finding-ID: AUDIT-20260619-142
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/speckit-guard.ts:47-58; src/capability/marker.ts:103-121,228-236

`resolveViaFrontDoorFile` calls `activeCapabilities(installation.root, session)` directly. That read path is intentionally strict: `readMarker` throws on invalid JSON or malformed marker contents. `runSpeckitGuard` does not catch that exception before calling `evaluateGuard`, so a corrupt marker makes the deprecated but still shipped guard terminate with an uncaught stack trace rather than the normal refusal message.

The blast radius is limited to the deprecated `speckit-guard` path, so this is not high, but it is still a real recovery-path defect: this feature adds marker recovery specifically so sessions are not wedged by corrupt marker state. A reasonable fix is to catch marker-read errors in the guard resolver and treat them as not-via-front-door, or return a typed diagnostic that `runSpeckitGuard` renders as a controlled refusal with a recovery hint.

## 2026-06-19 — audit-barrage lift (20260619T222831002Z-028-front-door-completeness-phase-5)

### AUDIT-20260619-143 — Production `resolveInstalled` wiring absent from interceptor path — FR-020 broken on live hook

Finding-ID: AUDIT-20260619-143
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/intercept.ts:88-97 + src/subcommands/mediate-check.ts:110-117

`InterceptDeps.resolveInstalled?` is optional and defaults to `?? true` in `interceptDecision` (line ~88). `mediateCheck`'s production runner (`runMediateCheck`) was correctly updated to supply `defaultResolveInstalled`. But no equivalent update to the interceptor's production runner (presumably `src/subcommands/intercept.ts` → `runIntercept`) is visible in this diff.

If `runIntercept` was not updated, the production hook path defaults to `installed = true` on every call, meaning the FR-020 no-installation short-circuit never fires. A user running `backlog create` outside any stack-control installation would get refused (the marker is empty → `decideMediation` refuses the mutating op) instead of permitted. The `stackctl setup` redirect in the refusal message would be a dead end. This contradicts the specification and is a silent behavior regression — the exemption works correctly on `mediate-check` but fails silently on the live `PreToolUse` hook.

The asymmetry is visible: `mediate-check.ts` was updated to wire `defaultResolveInstalled`, the `InterceptDeps` interface was updated to accept `resolveInstalled`, but no production-side caller update for the interceptor is in the diff. The tests in `intercept-cold-start-zero-io.test.ts` use `countingResolver()` which omits `resolveInstalled` entirely, so they exercise only the `?? true` fallback and provide no coverage of the production wiring gap.

---

### AUDIT-20260619-144 — "Short-circuit before `resolveActive`" test uses a read-only identity — no-installation guard is not actually pinned

Finding-ID: AUDIT-20260619-144
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/subcommands/mediate-check-no-installation-permit.test.ts:51-61

The test `'does NOT resolve the marker when there is no installation (short-circuit before decideMediation)'` (lines 51-61) asserts that `resolveActive` is never called when `resolveInstalled` returns false — but uses `backlog list` (a read-only identity) as the test input.

The read-only exemption (FR-050) independently prevents any `resolveActive` call for `backlog list` regardless of the installation status. This means the test passes whether or not the `isFronted && !installed` early-return block exists in `mediateCheck`. Removing that block entirely would leave all other assertions in this file green, including this one, because the read-only exemption would still short-circuit the marker read.

The correct identity to pin the no-installation guard is a **mutating** fronted call (e.g., `backlog create` or `backlog capture --type bug`): with `resolveInstalled=false`, `resolveActive` must not be called; with `resolveInstalled=true` and an empty marker, `resolveActive` must be called and the call must refuse. As written, the test cannot distinguish the two code paths it claims to discriminate.

---

### AUDIT-20260619-145 — Linchpin reconcile (FR-023) tested for `mediateCheck` only — `interceptDecision` production path uncovered

Finding-ID: AUDIT-20260619-145
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/capability/cwd-linchpin-reconcile.test.ts + src/capability/intercept.ts:107-111

`cwd-linchpin-reconcile.test.ts` exercises the linchpin reconcile — that a cwd drift within the installation still resolves the same root — via `mediateCheck` and `liveDeps()` (which correctly calls `findInstallation(at)?.root` before `activeCapabilities`). There is no parallel test that calls `interceptDecision` through a `liveDeps`-style resolver that exercises the same scenario.

In `interceptDecision` (line ~107), `deps.resolveActive(cwd, session)` is called with the raw cwd. The production `resolveActive` for the interceptor must internally resolve the installation root (the same `findInstallation(at)?.root` pattern `defaultResolveActive` in `mediate-check.ts` follows) for the linchpin reconcile to hold. If the production interceptor's `resolveActive` passes raw cwd directly to `activeCapabilities(cwd, session)` without root resolution, a `front-door enter` at the installation root followed by a backend call from a subdirectory would be refused — exactly the scenario FR-023 is meant to permit.

The production wiring of `InterceptDeps.resolveActive` is not shown in this diff, and no test exercises `interceptDecision` with a subdir cwd and a root-written marker. The gap is doubly exposed if Finding claude-01 is also present: the interceptor's production deps are not visible in this audit.

---

### AUDIT-20260619-146 — `skill-marker-example-authorizes.test.ts` ILLUSTRATIONS list requires manual maintenance

Finding-ID: AUDIT-20260619-146
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/capability/skill-marker-example-authorizes.test.ts:38-43

The `ILLUSTRATIONS` array is hardcoded to four entries (`backlog`, `define`, `extend`, `execute`). Any new capability-interface skill added to `plugins/stack-control/skills/` with a `front-door enter --capability` example block will not be covered by this test unless the list is manually extended.

The failure mode is the one the test was designed to prevent: a skill whose documented `--capability` example does not authorize the backend call it illustrates. A newly added `roadmap` or `inbox` skill could ship a wrong capability name in its example and this test would not catch it. An automated discovery approach — glob the skills directory for SKILL.md files, extract `front-door enter --capability` blocks, and assert each maps to a known registry capability — would make the test self-updating and eliminate the manual-maintenance burden.

---

### AUDIT-20260619-147 — `failOpenSignal` is production-unreachable — spawn failures happen before TypeScript starts

Finding-ID: AUDIT-20260619-147
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/capability/intercept.ts:119-133

`failOpenSignal(reason)` is documented in its inline comment as the "vendor-neutral, test-pinned SPECIFICATION of the shell adapter's notice content" — it is explicitly not called from the shell adapter (`bin/intercept`). A spawn failure (stackctl not executable) happens before the TypeScript interpreter runs, so the shell handles it with its own stderr notice. `failOpenSignal` exists to (a) be called by tests that assert the load-bearing phrases, and (b) serve as a reference for future non-shell adapters.

The design is intentional and the comment describes it clearly. The practical consequence is that `failOpenSignal` is a dead function in the shipped binary — it is exported, compiled, and linked, but no production code path calls it. The only caller is `intercept-fail-open-signal.test.ts`. A future maintainer who sees `failOpenSignal` unused in production might remove it, breaking the contract test. The current approach is coherent but the single-source-of-truth value would be better served by an inline constant (the required phrases as `const REQUIRED_PHRASES`) rather than a function with a call signature that implies it has a production call site. This is a design note, not a defect.

### AUDIT-20260619-148 — `reset` alias is accepted by the CLI but missing from the command surface

Finding-ID: AUDIT-20260619-148
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/front-door.ts:59-70; src/cli-help/surfaces/capability.ts:48-57

`frontDoor` accepts `reset` as a real subaction and normalizes it to `mediate-recover` (`SUBACTIONS` includes `reset`), but the command-surface descriptor only declares `enter`, `exit`, `mediate-list`, and `mediate-recover`. The descriptor is explicitly the source for help, verb reference, and mediation metadata, so this creates a drifted accepted operation that descriptor-driven tooling will not enumerate or validate.

Blast radius is medium: the primary recovery path still works via `mediate-recover`, but an operator or unattended checker using the command surface will conclude `reset` is not part of the accepted API even though the parser accepts it. A reasonable fix is to either remove the parser alias or model `reset` as a deprecated alias in the command surface so generated help/checks and accepted syntax agree.

### AUDIT-20260619-149 — `mediate-recover` can fail on a corrupt marker directory despite claiming one-command recovery

Finding-ID: AUDIT-20260619-149
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/marker.ts:300-305; src/subcommands/front-door.ts:110-124

`clearMarker` deletes the marker path with `rmSync(path, { force: true })`. If the marker path exists as a directory rather than a file, `listMarker` reports it as corrupt through the tolerant read path, but `mediate-recover` will throw instead of clearing it because `rmSync` lacks `recursive: true`. `frontDoor` documents and implements the recovery branch as “Always exit 0” and “recovers even a corrupt marker in one command,” but this corrupt filesystem shape wedges that path.

Blast radius is medium: this requires a malformed state path, but recovery surfaces exist specifically to handle malformed marker state. A reasonable fix is to make `clearMarker` deliberately handle non-file marker paths under the already session-safe marker location, or return a diagnosable result that the CLI renders instead of letting the dispatcher catch an unclassified exception.

### AUDIT-20260619-150 — `speckit-guard` crashes on corrupt marker state instead of rendering the guard contract

Finding-ID: AUDIT-20260619-150
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/speckit-guard.ts:47-58; src/cli.ts:221-224

`resolveViaFrontDoorFile` now reads the session marker through `activeCapabilities`, but it does not catch malformed-marker errors. A corrupt marker therefore bubbles to the top-level CLI catch, which prints only the raw error and exits 1. That differs from the guard’s stated contract of rendering a permit/refusal verdict for wrapped skills, and it gives no recovery hint even though this feature adds `front-door mediate-list` / `mediate-recover` for exactly this marker state.

Blast radius is medium: this affects the deprecated guard and only under corrupt marker state, but downstream users still see an exit-1 failure indistinguishable from a policy refusal by exit code and without the sanctioned front-door/recovery message. A reasonable fix is for `resolveViaFrontDoorFile` or `runSpeckitGuard` to catch marker corruption and render a diagnosable refusal/recovery message instead of falling into the generic dispatcher catch.
