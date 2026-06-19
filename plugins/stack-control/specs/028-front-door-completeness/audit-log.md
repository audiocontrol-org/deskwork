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
