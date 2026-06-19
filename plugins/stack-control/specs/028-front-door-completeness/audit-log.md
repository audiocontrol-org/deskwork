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
