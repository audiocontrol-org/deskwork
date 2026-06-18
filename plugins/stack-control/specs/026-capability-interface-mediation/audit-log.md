---
slug: 026-capability-interface-mediation
targetVersion: ""
---

# Audit log — 026-capability-interface-mediation

## 2026-06-18 — audit-barrage lift (20260618T010756127Z-026-capability-interface-mediation-phase-1)

### AUDIT-20260618-01 — Audited file is untracked and not part of the named commit range

Finding-ID: AUDIT-20260618-01
Status: migrated-to-backlog TASK-156
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/fixtures/capability-fixtures.ts (whole file) vs. audited commit range

The only commit subject in the audited range is `f68a6aa1 docs(session): compose 2026-06-18 026-spec-authoring narrative + correct quantitative` — a docs/session commit — yet the diff contents are a new TypeScript fixture. The session git-status shows `?? src/__tests__/fixtures/capability-fixtures.ts`, i.e. the file is untracked. So the barrage is reviewing a working-tree file that is *not* in the committed `HEAD~1..HEAD` range it claims to diff.

Blast-radius: none to the code itself; this is a provenance note for the operator triaging the barrage. The implication is that this fixture has not yet been committed, so whatever governance/CI runs against `HEAD` will not see it. Reasonable resolution: confirm T001's fixture is committed before it's treated as landed. No code change implied.

### AUDIT-20260618-02 — Fixture has no importers in this diff — unexercised until later tasks land

Finding-ID: AUDIT-20260618-02
Status: migrated-to-backlog TASK-157
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:39 (`makeCapabilityFixture`), :13 (`FRONT_DOOR_STATE_REL`)

The fixture's header documents it as the anchor for "the marker, mediate-check, and front-door tests" (T008+), but none of those consumers exist in this diff. `makeCapabilityFixture`, `sessionMarkerPath`, `commitAll`, etc. are therefore currently dead — nothing imports or runs them, so a latent bug in the fixture (e.g. the git-helper or marker-path logic) would not surface until the dependent test tasks land.

Blast-radius: low and expected for a TDD-first T001 fixture-scaffold task — the fixture legitimately precedes its consumers. Flagging only so the operator knows this file is unverified-by-use at this point; the verification arrives when T008's marker tests import it. No fix needed beyond ensuring those consumers actually arrive (per AUDIT-BARRAGE-claude-01, ensure they're not silently dropped).

### AUDIT-20260618-03 — `git` helper swallows spawn-failure detail (`r.error`), yielding an unhelpful message when git is missing

Finding-ID: AUDIT-20260618-03
Status: migrated-to-backlog TASK-158
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:55-59

```ts
const git = (args: readonly string[]): string => {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr ?? ''}`);
  return r.stdout ?? '';
};
```

When `spawnSync` fails to launch the binary entirely (e.g. `git` not on PATH → `ENOENT`), `r.status` is `null`, `r.stderr` is `null`/empty, and the actual cause lives in `r.error`. The guard `r.status !== 0` correctly throws (`null !== 0`), but the message becomes `git init -q failed:` with an empty tail — the operator sees no reason. Including `r.error?.message` (and the signal, if `r.signal` is set) in the thrown message would make a CI-environment git-absence failure self-explanatory.

Blast-radius: low — this is test-harness code in a controlled environment where git is normally present; the cost is only debugging time on the rare environment where git is missing or killed by signal. A one-line message improvement closes it.

### AUDIT-20260618-04 — `sessionMarkerPath` does not guard against path separators in `session`

Finding-ID: AUDIT-20260618-04
Status: migrated-to-backlog TASK-159
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:73 (`sessionMarkerPath`)

`sessionMarkerPath: (session) => join(frontDoorDir, \`${session}.json\`)` interpolates the caller-supplied `session` directly into the path. A `session` value containing `..` or a separator would resolve outside `frontDoorDir`. This is test-fixture code fed controlled session identifiers, so it is not a real vulnerability — but if the front-door marker writer (T008) under test derives session IDs from anything operator-influenced, a test asserting against this helper would silently mirror the same unguarded join and could mask a traversal bug in the production writer rather than catch it.

Blast-radius: informational for the fixture itself (controlled input). Worth a one-line note so that when T008's real marker-path logic lands, its session-sanitization is tested against adversarial session IDs rather than assumed safe because the fixture helper accepted them.

---

Net assessment: substantially clean. I checked the import surface (all `node:` builtins; the `@/` convention doesn't apply), error handling (`read`/`git` fail loud as documented — no silent fallbacks or mock-data traps), the config seed (`version: 1`), path construction (`FRONT_DOOR_STATE_REL` ↔ `frontDoorDir` are consistent), and file size (86 lines, well under the cap). The four items above are all low/informational — provenance, TDD-ordering, and two hardening nits in test-only code — none blocking.

## 2026-06-18 — audit-barrage lift (20260618T012530058Z-026-capability-interface-mediation-phase-1)

### AUDIT-20260618-05 — Git spawn failures lose the actionable error

Finding-ID: AUDIT-20260618-05
Status: migrated-to-backlog TASK-161
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/capability-fixtures.ts:55-57

The fixture’s `git()` helper only reports `stderr` when `spawnSync` fails. If `git` cannot be spawned at all, `spawnSync` returns `status: null` and puts the real cause in `r.error`, so the thrown message becomes essentially `git init -q failed:` with no explanation. That makes CI or local environment failures harder to diagnose for the capability test suite.

Blast radius is low because this is test-fixture diagnostics, not shipped runtime behavior, but it does violate the repo’s preference for explicit actionable errors. A reasonable fix is to include `r.error?.message` alongside `stderr`, and handle `status === null` as a spawn failure path.

## 2026-06-18 — audit-barrage lift (20260618T013117551Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-06 — Bash identity resolution only inspects the FIRST simple command — compound commands bypass mediation

Finding-ID: AUDIT-20260618-06 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   high
Per-lane:   claude=high, codex=high
Decision:   agreement (gate-counted high)
Surface:    src/capability/identity.ts:42-86 (`tokenizeFirstCommand`), consumed by `normalizeArgv0`/`matchCapability`

`tokenizeFirstCommand` deliberately stops at the first unquoted `;`, `|`, or `&` (the `if (ch === ';' || ch === '|' || ch === '&') { flush(); break; }` branch), so `normalizeArgv0` only ever resolves argv[0] of the *first* simple command. That means any backend invoked in a non-leading position is invisible to the matcher: `true && backlog delete x`, `git status; backlog capture y`, `echo hi | backlog add`, and `foo $(backlog z)` all resolve to `true`/`git`/`echo`/`foo` and return `null` → permit.

This matters because the feature exists to enforce that direct backend invocation is refused and redirected to a front door (registry.ts header: "complete-mediation invariant"). A bypass reachable by prefixing literally any no-op (`: && backlog …`) is not a corner case — an agent reaching around the interface (the "hyperintelligent toddler" the thesis names) hits it trivially, and a normal compound command hits it by accident. The diff's own tests (identity.test.ts) never exercise a compound command, so this behavior is unspecified-by-test and structurally locked in. A reasonable fix is to tokenize and check argv[0] of *every* simple command in the pipeline/list (split on `;|&&|||`), or — if first-command-only is an intentional v1 limitation — document it as an explicit accepted gap tied to a spec clause, because nothing in the diff records that decision.

---

### AUDIT-20260618-07 — Wrapper option-arguments are misread as the executable — `sudo -u user backlog` resolves to `user`, bypassing mediation

Finding-ID: AUDIT-20260618-07
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:97-110 (`normalizeArgv0`, the `afterWrapper && token.startsWith('-')` flag-skip)

The wrapper-stripping loop skips a wrapper's flags with `if (afterWrapper && token.startsWith('-')) continue;`, but it does not account for flags that take a *separate* value. After a wrapper, the first non-`-`-prefixed, non-assignment token is returned as the executable. So for option-with-value forms the value is mistaken for the command:

- `sudo -u someuser backlog list` → strips `sudo`, skips `-u`, returns `basename('someuser')` = `someuser` → no registry match → **permitted**.
- `nice -n 10 backlog` → returns `10`.
- `env -u PATH backlog` / `env -C /dir backlog` → returns `PATH` / `dir`.

Each is a false negative that lets a raw backend slip through, and `sudo -u`/`nice -n` are ordinary forms. This also contradicts the helper's own documented contract ("strips a sudo wrapper", identity.ts header) — the helper claims to normalize past the wrapper but resolves to the wrong token. The tests cover only valueless cases (`env FOO=bar backlog`, `sudo backlog`), so the bug is uncaught. A correct fix needs per-wrapper flag arity (which short options consume the next token) or a more conservative rule for tokens immediately following a wrapper flag; at minimum add RED tests for the option-with-value forms so the gap is visible.

---

### AUDIT-20260618-08 — `WRAPPERS` set is incomplete — common transparent wrappers (`nohup`, `timeout`, `xargs`, `bash -c`, `stdbuf`) leave the backend unmatched

Finding-ID: AUDIT-20260618-08 (claude-03 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/capability/identity.ts:11 (`const WRAPPERS = new Set([...])`)

`WRAPPERS` enumerates `env`, `sudo`, `nice`, `command`, `exec`, `builtin`, `time`. Several equally-common transparent prefixes are absent: `nohup backlog &`, `timeout 30 backlog …`, `xargs backlog`, `setsid backlog`, `stdbuf -oL backlog`, and the indirection forms `bash -c 'backlog …'` / `sh -c …` / `npx backlog`. Each resolves to the wrapper name (`nohup`, `timeout`, etc.), which is not in the registry, so the call is permitted — another class of false-negative mediation gap.

This is the same theme as findings 01/02: the Bash matcher is a best-effort heuristic that under-matches, and every under-match is a hole in the invariant the feature is built to guarantee. It's separated here because it's a coverage/maintenance concern (an enumerated denylist of wrappers will always lag real shell usage) rather than a single concrete bug. The `bash -c`/`sh -c` and command-substitution cases are structurally unsolvable by argv[0] inspection alone. The honest resolution is probably to (a) extend the set for the cheap wins and (b) document in the spec that shell-indirection bypasses are an accepted v1 limitation — but that decision should be written down, not implicit.

---

### AUDIT-20260618-09 — D3 refinement reintroduces a parallel skill list (`hooks.json` matcher regex) that can drift from the registry, undercutting the FR-011 single-source claim

Finding-ID: AUDIT-20260618-09
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/026-capability-interface-mediation/research.md (D3 spike result, "Refinement to D2") + registry.ts:1-9 header (FR-011 claim)

The registry header asserts the feature's load-bearing promise: "Adding a backend is a registry entry, not new adapter code (FR-011)" and "ONE source / many consumers → non-drift." The D3 note refines D2 to say the PreToolUse `Skill` matcher does *not* catch-all and must be registered as "an enumeration/regex built from the registry's skill identity set (e.g. `^speckit-(specify|clarify|plan|checklist|tasks|analyze|implement)$`)". If that regex in `hooks.json` is hand-maintained, then adding a skill backend requires editing *two* places — the registry AND the matcher — or the hook silently never fires for the new skill, disabling mediation for it while the registry test still passes (the registry is internally consistent; the hook just won't observe the skill).

The word "built from" hints at generation, which would preserve single-source, but the note never states the matcher is *generated* from `CAPABILITY_REGISTRY` rather than copied. For an agent building T015 unattended, the ambiguity is the risk: the more natural reading ("write a regex enumerating the speckit skills") produces a hand-maintained parallel list that drifts. The research note should explicitly require the `hooks.json` skill matcher to be derived/generated from the registry's skill identity set, so FR-011 actually holds for skill backends, and so a future "just add a registry entry" change can't half-wire a new skill.

---

### AUDIT-20260618-10 — D3 headline "Confirmed (NOT falsified)" overstates a doc-only confirmation — the spike's empirical capture was blocked

Finding-ID: AUDIT-20260618-10
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/026-capability-interface-mediation/research.md (D3 spike result, lines added ~42-50)

The D3 entry leads with "**Confirmed (NOT falsified): the skill name IS in the PreToolUse payload.**" but the Method paragraph discloses that the intended empirical method (register a probe hook, invoke a skill, read the stdin payload) "**was blocked by the harness's self-modification guard**," so the confirmation actually rests on reading the official hooks documentation. The body is honest about this, which is why this is low and not higher — a careful reader sees the caveat.

The risk is a skimming consumer (or a downstream task that cites "D3 confirmed empirically") treating a documentation-derived field path (`tool_input.skill_name`) as live-validated, when the real live validation is deferred to T015/T018 integration. A one-word hedge in the headline — "Confirmed (by official docs; live capture deferred to T015)" — would keep the spike record from being read as stronger evidence than it is. No behavioral consequence today; flagged so the provenance stays accurate as later tasks lean on it.

---

### AUDIT-20260618-11 — `redirectFor` and the `redirect` field have zero test coverage despite registry.test.ts claiming to cover "v1 contract contents"

Finding-ID: AUDIT-20260618-11
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/registry.ts:118-127 (`redirectFor`) + src/__tests__/capability/registry.test.ts (whole file)

`redirectFor` produces the operator/agent-facing refusal message — the actual UX of mediation — and supports an optional explicit `cap.redirect` override path. registry.test.ts's header advertises that it asserts "the v1 contract contents (registry-schema.md)" and tests `interface`, `backendIdentities`, ids, and invariants, but never calls `redirectFor` and never exercises the `redirect`-override branch. So the one line a refused agent sees is untested: a regression in the `/`-prefixing (`cap.interface.map((d) => `/${d}`)`) or the "or"-joining of multiple front doors (relevant for `spec-definition`, which has two interfaces) would ship unnoticed.

This is low because the function is simple and pure, but it's the contract surface a consumer perceives, and the test file's own framing implies it's covered. A couple of assertions — derived-message contains each front door with a leading slash and joins multi-door capabilities with " or ", plus the explicit-`redirect` branch returns verbatim — would close the gap and match the test file's stated scope.

## 2026-06-18 — audit-barrage lift (20260618T014214710Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-12 — Comment token `break` drops every command after the first comment — a one-line mediation bypass

Finding-ID: AUDIT-20260618-12
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:109 (parseCommands)

```

`if (ch === '#' && !started) break;` exits the **entire** parse loop, not just the current line — yet the doc comment (identity.ts:54-55) says `#` "ends the line." The command string `"# run the thing\nbacklog list"` parses to **zero** commands: i=0 is `#` with `!started`, the loop breaks, and `backlog list` on line 2 is never seen → `matchCapability` returns null → PERMIT. Prefixing any fronted backend call with a comment line defeats matching entirely. The Bash tool routinely runs multi-line scripts, and no test exercises a multi-line command with a comment, so it's uncaught. Fix: a `#` comment should consume to the next `\n` and continue scanning (flush the command at the newline), not `break`. Regression: `argv0sOf('# c\nbacklog list')` → `['backlog']`.

### AUDIT-20260618-13 — Leading subshell/group paren is swallowed into argv[0] — `(backlog list)` is an untested bypass

Finding-ID: AUDIT-20260618-13
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:58-155 (parseCommands / argv0OfTokens)

```

`(` `)` `{` `}` are neither separators nor stripped. `(backlog list)` tokenizes as `['(backlog','list']`; `basename('(backlog')` is `(backlog`, matching nothing. (Innocent compound forms like `(cd d && backlog list)` are safe — `&&` splits and `backlog` leads the second command — so this is specifically the leading-in-group position.) Unlike `bash -c` / `$(…)`, this form is **not** in the documented accepted-limitation list (identity.ts:8-12) and has no asserting test, so the gap is silently locked in. Cheap fix: skip a leading `(`/`{` like a transparent prefix; or, if it stays a limitation, assert `matchCapability(reg,'bash','(backlog list)')` toBeNull with the FR-017 backstop comment, the way the `bash -c` row is documented.

### AUDIT-20260618-14 — `validateRegistry`'s cli-identity-collision branch has no failing-case test

Finding-ID: AUDIT-20260618-14
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    registry.test.ts (validateRegistry tests) ↔ registry.ts:142-146

```

The shared-identity red test exercises only the `skillOwner` branch (`skills: ['dup']`). The symmetric `argv0Owner` branch (registry.ts:142-146) is never driven by a red fixture. The two branches are copy-paste siblings; a regression touching only the argv0 path would pass. Add a fixture with a duplicated `cliArgv0` asserting non-empty violations.

### AUDIT-20260618-15 — Commit subject under-describes the change: "T001 setup" lands T003–T006

Finding-ID: AUDIT-20260618-15
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    commit 6f290ab6 subject vs diff contents

```

Subject is `Phase 1 setup … (T001)`, but the diff implements/tests T003 (registry invariants), T004 (registry), T005 (identity tests), T006 (identity matching) — the full capability core in one commit. Traceability/per-task RED→GREEN history suffers. Flagging for the workplan record, not a code defect.

### AUDIT-20260618-16 — D3 spike: the one claim that diverges from D2 is the least-verified

Finding-ID: AUDIT-20260618-16
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/026-capability-interface-mediation/research.md:42-52

```

The matcher refinement (`"matcher": "Skill"` is not catch-all; must enumerate the registry's skill set) is the single finding diverging from D2, and it's confirmed only against docs — the live capture was "blocked by the harness's self-modification guard" and pushed to T015/T018. If the docs reading is wrong, T015's generated matcher silently never fires (mediation off for every fronted skill) while the registry-consistency test still passes. Carry this as an explicit T015 acceptance check ("the registered hook actually fires on a fronted skill invocation"), not just prose — so the divergent, load-bearing, least-verified claim gets a gate.

---

**Headline:** claude-01 is the one to fix before the interceptor (T015) consumes `matchCapability` — it turns a parser quirk into a live, one-comment-line bypass of the entire mediation feature. Findings are persisted to the plan file as the audit artifact.

This was a read-only audit; the deliverable is the findings above, so there's no implementation plan to approve. If you want, I can open backlog items for claude-01/02/03 via `/stack-control:backlog`, or fix claude-01 directly (it's a small, well-scoped parser change with a clear regression test).

### AUDIT-20260618-17 — Wrapper parsing treats long options with inline values as the executable

Finding-ID: AUDIT-20260618-17
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:130-143

`argv0OfTokens` skips wrapper flags only while `tokens[i]!.startsWith('-')`, but for value flags it only recognizes exact flag tokens from `spec.valueFlags`. The comment says attached forms like `--kill-after=5` carry their own value, but `spec.valueFlags.has(flag)` is false for `--kill-after=5`, so it is skipped as a generic flag. The next token, such as `10`, becomes the timeout positional and gets consumed; that works accidentally for `timeout --kill-after=5 10 backlog`, but fails for wrappers without positionals or where attached short values are used differently.

More importantly, the code also skips any unknown dash-prefixed token as a wrapper option. For `env -- backlog`, `--` is treated as just another option and the next token is considered the executable, but for wrappers where `--` terminates option parsing before a command, this is acceptable only by coincidence. For `timeout --foreground 30 backlog`, `--foreground` is unknown but skipped, again acceptable; for a mistyped or non-wrapper command option sequence, mediation may incorrectly look past tokens and match a later argument as argv0. Since this parser is the enforcement boundary for raw backend invocation, a wrong parse can produce both false denies and bypasses. A reasonable fix is to make wrapper option handling per-wrapper and explicit about boolean flags, value flags with `--flag=value` / attached short values, `--`, and unknown options.

### AUDIT-20260618-18 — Parser ignores command substitution boundaries while still scanning compound commands

Finding-ID: AUDIT-20260618-18
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:49-114, src/__tests__/capability/identity.test.ts:165-172

The accepted-limit test says `foo $(backlog z)` should not resolve through command substitution, but the parser does not track `$(` nesting. It treats the space inside `$(backlog z)` as a token separator and emits tokens like `['foo', '$(backlog', 'z)']`, so that specific test passes only because `foo` is the first argv0. In compound forms like `true && echo $(backlog z)`, the parser still scans the second simple command and may mis-tokenize shell syntax it explicitly claims is out of scope.

The blast radius is high because this enforcement code is making security/governance decisions from a partial shell parser while documenting command substitution as invisible. If downstream implementation relies on these tests as the boundary, it can get surprising false positives or false negatives when `$()`, backticks, grouping, or subshell syntax appears near separators. A reasonable fix is either to reject/deny commands containing unsupported shell indirection conservatively, or to make `parseCommands` track and skip nested shell constructs consistently with the documented limitation.

## 2026-06-18 — audit-barrage lift (20260618T015124666Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-19 — Backslash-newline line continuation bypasses Bash mediation

Finding-ID: AUDIT-20260618-19
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=reachable, fix-debt=no; reachable, high blast radius — NOT calibrated down (real signal preserved, SC-003).
Surface:    src/capability/identity.ts (parseCommands, unquoted `\\` escape branch, ~lines 168–171)

The unquoted escape branch does `cur += command[++i]` for any `\`, including `\` followed by a newline. In shell, `\<newline>` is a *line continuation* (the backslash and newline are removed, joining the two physical lines). Here the newline is instead swallowed into the current token as a literal `\n`, and `started` is set true — so the backend token that follows on the continued line is fused with a leading `\n` (or a phantom `\n` token precedes it). Its `basename` is then `\nbacklog` (or the resolved argv0 is the phantom `\n`), neither of which equals the registry identity `backlog`, so `findCapabilityByIdentity` returns null and mediation is silently skipped.

Concrete repro (extremely common agent formatting):
```
cd /repo && \
backlog capture "x"
```
`argv0sOf` on this yields `['cd', '\nbacklog']` (or `['cd','\n','backlog']` with leading indent → resolves to `'\n'`), so `matchCapability(reg,'bash',…)` returns null and the raw `backlog` invocation runs un-mediated. This is the same bypass class the HIGH-1 fix targeted (a backend in a non-leading compound position), but the fix covered `;`/`&&`/`||`/`|`/literal-newline and missed the `\`-continuation form of a newline. Trailing `\` line continuations are ubiquitous in agent-authored multi-line bash, so this is a mediation bypass reachable with ordinary syntax. Blast radius: any fronted CLI (`backlog`) escapes the interface whenever the operator/agent formats a compound command with a line continuation before it; the US3 graduate-gate backstop (FR-015) limits the downstream damage but the interface itself is reachable-around for a common case. Fix: in the unquoted (and double-quoted) escape branch, special-case `\`+`\n` to act as a line join (drop both) — or, minimally, treat it as a command/token boundary — and add a RED test (`'x && \\\nbacklog list'` must resolve `backlog`).

### AUDIT-20260618-20 — `command -v <backend>` (lookup-only) triggers a false refusal

Finding-ID: AUDIT-20260618-20
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts (WRAPPERS `command` entry + argv0OfTokens flag loop, ~lines 30–45, 198–210)

`command` is registered as a transparent wrapper (`valueFlags: ∅, positionals: 0`) so that `command backlog` (run `backlog`, bypassing functions/aliases) is correctly matched. But the flag loop consumes any leading `-flag` as an option and then returns the next token, so `command -v backlog` and `command -V backlog` resolve to `backlog` and are refused. Those forms do **not** invoke the backend — `command -v X` is the POSIX idiom for "does X exist / what is its path," a lookup that agents routinely run before deciding whether to call something. Refusing it violates the stated SC-003 intent ("a backend name in a non-invocation position must NOT match") and surfaces a confusing redirect for a command that never reached around the interface.

Blast radius: a false-refusal class, not a security hole — but it erodes trust in the interface (the operator/agent sees a "use the front door" redirect for a harmless existence check) and is easy to hit. A reasonable fix: when the resolved wrapper is `command` (or `exec`) and a lookup-only flag (`-v`/`-V`) is present, treat the invocation as non-matching, and add a test pinning `command -v backlog` → null alongside the existing `command backlog` → match.

### AUDIT-20260618-21 — Process substitution `<(…)` / `>(…)` is an under-match form not in the documented opaque set

Finding-ID: AUDIT-20260618-21
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts (parseCommands — only `$(…)` and backticks are handled opaquely; ~lines 100–160)

The header comment and the `claude-03`/`codex-02` tests document command substitution `$(…)` and backticks as the consistent, opaque indirection limit (under-matched, backed by the US3 backstop). Process substitution `<(backlog a)` / `>(backlog a)` is a third hidden-backend form that is *not* enumerated and not treated opaquely: an unquoted `(` is appended as a normal char, so `diff <(backlog x)` tokenizes to `['diff','<(backlog','x)']` and argv0 resolves to `diff` (backlog under-matched). The behavior happens to be safe-by-accident (it under-matches, like the documented forms) but it is inconsistent with the `$()`/backtick handling and untested, so a future parser change could silently start mis-splitting around it.

Blast radius: minimal today (it under-matches consistently with the accepted indirection limit), but it's an undocumented gap in a parser whose entire contract is "exhaustive for direct/compound/wrapped/grouped; opaque only for the named indirection forms." Worth either folding `<(`/`>(` into the opaque-substitution handling or adding a one-line note + test so the limit set is complete and pinned.

### AUDIT-20260618-22 — Commit subject understates the audited diff's scope

Finding-ID: AUDIT-20260618-22
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    commit 6f290ab6 vs. the working-tree diff (src/capability/*, src/__tests__/capability/*)

The only commit subject in the audited range is "026 Phase 1 setup — capability module + shared fixture (T001)," but the diff under review implements T003 (registry invariants tests), T004 (registry module), T005/T006 (identity tests + module), T010/T020 consumers, and two full rounds of Phase-2 audit-hardening (HIGH-1/HIGH-2/MED + round-2 parser robustness). The capability source and tests are still untracked per `git status`. This is a traceability note, not a code defect: a future reader diffing by commit subject would expect only "setup + fixture" and would not see that the registry, the shell-aware identity matcher, and the audit-driven parser hardening all landed here. When this work is committed, splitting it along the task/round boundaries (or at least naming the real scope in the subject) keeps the per-finding audit trail legible.

---

I specifically checked: empty/whitespace/comment-only input (correctly → null/permit), the SC-003 collision set (correctly not matched), wrapper flag-arity and `--` end-of-options (correct), subshell/group paren stripping (correct), cross-surface non-resolution (correct), `validateRegistry` invariants (complete and symmetric), and `redirectFor` derivation (correct). Those came back clean. The line-continuation bypass (claude-01) is the load-bearing finding — it's the one I'd block a "complete mediation" claim on until covered.

### AUDIT-20260618-23 — Shell reserved words bypass argv0 mediation

Finding-ID: AUDIT-20260618-23
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:55-63, src/capability/identity.ts:165-211

The Bash parser splits only on separators and then checks the first normalized token of each segment. That misses direct commands executed through shell grammar where the executable is not token 0 of the segment, e.g. `if backlog list; then echo ok; fi` parses the first command segment as `["if", "backlog", "list"]`, so `argv0OfTokens()` returns `if` and mediation never sees `backlog`.

This is not shell indirection like `bash -c` or command substitution; it is ordinary shell syntax. The downstream blast radius is high because a raw fronted backend can be invoked with common control-flow syntax while the code claims exhaustive coverage for direct compound invocations. A reasonable fix is to use a real shell parser or explicitly model reserved-word/group constructs so executable positions inside `if`/`while`/`until`/`do`/function bodies are inspected or rejected conservatively.

### AUDIT-20260618-24 — `env -S` hides the wrapped backend

Finding-ID: AUDIT-20260618-24
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:29-31, src/capability/identity.ts:197-207

`env` includes `-S` in `valueFlags`, so the wrapper skipper consumes the following token as an option value. But `env -S "backlog list"` uses that value as the split command string, so the wrapped executable is inside the consumed token and `matchCapability()` returns `null`.

The blast radius is medium: this is a real mediation bypass for the only v1 CLI backend, but it requires a specific wrapper option rather than everyday shell composition. A reasonable fix is to special-case `env -S` by parsing the split string as another command line, or to refuse `env -S` conservatively when the split string cannot be safely inspected.

### AUDIT-20260618-25 — Research records unverified hook behavior as confirmed

Finding-ID: AUDIT-20260618-25
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/026-capability-interface-mediation/research.md:42-51

The D3 result headline says the Skill payload shape is “Confirmed,” but the same section says live capture was not performed and assigns the live proof to T015/T018. This is a documentation trap: an unattended implementation agent can reasonably treat `tool_input.skill_name` and the matcher behavior as already empirically verified, even though the load-bearing hook firing behavior is still only docs-derived in this artifact.

The blast radius is medium because the prose does include a required acceptance check, so a careful reader can recover the intended boundary. The artifact should separate “docs-derived assumption” from “empirically confirmed” and make the live hook denial check part of the current acceptance criteria before any downstream adapter treats the matcher behavior as settled.

## 2026-06-18 — audit-barrage lift (20260618T020008769Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-26 — Heredoc bodies are parsed as commands → false refusal (SC-003 over-match with no backstop)

Finding-ID: AUDIT-20260618-26
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:140-205 (parseCommands), specifically the newline handling at the `if (ch === ' ' || ch === '\t' || ch === '\n')` branch

`parseCommands` has no heredoc awareness. It splits on every unquoted newline and flushes a command, so the *body* of a heredoc is tokenized as if it were shell commands. When a heredoc body line begins with a fronted backend identity, `argv0sOf` reports it and `matchCapability` returns a capability — a **false refusal** of a legitimate Bash call.

Concrete repro: `cat <<EOF > notes.md` followed by a body line `backlog list is the old way` then `EOF`. `parseCommands` yields commands `[cat, <<EOF, >, notes.md]`, `[backlog, list, …]`, `[EOF]`; `argv0sOf` → `['cat','backlog','EOF']`; `matchCapability(reg,'bash',…)` resolves `backlog` and the interceptor refuses, redirecting to `/stack-control:backlog` — even though the user is writing a file, not invoking the CLI. This is exactly the SC-003 class the feature claims to handle ("a backend name in a path / arg / comment must NOT match"): a heredoc body is data, not an invocation. The test suite carefully covers comments, quotes, and command substitution to prevent false positives but omits heredocs entirely (`identity.test.ts` has no `<<` case). This project uses heredocs heavily (the global CLAUDE.md devotes a rule to `#`-in-heredoc handling), and documentation/scripts routinely show `backlog …` example lines, so the trigger is realistic.

Blast radius: over-matching is the worse failure direction — under-matched indirection (`$(...)`, `bash -c`) is documented and covered by the US3 graduate-gate backstop, but a false refusal has *no* backstop and blocks legitimate work with a misleading redirect; an unattended agent hitting it would be stuck or reroute incorrectly. A reasonable fix: detect `<<[-]?(['"]?)WORD\1` heredoc openers during tokenization and consume through the matching terminator line opaquely (the same "opaque region" discipline already used for `$(...)` and backticks), with a test pinning `cat <<EOF\nbacklog list\nEOF` → null.

### AUDIT-20260618-27 — `redirectFor` and `validateRegistry` don't guard interface integrity

Finding-ID: AUDIT-20260618-27
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/registry.ts:113-122 (redirectFor) and 124-149 (validateRegistry)

Two related gaps in the registry's invariant surface. (1) `redirectFor` derives the message from `cap.interface` with `cap.interface.map(d => '/'+d).join(' or ')`; on an empty interface this silently produces "Use  instead" with a dangling space. `validateRegistry` does reject empty interfaces, but `redirectFor` is a public export with no precondition check of its own — a caller that builds a `Capability` ad hoc (as the test at registry.test.ts:178-185 does) and forgets `interface` gets a malformed refusal rather than a loud error, contrary to the project's fail-loud guideline. (2) `validateRegistry` enforces uniqueness of `id`, skill identity, and cliArgv0 identity, but **not** interface uniqueness — two capabilities could declare the same `interface: ['stack-control:x']` and the registry would validate clean, yielding ambiguous redirects. Neither is a correctness defect for the v1 data (which is well-formed), so blast radius is low; both are robustness gaps that would only bite a future hand-edited registry entry. A fix: have `redirectFor` throw on empty interface, and add an interface-collision check to `validateRegistry` if front doors are meant to be 1:1 with capabilities.

### AUDIT-20260618-28 — research.md adds `defer` as a PreToolUse permissionDecision value without verification

Finding-ID: AUDIT-20260618-28
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/026-capability-interface-mediation/research.md (D3 spike result, "Deny contract" bullet: ``permissionDecision ∈ `allow|deny|ask|defer` ``)

The spike result states the PreToolUse `permissionDecision` enum is `allow|deny|ask|defer`. The Claude Code hooks documentation I'm aware of documents `allow|deny|ask` for `permissionDecision`; `defer` is not a value I can corroborate. Per the project's own `feedback_verify_reviewer_constraints` discipline and "read documentation before quoting commands," a runtime-enum claim quoted into a spec that an unattended agent will build T015's adapter from should be traceable to the live docs, not paraphrased. Blast radius is low because T015's adapter only emits `deny` (the one value that is certainly valid), so the implementation is unaffected even if `defer` is spurious — but a spec that lists a non-existent enum value invites a future agent to wire a `defer` branch that the hook contract won't honor. Worth a one-line confirmation against https://code.claude.com/docs/en/hooks.md before T015 relies on it.

### AUDIT-20260618-29 — v1 registry omits several `speckit-*` backend skills — confirm the mediation gap is intentional

Finding-ID: AUDIT-20260618-29
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/capability/registry.ts:38-72 (CAPABILITY_REGISTRY capabilities)

The registry fronts `speckit-specify/clarify/plan/checklist/tasks/analyze` (spec-definition) and `speckit-implement` (spec-execution), but the available backend skill set also includes `speckit-constitution`, `speckit-taskstoissues`, and `speckit-agent-context-update`, which appear in no capability. Because mediation is membership-based (`findCapabilityByIdentity` returns null → permit), these skills are silently *not* mediated — a raw `speckit-constitution` invocation passes straight through. That may be entirely correct (they may have no sanctioned front door and are meant to be called directly), and the registry comment explicitly scopes scope-discovery/audit-barrage/roadmap as out-of-invariant operator tools. This is informational, not a defect: I'm surfacing it so the operator confirms the omission is a deliberate v1 boundary (per registry-schema.md § v1 contents) rather than a missed surface. Note also the registry test "v1 backend identities match registry-schema.md" (registry.test.ts:154-176) uses `toContain`/`arrayContaining`, so it asserts the listed skills are *present* but would not catch an unexpected extra or a missing-by-omission skill — the test can't be the guard for completeness here.

### AUDIT-20260618-30 — Leading redirections can hide a backend invocation

Finding-ID: AUDIT-20260618-30
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:203-241

`argv0OfTokens()` skips assignments, reserved words, wrappers, and group openers, but it does not skip shell redirections that legally precede a simple command. A command such as `>out backlog list` or `2>/tmp/err backlog capture x` executes `backlog`, but this parser returns the redirection token as argv0 and `matchCapability()` permits the invocation.

The blast radius is high because this is a reachable Bash mediation bypass: a downstream interceptor using this code would fail to refuse raw backend calls in ordinary shell syntax. A reasonable fix is to recognize leading redirection operators/forms (`>file`, `2>file`, `>>`, `<`, `2>&1`, etc.) and consume any required target token before resolving the executable.

### AUDIT-20260618-31 — Function definitions named like backends are falsely refused

Finding-ID: AUDIT-20260618-31
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:57-60, src/capability/identity.ts:217-219

The parser treats `function` as a transparent reserved word, so `function backlog { ... }` normalizes to `backlog` and is treated as a raw backend invocation. That shell form defines a function; it does not run the backend. This violates the SC-003 “argv0 only, no false refusal” intent for a command name appearing in a declaration position.

The blast radius is medium: it does not allow bypassing mediation, but it can block legitimate shell setup commands and create noisy refusals in scripts. The fix should special-case function definitions so `function <name> ...` and similar declaration forms do not resolve `<name>` as an invoked executable.

### AUDIT-20260618-32 — Research marks live-hook behavior as confirmed before live validation

Finding-ID: AUDIT-20260618-32
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/026-capability-interface-mediation/research.md:44-51

Line 44 states the skill payload behavior is “confirmed” while also saying the live capture has not happened, and lines 50-51 move the real proof to T015/T018. The note is careful about the boundary, but the heading-level claim is stronger than the evidence. Since this document drives unattended implementation, an agent can reasonably treat the Skill matcher and payload shape as settled and build against docs-only assumptions.

The blast radius is medium because the text does name the needed live gate, so a careful consumer can recover the intended reading. The safer fix is to phrase the D3 result as docs-confirmed but live-unverified, and keep the T015/T018 acceptance check as a hard requirement before considering skill mediation complete.

## 2026-06-18 — audit-barrage lift (20260618T021106355Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-33 — `&`-adjacent redirection operators split into spurious commands → false over-match (no backstop)

Finding-ID: AUDIT-20260618-33 (claude-01 + codex-01; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=high
Decision:   agreement (gate-counted medium)
Surface:    src/capability/identity.ts — `parseCommands`, the unquoted separator branch `if (ch === ';' || ch === '|' || ch === '&') { flushCmd(); }`

`parseCommands` treats every unquoted `&` as a command separator. But `&` is also part of the redirection operators `>&`, `&>`, and `2>&1`. When a redirect targets a *file named like a backend*, the `&` fragments the redirection and promotes the target into a standalone "command", which `argv0sOf` then reports as an invocation. Traced examples: `mycmd >&backlog` parses to commands `[['mycmd','>'], ['backlog']]` → `argv0sOf` = `['mycmd','backlog']` → `matchCapability(reg,'bash',...)` returns the `backlog` capability and **falsely refuses a legitimate redirection**. Same for `mycmd >& backlog`. (Note `mycmd &>backlog` and `echo hi 2>backlog` stay attached and are correctly *not* matched — it is specifically the `&`-adjacent-with-following-token forms that break.)

This is the worst failure direction by the round-4 framing baked into the test file itself ("over-matching has no backstop and blocks legitimate work"). Round 4 closed the heredoc-body and function-definition over-match classes but did not cover `&`-in-redirection. Blast radius today is bounded because `backlog` is the only `cliArgv0` identity, so the colliding target must be literally named `backlog`. It widens under FR-011: the moment a future registry entry adds a common executable name (e.g. `make`, `git`) to `cliArgv0`, `cmd >& make` false-refuses. A reasonable fix: recognize `>&`/`&>`/`>&-`/`fd>&fd` redirection operators during tokenization (don't split on `&` when it forms part of a redirection operator), mirroring the existing `REDIRECTION` regex, and add over-match tests `matchCapability(reg,'bash','x >& backlog')` / `'x >&backlog'` → `null`.

---

### AUDIT-20260618-34 — "Complete" shell-indirection limit set omits `eval` and `sh -c`/`zsh -c` (same opaque class as `bash -c`)

Finding-ID: AUDIT-20260618-34
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts — header comment ("EXHAUSTIVE for ordinary command forms"; "the parser's contract is complete + stable") and the round-3/round-4 test blocks in src/__tests__/capability/identity.test.ts

The header comment and the round-3 test prose claim the parser is "EXHAUSTIVE for ordinary command forms" with a "complete + stable" indirection limit set enumerated as `bash -c`, `$(...)`, backticks, `<()`/`>()`, and `env -S`. But `eval backlog list`, `sh -c 'backlog'`, and `zsh -c 'backlog'` are equally ordinary shell forms that hide the backend inside an argument string — `eval` and `sh`/`zsh` are not in `WRAPPERS`, so `argv0OfTokens` returns `eval`/`sh`/`zsh` and the real `backlog` invocation is under-matched. These are under-match (the US3 graduate-gate backstop covers them, same as `bash -c`), so the runtime risk is contained — but the documented boundary overstates completeness. The honest-boundary discipline in this code is otherwise good; the fix is small: add `eval` and `sh -c`/`zsh -c` to the pinned opaque-indirection test set (`expect(matchCapability(reg,'bash',"eval backlog list")).toBeNull()` etc.) so the FR-017 limit class is genuinely enumerated rather than claimed-complete-while-incomplete.

---

### AUDIT-20260618-35 — Test names hard-code ephemeral audit-run finding IDs, coupling the suite to audit history

Finding-ID: AUDIT-20260618-35
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/capability/identity.test.ts (e.g. `describe('compound commands … (026 P2 audit HIGH-1)')`, `// AUDIT-BARRAGE-codex-01 / claude-01 (HIGH)`) and registry.test.ts (`// AUDIT-BARRAGE-claude-03 (LOW)`)

The test descriptions and comments embed prior audit-barrage finding IDs (`AUDIT-BARRAGE-codex-01`, `claude-01`, severities `HIGH`/`MED`/`LOW`) and round numbers ("convergence round 2/3/4"). These IDs are run-scoped artifacts of a *previous* audit barrage, not durable contract names — a future reader cannot resolve `codex-02 (MED)` to anything, and the severities are frozen at whatever the prior triage assigned. The behavioral assertions themselves are sound and valuable; only the labels are debt. This is the same shape as a stale `// TODO: F5` comment the project's own `agent-discipline.md` warns against — a self-referential breadcrumb that rots. Prefer naming each test by the *invariant it pins* ("a backend after `&&`/`;`/`|` is matched"), and if provenance must be retained, link a durable audit-log entry rather than an in-run finding ID. Non-blocking; flagging so the convention doesn't propagate to later phases (the interceptor adapters T010/T015 are still to come).

---

Two surfaces I checked that came back **clean**: (1) `registry.ts` `validateRegistry` — id/skill/argv0/interface collision branches are symmetric and each has a failing-fixture test, `redirectFor` correctly throws on empty interface (fail-loud, not a dangling message), and the single-source non-drift test exercises both directions (decision consumer resolves exactly what discovery lists, and nothing outside it). (2) The `research.md` D3 addition is appropriately hedged — it labels the skill-name-in-payload claim "docs-derived (NOT yet live-verified)", mandates a T015/T018 live-firing acceptance gate for the one conclusion that diverges from D2, and correctly requires the `hooks.json` Skill matcher be *generated from* `CAPABILITY_REGISTRY` rather than hand-maintained (closing the silent-drift hole where adding a backend leaves the hook blind). No contradiction between that section and the registry's skill-identity set.

The strongest signal for triage is **claude-01** (the `>&`/`&>` over-match) — it's the one defect that produces wrong runtime behavior with no backstop, and it sits squarely in the failure direction round 4 set out to eliminate.

### AUDIT-20260618-36 — Reserved-word skipping falsely treats loop/case operands as commands

Finding-ID: AUDIT-20260618-36
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:62-66, src/capability/identity.ts:292-294

`argv0OfTokens()` skips reserved words uniformly, so syntax where the next word is not an executable can be falsely refused. For example, `for backlog in *.md; do echo "$backlog"; done` skips `for` and resolves `backlog` as argv0, even though it is a loop variable. `case backlog in ...` has the same shape.

This blocks legitimate shell scripts that use a backend name as data, with no downstream backstop because over-matching denies the operation. The fix needs syntax-aware handling for reserved words whose following token is not a command position, especially `for NAME in` and `case WORD in`, rather than treating all reserved words as transparent prefixes.

### AUDIT-20260618-37 — Heredoc delimiters with non-word characters can swallow later commands

Finding-ID: AUDIT-20260618-37
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:96-108, src/capability/identity.ts:111-122, src/capability/identity.ts:251-253

`readHeredocOpener()` only reads unquoted delimiters made of `[A-Za-z0-9_]`. Shell heredoc delimiters can contain other nonblank, non-operator characters, such as `END-1`. For `cat <<END-1\n...\nEND-1\nbacklog list`, the parser records delimiter `END`, never finds it, and `skipHeredocBody()` consumes the rest of the script, including the real backend invocation after the heredoc.

That is a reachable under-match in the Bash mediation surface. The delimiter reader should capture the full shell word delimiter, applying quote removal where needed, so the heredoc body ends at the actual terminator and subsequent commands are still checked.

## 2026-06-18 — audit-barrage lift (20260618T021844008Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-38 — Single-token grouped command `(backlog)` under-matches — trailing `)`/`}` is never stripped from the executable token

Finding-ID: AUDIT-20260618-38
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:298-307 (`argv0OfTokens` leading-paren strip) + parseCommands (no `(`/`)`/`{`/`}` tokenization)

`argv0OfTokens` strips a *leading* `(`/`{` (`tok.replace(/^[({]+/, '')`), but nothing strips a *trailing* `)`/`}`. `parseCommands` also never treats `)`/`}` as token separators — they accumulate into the current token. The tested cases pass only because a space or `;` leaves the executable token clean: `(backlog list)` tokenizes as `['(backlog','list)']` so argv0 `(backlog` → strips to `backlog`; `{ backlog; }` splits on `;` so `backlog` is clean.

But a single-command subshell with no inner separator — `(backlog)` — tokenizes as the one token `(backlog)`; the leading strip yields `backlog)`, and `basename('backlog)')` returns `backlog)`, which is not in `cliArgv0` → `matchCapability` returns `null`. `(backlog)` / `(backlog add x)`-without-other-tokens is an ordinary, valid subshell invocation, and the round-2 test block claims "strips a leading subshell/group paren" as a handled ordinary form. This is a real under-match against a form the code says it covers. Blast radius is bounded (it's an under-match, so the US3 graduate-gate backstop per FR-015 still catches the bypassed work), which is why this is medium not high — but it contradicts the "exhaustive for ordinary command forms" contract in the file header. A fix: tokenize `(`/`)`/`{`/`}` as boundaries in `parseCommands`, or strip a trailing `)`/`}` in `argv0OfTokens` symmetric to the leading strip, with a `(backlog)` regression test.

---

### AUDIT-20260618-39 — Variable-expanded command names (`X=backlog; $X list`) bypass mediation and are absent from the documented FR-017 limit set

Finding-ID: AUDIT-20260618-39
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts:14-30 (header "Accepted limitation" enumeration) + argv0OfTokens

The header enumerates the FR-017 indirection limit class explicitly: `bash -c`/`sh -c`/`zsh -c`, `eval`, `$(...)`, backticks, `<(...)`/`>(...)`, `env -S`. Variable-expanded command names are *not* in that list and are not tested. `BL=backlog` tokenizes as an assignment (skipped), and a later `$BL list` resolves `basename('$BL')` → `$BL`, not in the registry → permit. This is a clean bypass via ordinary shell (`X=backlog; $X capture y`).

The blast radius is low: it's an under-match, so the US3 backstop is the real guarantee (the file says so repeatedly), and variable indirection is arguably "indirection." But the limit-class enumeration is presented as *complete* ("the documented indirection limit"), and an operator/agent reading "exhaustive for ordinary command forms" plus that closed list would reasonably believe `$X` is covered. The honest fix is one line: add variable/parameter expansion (`$X`, `${X}`) to the documented limit class and pin it with a test, the same way `eval`/`env -S` were pinned in rounds 3/5 — so the limit set is actually complete rather than appearing complete.

---

### AUDIT-20260618-40 — `$(...)` opaque-depth counting is not quote-aware; the comment's "never mis-splits around them" is overstated

Finding-ID: AUDIT-20260618-40
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts:201-208 (substDepth `(`/`)` counting) + comment at 173-181

Inside command substitution the parser counts literal `(`/`)` to track `substDepth` with no quote-awareness (line 205-206: `if (ch === '(') substDepth++; else if (ch === ')') substDepth--`). A `)` inside a quoted string within the substitution closes the substitution early: `$(grep ')' file)` decrements `substDepth` to 0 at the quoted `)`, leaving the trailing real `)` and any following text parsed outside substitution context. The header comment (line 178-180) and round-2 test block assert the parser "treats `$(...)`/backticks opaquely and never mis-splits around any of them" — that claim does not hold when the substitution body contains a quoted close-paren.

Severity is low: this only perturbs the argv0 of commands *around* a pathological substitution (e.g. a literal `;`/`&&` surfacing after a fake-close), it's deep in documented best-effort indirection territory, and the backstop covers any resulting under-match. The defect here is primarily the overclaiming comment — either soften "never mis-splits" to "best-effort; quoted close-parens inside `$(...)` may mis-track depth," or make the substitution scan honor single/double quotes.

---

### AUDIT-20260618-41 — `validateRegistry` is never invoked at module load — single-source integrity relies on the test suite alone

Finding-ID: AUDIT-20260618-41
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/registry.ts:118-157 (`validateRegistry`) + CAPABILITY_REGISTRY export (38-72)

`validateRegistry` is pure and thorough, but in this diff it is called only from `registry.test.ts`. Nothing guards `CAPABILITY_REGISTRY` at import time. The module comment promises "ONE source / many consumers → non-drift" and FR-011 promises "adding a backend is a registry entry, not new adapter code," but those guarantees are enforced only if the test suite runs. A future edit that introduces a duplicate `cliArgv0`/skill identity or an empty interface would ship a registry whose `redirectFor` throws at runtime (line 105) or whose `findCapabilityByIdentity` returns the wrong owner — caught only by a test someone has to run.

This is low because the v1 registry is a static literal that currently passes validation, so there's no live defect today. But per the project's "fail loud, no silent integrity gaps" posture, a one-time assertion at module load (`const v = validateRegistry(CAPABILITY_REGISTRY); if (v.length) throw …`) would make the single-source invariant self-enforcing rather than test-dependent. The research note even says validation is "available to any consumer that wants to fail loud" — but no consumer does.

---

### AUDIT-20260618-42 — Commit subject claims "Phase 1 setup (T001)" but the diff contains T003–T006 plus five rounds of parser audit-hardening

Finding-ID: AUDIT-20260618-42
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    (commit range vs working-tree diff) — src/capability/*, src/__tests__/capability/*

The audited range names one commit, `6f290ab6 … 026 Phase 1 setup — capability module + shared fixture (T001)`, but the diff under review includes the full registry (T004), identity matcher (T006), both RED test files (T003/T005), and five sequential rounds of Phase-2 audit hardening embedded as test blocks ("convergence round 2…5"). The git status shows `src/capability/` and `src/__tests__/capability/` as untracked, so this is uncommitted working-tree work spanning well beyond T001.

No code defect — flagging for traceability. When this lands, the commit boundaries should reflect the actual task scope (T003/T004/T005/T006 + the audit-convergence rounds) rather than being attributed to T001 setup, so a future reader auditing "what changed in T001" gets an accurate answer. The five embedded audit rounds reading as in-code narrative is otherwise a strong, well-documented convergence trail.

---

**Cross-model note for triage:** I checked the over-match (false-refusal) classes the operator most cares about — heredoc bodies, function definitions, loop/case headers, redirection targets, `command -v` lookups, assignments — and they are correctly handled and tested. My one correctness finding (`-01`) and the indirection findings (`-02`, `-03`) are all under-match classes, which this design deliberately bounds with the US3 graduate-gate backstop; I rated them accordingly rather than by alarm. If a sibling model surfaces a *false-refusal* form I missed, weight that above all of mine — over-match has no backstop and blocks legitimate work.

### AUDIT-20260618-43 — Heredoc tab stripping is applied to all heredocs, not only `<<-`

Finding-ID: AUDIT-20260618-43
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:93-130

`readHeredocOpener` notices `<<-` at line 97, but only returns `{ delim, next }`; `skipHeredocBody` then strips leading tabs unconditionally at line 128. In shell semantics, leading tabs are ignored only for `<<-`, not plain `<<`. As written, a plain heredoc containing a tab-prefixed delimiter-looking line can terminate early in the parser, causing later heredoc body lines containing `backlog` to be treated as executable commands and refused.

Blast radius is medium because this is a false-refusal class: it blocks legitimate Bash input that only contains backend text as heredoc data. A reasonable fix is to carry a `stripTabs` boolean from the opener and only apply `replace(/^\t+/, '')` when the opener was `<<-`, with tests for both `<<EOF` and `<<-EOF`.

### AUDIT-20260618-44 — Function bodies are parsed as live invocations

Finding-ID: AUDIT-20260618-44
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:146-288 and src/__tests__/capability/identity.test.ts:262-266

The tests only cover function definitions whose name is a backend (`function backlog { :; }`, `backlog() { echo hi; }`). The parser does not track function-definition bodies, so `foo() { :; backlog list; }` is split at the semicolon and the body command `backlog` is matched even though defining the function is not invoking it.

Blast radius is medium because this creates another false refusal in ordinary shell syntax, and over-matching has no graduation backstop. The fix should either recognize function-definition bodies and skip them until the matching closing brace, or explicitly define function-body scanning as intended and update the tests/docs accordingly.

## 2026-06-18 — audit-barrage lift (20260618T022851958Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-45 — `<<<` here-string is mis-parsed as a heredoc and swallows every subsequent command (mediation under-match)

Finding-ID: AUDIT-20260618-45
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:`readHeredocOpener` (the `<<<` guard) + `parseCommands` heredoc branch (~lines 200–230, 320–340)

`readHeredocOpener` guards against here-strings with `if (command[j] === '<') return null; // <<< is a here-STRING`. But the guard only fires on the **first** `<` of `<<<`. `parseCommands` advances one char at a time, so after the first `<` falls through to the generic `cur += ch` path, the **second** `<` re-triggers the `ch === '<' && command[i+1] === '<'` branch — and at that shifted position `readHeredocOpener` sees `<<` followed by a normal word, so it parses a heredoc whose delimiter is the here-string's word.

Trace `read x <<< foo\nbacklog list`: the parser sets `pendingHeredoc = 'foo'`, then at the newline calls `skipHeredocBody(...,'foo',...)`. No later line equals `foo`, so it skips to EOF — **`backlog list` is consumed as heredoc body and never scanned.** `argv0sOf` returns only `['read']`; a raw `backlog` invocation after a here-string line escapes mediation entirely. This is worse than the documented opaque-indirection limits (which hide only the backend inside the substitution): a single `<<<` line disables Bash-surface mediation for the rest of a multi-line script. Here-strings are ordinary shell, and closing exactly this class of invocation-time bypass is what rounds 1–6 were for. There is no test for `<<<` (it appears only in the regex/guard), so it shipped silently. The US3 graduate-gate backstop mitigates at graduation but not at invocation. Fix: detect `<<<` before the heredoc branch (consume it as a here-STRING redirection operator + its word operand, like other redirections) so the third `<` can't be re-read as a fresh `<<`, and add a pinning test (`cat <<< x\nbacklog list` → `['cat','backlog']`).

---

### AUDIT-20260618-46 — Stacked heredocs on one line lose all but the last delimiter

Finding-ID: AUDIT-20260618-46
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts:`parseCommands` (`pendingHeredoc` is a single string, ~line 215)

`pendingHeredoc`/`pendingHeredocStrip` hold a single delimiter, but bash allows stacked heredocs (`cat <<A <<B`). The second opener overwrites the first (`pendingHeredoc = opener.delim`), so only `B`'s delimiter is used; the body-skip then runs until the `B` line, mis-bounding `A`'s body. A real command sitting between the `A` and `B` delimiter lines would be swallowed (under-match). This is exotic and the body-skip direction is the safe one (avoids over-match/false-refusal), so impact is low — but stacked heredocs are not in the documented FR-017 limit set, so the contract is silently incomplete here. Either track a stack of pending delimiters or pin stacked heredocs into the documented limit class with a test.

---

### AUDIT-20260618-47 — `normalizeArgv0` is an exported first-command-only primitive that reopens the compound-command bypass if used for mediation

Finding-ID: AUDIT-20260618-47
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts:`normalizeArgv0` (export) vs `argv0sOf`/`matchCapability`

`normalizeArgv0` returns only `parseCommands(command)[0]`'s argv0. `matchCapability` correctly uses `argv0sOf` (every simple command), which is the HIGH-1 fix. But `normalizeArgv0` is exported with the same naming gravity, and any future interceptor adapter that reaches for "normalize the argv0 of this command" would pick it and silently reintroduce the `true && backlog` compound-command bypass that round 1 closed. The docstring notes "Per-command primitive; `argv0sOf` covers compound lines," which helps, but an exported footgun whose misuse is a security regression is worth narrowing: either don't export it (it's only consumed by tests) or rename/annotate it so it can't be mistaken for the mediation entry point.

---

### AUDIT-20260618-48 — `identity.ts` is at 431 lines with parser complexity concentrated in one ~150-line stateful function

Finding-ID: AUDIT-20260618-48
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts (whole file; `parseCommands`)

The file is 431 lines — inside the 300–500 cap but trending toward it after six rounds of fix-induced growth, and the project rule asks to refactor anything past 300–500. More notable than raw size: `parseCommands` is a single ~150-line character-state machine (single/double-quote, `$()` depth with its own nested quote state, backtick, heredoc opener/body, redirection-vs-separator `&` disambiguation). Each audit round bolts another concern onto it, which is exactly the surface where the `<<<` bug (claude-01) hid. Consider extracting the tokenizer (quote/subst/heredoc scanning) from the command-splitter so each can be tested and reasoned about independently before the next indirection form is added.

---

### AUDIT-20260618-49 — Commit subject "T001 setup" understates a full registry + parser + six audit rounds in one change

Finding-ID: AUDIT-20260618-49
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    commit 6f290ab6 "026 Phase 1 setup — capability module + shared fixture (T001)" vs the audited diff

The single in-range commit is labeled as T001 setup, but the diff contains the registry (T004), its tests (T003), identity matching (T006) and tests (T005), the decision/discovery consumers (T010/T020), and six rounds of cross-model audit hardening with multiple HIGH fixes. This collides with the project's "one fix per commit / the commit message describes what was actually verified" discipline and makes the history un-auditable: a reviewer reading the log sees "setup" and cannot see that load-bearing parser-security fixes landed here. Informational because it's hygiene, not a code defect — but the `<<<` gap surviving undetected is the kind of thing per-round commits would have made visible.

---

Summary for triage: **claude-01 (`<<<` command swallowing) is the load-bearing finding** — a real, untested, ordinary-syntax mediation under-match in the same class the feature spent six rounds closing. The rest are low/informational. I specifically verified the compound-command (`&&`/`;`/`|`), wrapper-arity (`sudo -u`/`timeout`/`xargs`), `--` end-of-options, leading-redirection, subshell/group, `command -v` lookup, heredoc tab-strip (`<<-` vs `<<`), and quote-aware `$()` paths against their tests and found them correct; the `<<<` here-string is the one ordinary form with no test and a genuine defect.

### AUDIT-20260618-50 — Case bodies can hide backend invocations

Finding-ID: AUDIT-20260618-50
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:72-79

`case` is classified as a header word, and `argv0OfTokens` returns `null` for any simple command whose first token is a header word at `src/capability/identity.ts:355-358`. But the parser never splits on `)` at `src/capability/identity.ts:316-318`, so a real case body like `case x in *) backlog list;; esac` remains in the same parsed command segment that starts with `case`. The result is that the backend invocation is never checked.

The test at `src/__tests__/capability/identity.test.ts:293-299` covers a false-refusal case header and a `for` body, but it does not cover a real `case` body invocation. This is a high-severity mediation bypass because a downstream user can invoke a fronted backend through ordinary shell syntax and avoid the interceptor. A reasonable fix is to teach the parser enough case syntax to split/check commands after pattern terminators, or explicitly reject/scan case constructs conservatively.

### AUDIT-20260618-51 — Function bodies can be falsely refused

Finding-ID: AUDIT-20260618-51
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:15-27

The file documents backend names inside function-definition bodies as an accepted under-match class at `src/capability/identity.ts:15-27`, but the parser actually splits function bodies on semicolons at `src/capability/identity.ts:316-318` without tracking function-definition state. A definition like `foo() { echo hi; backlog list; }` would parse a later simple command beginning with `backlog`, and `matchCapability` would refuse it even though defining a function does not invoke the backend.

The tests only cover definitions named like the backend at `src/__tests__/capability/identity.test.ts:262-266`, while `src/__tests__/capability/identity.test.ts:314-317` acknowledges body handling as residual without a behavioral assertion. Blast radius is medium: it blocks legitimate shell setup commands and has no backstop, but it does not let mediated work bypass the interface. A reasonable fix is to either parse function definitions as opaque until the matching closing brace, or add a focused guard/test for function-definition bodies containing semicolon-separated backend commands.

## 2026-06-18 — audit-barrage lift (20260618T024950589Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-52 — Two live sources of the fronted-skill identity set (registry vs refusal.ts) — the exact drift the registry exists to kill

Finding-ID: AUDIT-20260618-52
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/registry.ts:1-9, :42-72  vs  src/speckit-wrapper/refusal.ts:16 (WRAPPED_SKILLS)

```
`registry.ts` advertises itself as "the single declarative source" whose whole reason for existing is FR-011 single-source non-drift, and its header says it "Generalizes refusal.ts's WRAPPED_SKILLS + frontDoorsFor". But the diff does **not** retire or re-point `refusal.ts` — that file still carries its own live `WRAPPED_SKILLS` array, and the new registry does not import from it. The fronted-skill set now exists in two independent places; "Generalizes" implies a migration this diff didn't perform.

Blast radius: today nothing consumes the new registry (verified: zero consumers outside tests), so there's no active drift — the danger is deferred to integration. Once the interceptor reads the registry while `refusal.ts` keeps its own list, adding a skill backend becomes a two-place edit; updating only `CAPABILITY_REGISTRY` would silently leave the guard refusing a *different* set than discovery lists. This is exactly the failure mode `research.md`'s own "claude-04 single-source guard" note worries about for the `hooks.json` matcher — but unaddressed for the `refusal.ts` source. Fix: make `refusal.ts` derive from `CAPABILITY_REGISTRY`, or file the retirement explicitly so the "single source" claim is true rather than aspirational.

### AUDIT-20260618-53 — identity.ts header misclassifies the function-definition-body over-match as "under-matched", implying a backstop that doesn't exist

Finding-ID: AUDIT-20260618-53 (claude-02 + codex-02; cross-model)
Status:     open
Severity:   medium
Per-lane:   claude=medium, codex=medium
Decision:   agreement (gate-counted medium)
Surface:    src/capability/identity.ts:28-37 (header limit-set comment)

```
The header lumps "a backend named inside a function-definition BODY (`foo() { …; backlog; }`)" into the set it calls "under-matched … The US3 graduate-gate backstop … is the real guarantee for them." But that case is an **over-match (false refusal)**: tracing the parser, `foo() { echo hi; backlog list; }` splits on `;`, and the `backlog list` segment's `argv0OfTokens` returns `backlog`, so the *definition* is refused as an *invocation*. The diff's own round-4 comment states over-matching "has no backstop and blocks legitimate work" — the opposite direction. task-162 in the backlog names this exact form as an over-match.

Blast radius: a maintainer reading this comment will believe US3 covers the function-def-body case when it blocks legitimate work with no backstop. The `case`-pattern-body item listed alongside it genuinely *is* under-matched (I verified a `case … in` segment short-circuits to `null` via `HEADER_WORDS`), so the two shouldn't share one direction. Fix: move the function-def-body item into the over-match residual class, cross-ref task-162, and correct the backstop claim.

### AUDIT-20260618-54 — `validateRegistry` is enforced only in tests; no consumer runs it

Finding-ID: AUDIT-20260618-54
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/registry.ts:116-156

```
The comment says `validateRegistry` is "available to any consumer that wants to fail loud on a bad registry," but only `registry.test.ts` calls it. Since `CAPABILITY_REGISTRY` is a compile-time `const`, the CI test catches literal drift today, so risk is low now. Forward-looking: the registry's own comment anticipates becoming data-driven ("addable later as entries") — at that point the invariants are only checked if some runtime boundary calls `validateRegistry`, and none does. Worth wiring one-time validation at the eventual registry-load boundary, or annotating the deferral.

### AUDIT-20260618-55 — `normalizeArgv0` is a public export that inspects only the first command — a decision-path footgun

Finding-ID: AUDIT-20260618-55
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/identity.ts:404-409 vs :413-420

```
`normalizeArgv0` returns only the first simple command's `argv[0]`, while `matchCapability` correctly iterates `argv0sOf` precisely because checking only the first command is the audited HIGH-1 bypass (`true && backlog list`). It's exported at the same visibility as the safe primitive, and its name reads like "the identity of this command" — a future adapter author grabbing it for a decision path reintroduces the non-leading-position bypass. Documented, currently test-only, hence low; consider renaming (`firstArgv0`) or not exporting it from the decision surface.

### AUDIT-20260618-56 — Test labeled "round 7" lives inside the "round 6" describe block

Finding-ID: AUDIT-20260618-56
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/capability/identity.test.ts (the `<<<` here-string it() inside describe('… convergence round 6 …'))

```
The final `it('treats `<<<` as a here-string …')` is commented `// claude-01 (HIGH, round 7)` but sits in the `round 6` block. Round labeling is the traceability spine of this file; an off-by-one degrades the audit trail. Cosmetic — move it to a `round 7` block or fix the comment.

---

**Checked clean:** I traced the parser across compound separators, `&`-adjacent redirections (`2>&1`, `>&backlog`), quote-aware `$()`/backtick opacity (incl. quoted `)` inside `$()`), heredoc `<<-` tab-strip vs exact-column `<<`, `<<<` here-strings, backslash-newline continuations, leading reserved words, `for`/`case` operands, wrapper flag-arity (`sudo -u root`, `timeout -s KILL 30`, attached `-oL`), `--` end-of-options, subshell stripping (`(backlog)` vs `backlog()`), and escapes (`\backlog` → `backlog`). All match the tests; I found no crash, infinite loop, or new false-positive/negative beyond the documented-and-filed function-def-body over-match. The `research.md` D3 note is appropriately hedged as docs-derived with a mandated live gate. The strongest signals for triage are **-01** and **-02** — both about the registry/parser meeting their own stated invariants at integration time.

### AUDIT-20260618-57 — Registered wrappers can hide the backend behind unmodeled value flags

Finding-ID: AUDIT-20260618-57
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:46-58, src/capability/identity.ts:377-391

`argv0OfTokens` treats every entry in `WRAPPERS` as transparent, but only consumes value arguments for flags listed exactly in each wrapper’s `valueFlags`. That makes ordinary value-taking options a mediation bypass when the flag is omitted from the table. For example, Bash `exec -a fake backlog list` invokes `backlog`, but `exec` is registered with no value flags at line 56, so the parser consumes `-a`, treats `fake` as the executable identity, and never checks `backlog`.

The same shape applies to other registered wrappers with long or alternate value flags not modeled in lines 46-58. The blast radius is high because an adopter can reach a fronted backend through ordinary shell syntax while the mediation layer returns permit. A reasonable repair is to either model each transparent wrapper’s value-taking options conservatively and add bypass tests, or remove wrappers whose option grammar is not covered enough to preserve the mediation invariant.

## 2026-06-18 — audit-barrage lift (20260618T031942684Z-026-capability-interface-mediation-phase-3)

### AUDIT-20260618-58 — Skill-surface PreToolUse matcher matches skill names, not the `Skill` tool — contradicts the contract; the hook likely never fires

Finding-ID: AUDIT-20260618-58
Status:     open
Severity:   blocking
Per-lane:   claude=blocking
Decision:   single-model (gate-counted blocking)
Surface:    hooks/hooks.json:13-21; cross-checked against specs/026-capability-interface-mediation/contracts/interceptor-hook.md:14, src/subcommands/intercept.ts, src/capability/intercept.ts:interceptDecision

The shipped `hooks/hooks.json` registers the second PreToolUse entry with `"matcher": "^(speckit-analyze|speckit-checklist|speckit-clarify|speckit-implement|speckit-plan|speckit-specify|speckit-tasks)$"` — a regex of **skill names**. The feature's own contract (`interceptor-hook.md:14`) specifies `"matcher": "Skill"` — the **tool name** — exactly paralleling the Bash entry's `"matcher": "Bash"`. PreToolUse matchers are evaluated against the *tool name*; a skill invocation's tool name is `Skill`, which does not match `^(speckit-…)$`. If that semantics holds (and the Bash entry plus the contract both assume it does), the Skill-surface hook **never fires**, so raw `/speckit-implement`, `/speckit-specify`, etc. are never intercepted — the central goal of the feature for the spec-definition/spec-execution capabilities silently does nothing.

The internal inconsistency is the tell: `interceptDecision` (src/capability/intercept.ts) branches on `toolName === 'Skill'` and reads `tool_input.skill_name`, which only makes sense if the payload `tool_name` is `Skill` and the matcher is `"Skill"`. The shipped regex-matcher is therefore both (a) wrong against the runtime and (b) self-contradictory with the decision core that consumes it. Blast radius: an adopter installs the plugin believing speckit reach-arounds are refused; they are not, and nothing surfaces the gap because the hook is simply inert. Fix: set the Skill matcher to `"Skill"` (per the contract) and let `interceptDecision`'s existing `skill_name` narrowing do the filtering.

---

### AUDIT-20260618-59 — The matcher-drift test enshrines the broken matcher, giving false confidence

Finding-ID: AUDIT-20260618-59
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/__tests__/capability/intercept.test.ts (describe 'hooks.json ↔ registry'); src/capability/intercept.ts:skillMatcherPattern

`skillMatcherPattern` returns `^(${skills.join('|')})$`, and the test asserts the shipped `hooks.json` matcher equals it. This test passes precisely *because* the implementation and the test share the same wrong model (matcher = skill-name regex). The test's name claims it verifies "no drift" against the registry, but it does not verify the property that actually matters — that the matcher fires for the `Skill` tool. It tests the mechanism the author imagined, not the contract (`interceptor-hook.md` says `"matcher": "Skill"`). This is the "test that doesn't test the contract it claims" trap: it underwrites the AUDIT-BARRAGE-claude-01 defect with green CI. A correct test would assert the matcher is `"Skill"` and add an integration-style check that a `Skill`-tool payload with `skill_name: 'speckit-implement'` reaches a refuse decision end-to-end through the adapter, not just through `interceptDecision` in isolation.

---

### AUDIT-20260618-60 — Marker mechanism hinges on `$CLAUDE_CODE_SESSION_ID` equaling the hook payload's `session_id` — unverified, untested, and fatal if wrong

Finding-ID: AUDIT-20260618-60
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    skills/{define,extend,execute,backlog}/SKILL.md (front-door marker blocks); src/subcommands/intercept.ts:resolveActive; src/capability/marker.ts

Every sanctioned drive writes the marker with `--session "$CLAUDE_CODE_SESSION_ID"` (from the skill's Bash env), while the interceptor reads `payload.session_id` (`runIntercept` → `resolveActive(cwd, session)` keyed by `activeCapabilities(root, session)`). The marker is session-keyed (FR-014), so if `$CLAUDE_CODE_SESSION_ID` is not the *exact same string* as the hook payload's `session_id`, `enter` writes `<wrongkey>.json`, the interceptor reads `<payloadkey>.json`, finds nothing, and **refuses the skill's own sanctioned backend call**. The SKILL.md asserts the two are "the same id," but nothing in the diff confirms it: the T002 spike confirmed `tool_input.skill_name`, not the session-id env var, and `CLAUDE_CODE_SESSION_ID` appears only in `.md` files — no source reads or sets it, and no test exercises the round-trip with a real env-derived session id (the `front-door.test.ts` round-trip passes its own literal `'s'` on both sides). If the env var name is wrong or empty, the feature is dead-on-arrival for exactly the surfaces that need the marker. This needs the same throwaway-spike treatment the `skill_name` field got: log the payload `session_id` and the env var in one session and assert equality before trusting it.

---

### AUDIT-20260618-61 — `bin/intercept` pays a Node+tsx cold start on *every* Bash tool call, plugin-wide

Finding-ID: AUDIT-20260618-61
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    bin/intercept:6; hooks/hooks.json:8-13; src/capability/intercept.ts:interceptDecision (pre-filter)

The Bash matcher is `"Bash"`, so `${CLAUDE_PLUGIN_ROOT}/bin/intercept` runs for **every** Bash tool invocation in any session where the plugin is installed — `ls`, `git status`, `echo`, all of them. `bin/intercept` execs `bin/stackctl`, which resolves and boots the tsx runtime. The in-code "cheap pre-filter" (intercept.ts comment: "bounds per-call latency") only short-circuits the *disk marker read*; it cannot avoid the dominant cost, which is the interpreter/tsx process spin-up paid before any TypeScript runs. The result is a fixed latency tax (typically hundreds of ms) on every shell command the agent issues, for a hook that refuses a vanishingly small fraction of them. The comment overstates the mitigation. Worth either a persistent/daemonized check, a fast native pre-filter in the bash shim before invoking node, or at minimum an honest note that per-Bash-call overhead is unbounded by the TS-level pre-filter.

---

### AUDIT-20260618-62 — Marker read-modify-write is atomic-publish but not lost-update-safe; the "concurrent isolate" claim is only tested sequentially

Finding-ID: AUDIT-20260618-62
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/marker.ts:enterFrontDoor (95-110), exitFrontDoor (118-129); src/__tests__/capability/marker.test.ts ('nested entries isolate')

`enterFrontDoor` and `exitFrontDoor` each do read-marker → mutate array → `writeMarkerAtomic` (temp-write + rename). The rename guarantees no *torn* file, but it does **not** guarantee no *lost update*: two `enter` calls that both read the same base file before either renames will each write `[base + own]`, and the later rename wins, dropping the earlier entry. The header comment and `marker.ts:5-8` claim "nested/concurrent front-door drives isolate (one exit cannot clear another — FR-014a)," and the test labeled "nested entries isolate" demonstrates only the *sequential* case (`t1 = enter; t2 = enter;` then exits) — it never exercises two concurrent writers. Same-session parallelism is plausible if parallel sub-agents share a `session_id`. If concurrency is genuinely out of scope, the claim should be narrowed to "sequential nesting"; if in scope, the write needs an O_EXCL lock or compare-and-swap retry. As written, the strongest claim the tests support is weaker than the claim the comments make.

---

### AUDIT-20260618-63 — `STALE_AGE_MS` 12-hour bound can prune an actively-bracketed drive → spurious refusal

Finding-ID: AUDIT-20260618-63
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/capability/marker.ts:21 (STALE_AGE_MS), isFresh (78-81), activeCapabilities (123-131)

The staleness prune (crash-safety: a crashed `enter` cannot leak a permanent marker) uses a fixed 12h bound. A legitimately long-running `enter`-bracketed drive that exceeds 12h between `enter` and the backend call would have its entry treated as stale and ignored, refusing the sanctioned call. The 12h figure is a magic number justified only by a comment ("generous enough for a long interactive session"); it trades two opposite risks (too short → spurious mid-drive refusal; too long → a leaked marker wrongly permits for up to 12h after a crash) with no configurability. Low blast radius because >12h single drives are rare, but the bound being un-tunable and undocumented-as-a-tradeoff is worth a note. Consider deriving it from, or at least cross-referencing, the session lifetime rather than a bare constant.

---

### AUDIT-20260618-64 — `speckit-guard` (a "frozen 025 contract" verb) silently widened its refusal set to three newly-wrapped skills

Finding-ID: AUDIT-20260618-64
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/speckit-wrapper/refusal.ts:WRAPPED_SKILLS (now registry-derived); src/__tests__/speckit-wrapper/wrapper-refusal.test.ts:39

Because `WRAPPED_SKILLS` is now derived from `CAPABILITY_REGISTRY`, `speckit-guard` now refuses `speckit-clarify`, `speckit-checklist`, and `speckit-analyze` in addition to the original four (test comment: "now fronted … was incomplete in 025"). The verb's documented exit-code contract (0/1/2) is unchanged, so this is a behavioral *expansion* rather than a break — but it is a behavior change to a verb the code comments repeatedly call "frozen per the documented-subcommand contract." An adopter (or script) that previously got exit 0 for `speckit-guard speckit-analyze` now gets exit 1. That is arguably the correct fix for a 025 gap, but it is a silent semantic change to a contract surface the diff otherwise frames as immutable; it deserves an explicit note in the verb's deprecation header (which currently only documents the supersession, not the widened refusal set).

---

I did **not** re-litigate `identity.ts`'s shell-parsing edge cases — that module carries explicit cross-model audit hardening (rounds 1–2) with a documented, test-pinned indirection-limit set, and the new `mediate.ts`/`marker.ts`/verb code reuses it cleanly. The `WrappedSkill` type removal is clean (no remaining references in `src/`), and `speckit-guard` correctly gates with `isWrappedSkill` before calling the now-throwing `frontDoorsFor`, so the refusal-refactor introduces no dangling-throw path. My highest-confidence concerns are the two coupled mechanism failures: the Skill matcher (claude-01/02) and the session-id linchpin (claude-03) — either alone renders the interception inert for the speckit surfaces, and both are masked by tests that exercise the decision core in isolation rather than the hook firing end-to-end.

### AUDIT-20260618-65 — Concurrent marker writes can drop active front-door entries

Finding-ID: AUDIT-20260618-65
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/marker.ts:93-99, src/capability/marker.ts:115-119

`enterFrontDoor` and `exitFrontDoor` both do read-filter-write cycles with no locking or compare/retry. Two front-door drives in the same session can both read the same marker state, then the last `renameSync` wins and silently drops the other token. That contradicts the stated FR-014a behavior that nested/parallel drives isolate and “one exit cannot clear another.”

The blast radius is high because the feature’s own sanctioned path can become flaky under parallel or overlapping skill activity: a valid front-door invocation may lose its marker and then have its backend call refused as raw. A reasonable fix is to serialize marker updates per session, or use an atomic retry protocol that detects when the marker changed between read and write.

### AUDIT-20260618-66 — Empty session IDs are accepted, making documented marker commands fragile

Finding-ID: AUDIT-20260618-66
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/front-door.ts:58-68; skills/define/SKILL.md:107-110; skills/execute/SKILL.md:120-123; skills/extend/SKILL.md:60-63

The skill docs tell agents to pass `--session "$CLAUDE_CODE_SESSION_ID"`, but `frontDoor` only checks whether `session` is `undefined`; it accepts an empty string. If that env var is absent or expands empty, `enter` writes the marker under the empty-session path while the interceptor reads the hook payload’s real `session_id`, so the sanctioned backend call is still refused.

The blast radius is high because the failure hits the main “front door permits, raw call refuses” contract, and it is hard for an agent to diagnose from the refusal message. `front-door enter/exit` should reject empty `--session` values, and the skill instructions should use a session source that is guaranteed to match the hook payload or fail loud before invoking the backend.

## 2026-06-18 — audit-barrage lift (20260618T033416410Z-026-capability-interface-mediation-phase-2)

### AUDIT-20260618-67 — Subshell close-paren glued to argv[0] bypasses Bash mediation — `(true && backlog)` resolves to `null`

Finding-ID: AUDIT-20260618-67
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:307-313 (`argv0OfTokens` paren-strip) + 256-298 (`parseCommands`)

The subshell/group strip only fires on a token that *itself opens* the group:

```js
if (tok.startsWith('(') || tok.startsWith('{')) {
  tok = tok.replace(/^[({]+/, '').replace(/[)}]+$/, '');
}
```

The trailing `)` that closes a multi-token subshell is glued to a *different* token — whichever token is argv[0] of the **last** simple command inside the subshell — and that token does **not** start with `(`, so its trailing `)` is never stripped. The executable then carries a spurious `)` and fails exact registry membership, so `matchCapability` returns `null` → **permit** → the backend runs un-mediated.

Reachable with ordinary shell, no indirection:
- `(true && backlog)` → `parseCommands` yields `[['(true'], ['backlog)']]`; second command's argv0 resolves to `'backlog)'` → `null`.
- `(cd /repo && backlog)` → `[['(cd','/repo'], ['backlog)']]` → `'backlog)'` → `null`.
- `(sudo backlog)` → `[['(sudo','backlog)']]`; `'(sudo'`→`sudo` (wrapper consumed), then `'backlog)'` → `null`.
- `(env X=1 backlog)`, `(FOO=bar backlog)` → same.

Contrast the **passing** cases the round-6 tests do cover — `(backlog)` and `(backlog capture x)` — where `backlog` is the *first* token after `(` and so gets the leading-paren strip (its trailing `)` happens to be on a later token or is the single-token form). The bug only manifests when the backend is the **closing** token of the subshell. The test suite has a blind spot exactly shaped like the bug: every `(...)`/`{...}` test places the backend in the leading position. This is the round-1 HIGH-1 class ("a bypass reachable with ordinary shell syntax") re-opened through the subshell-close path; rounds 1–7 rated identical ordinary-shell under-matches as HIGH.

Blast radius: the interceptor that consumes `matchCapability` will permit a fronted backend whenever an agent (or operator) wraps the invocation in a subshell with the backend as the trailing command — `(cd dir && backlog)` is a common idiom. The US3 graduate-gate backstop (FR-015) catches it at graduation, but per-call mediation is defeated. Fix: strip a trailing unmatched `)`/`}` from *any* resolved argv0 token (or, more robustly, lex `(`/`)`/`{`/`}` as structural tokens in `parseCommands` instead of gluing them into words), and add tests placing the backend as the closing token: `(true && backlog)`, `(sudo backlog)`, `(cd x && backlog)`.

---

### AUDIT-20260618-68 — Space-form function definition `backlog () { … }` is falsely refused (over-match)

Finding-ID: AUDIT-20260618-68
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/identity.ts:300-336 (`argv0OfTokens`) + tests round 4, src/__tests__/capability/identity.test.ts:283-287

Round 4 asserts the contract "a function DEFINITION named like a backend is not an invocation" and tests only the no-space POSIX forms `function backlog { :; }` and `backlog() { echo hi; }`. The spaced form — also valid POSIX/bash: `fname ( ) compound-command` — is not held. `backlog () { :; }` tokenizes as `['backlog','()','{', …]`; `argv0OfTokens` returns `basename('backlog')` = `backlog` at the first token (the separate `()` token is never consulted), so `matchCapability` **matches** and the interceptor refuses a function *definition* — a false refusal.

This is the over-match direction the round-4 comment itself flags as "the worst direction — over-matching has no backstop and blocks legitimate work." The spaceless `backlog()` self-excludes because the `()` glues to the name (`basename('backlog()')` ≠ `backlog`); the spaced variant breaks that accidental defense. Trigger is rare (defining a function named exactly like a fronted backend, with a space), which is why this is medium rather than high — but it is an incompletely-held contract in the no-backstop direction. Fix: when the token following a candidate argv0 is exactly `()` (or `(` then `)`), treat the line as a definition and return `null`, and add the spaced form to the round-4 test block.

---

### AUDIT-20260618-69 — No further findings — what I checked and why it's clean

Finding-ID: AUDIT-20260618-69
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    (remainder of the diff)

I traced the wrapper flag-arity logic (`valueFlags`/`positionals`/`lookupFlags`/`--`), redirection skipping (bare vs attached operators, `2>&1`, `&`-adjacent redirections), the `$()`/backtick opaque-substitution state machine (quote-aware paren depth), heredoc detection (`<<` vs `<<<` vs `<<-`, full-word delimiters, exact-column termination), line continuations, comment-to-end-of-line, and the header/command-introducing reserved-word tables — all behave as their tests claim, and I found no infinite-loop or unterminated-state path (`i` always advances; wrapper loops terminate on `undefined`). The registry (`registry.ts`) invariants, `redirectFor` fail-loud on empty interface, and the single-source non-drift test are internally consistent. The `research.md` D3 spike note is honest about its docs-derived (not live-verified) status and correctly defers the matcher confirmation to a T015/T018 live gate, so it carries no implementation-correctness risk. The one residual I'd watch but did not raise as a defect: stacked heredocs (`cat <<A <<B`) overwrite the single `pendingHeredoc` slot rather than queuing — but identity.ts already documents this in the FR-017 limit class and the US3 backstop covers it, so it is a known, pinned boundary rather than a regression.

### AUDIT-20260618-70 — ANSI-C quoted command names bypass CLI mediation

Finding-ID: AUDIT-20260618-70
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/identity.ts:263-279

The parser handles plain single/double quotes around argv[0], but not Bash ANSI-C quoted words. In Bash, `$'backlog' list` executes the command `backlog`; here the `$` is accumulated as a literal character, then the single-quoted body contributes `backlog`, so the normalized identity becomes `$backlog` and `matchCapability` permits it.

Blast radius is high because this is a direct raw backend invocation hidden with ordinary Bash quoting, not a deep indirection form like `eval` or `bash -c`. A reasonable fix is to parse `$'...'` and `$"..."` as shell quoting forms for command words, including regression tests for `$'backlog' list` resolving to the `backlog` capability.

### AUDIT-20260618-71 — Backslash-quoted heredoc delimiters swallow later commands

Finding-ID: AUDIT-20260618-71
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/capability/identity.ts:113-132, src/capability/identity.ts:138-147

`readHeredocOpener` supports quoted delimiters like `<<'EOF'`, but not backslash-quoted delimiters like `<<\EOF`. Bash quote-removes that delimiter to `EOF`; this parser records the delimiter as `\EOF`, so `skipHeredocBody` never sees the real `EOF` terminator and consumes the rest of the script. A command such as `cat <<\EOF\nbody\nEOF\nbacklog list` therefore hides the later raw `backlog` invocation from mediation.

Blast radius is high because a common heredoc quoting form can disable scanning for all subsequent Bash lines in the same tool call. The fix should apply shell quote-removal to heredoc delimiter words, including backslash quoting, and add a regression that still sees `backlog` after a `<<\EOF … EOF` heredoc.

## 2026-06-18 — audit-barrage lift (20260618T033920278Z-026-capability-interface-mediation-phase-3)

### AUDIT-20260618-72 — Session-id linchpin asserted as established fact in shipped SKILL.md prose while it is an unverified spike

Finding-ID: AUDIT-20260618-72
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    skills/define/SKILL.md, skills/execute/SKILL.md, skills/extend/SKILL.md (each "Front-door marker" block) + src/capability/intercept.ts:73 + src/subcommands/front-door.ts

The entire permit path is keyed on the equality `$CLAUDE_CODE_SESSION_ID` (what the skill passes to `front-door enter --session`) == `payload.session_id` (what `interceptDecision` reads, `intercept.ts:73`). The marker file is written at `<root>/.stack-control/state/front-door/<session>.json` and read back under the payload session; if the two ids differ, `activeCapabilities` returns the empty set and `decideMediation` **refuses every sanctioned drive** — the opposite of best-effort. This is exactly the linchpin the working tree itself flags as an open spike (`task-164 … verify CLAUDE_CODE_SESSION_ID equals the PreToolUse hook payload session_id`).

The blast radius: all three shipped SKILL.md blocks state the equality categorically — *"`$CLAUDE_CODE_SESSION_ID` is the same id the interceptor reads from the hook payload"* — with no hedge. An agent (or adopter) reads that as settled and builds on it. If the equality is false on any host/version, `define`/`extend`/`execute` cannot drive their backend at all once the hook is live: `/speckit-implement` is refused after a successful `enter`, and the failure is silent (a deny with a redirect message, not an error pointing at the session mismatch). A reasonable fix: gate the categorical claim behind the spike's resolution, and have `mediate-check`/`intercept` emit a diagnosable reason when a marker exists for a *different* session id than the one presented (so the mismatch is observable rather than indistinguishable from "no marker").

---

### AUDIT-20260618-73 — `hooks/hooks.json` is not declared in `plugin.json`, and no test/smoke verifies the hook is registered — if auto-discovery doesn't apply, the whole feature is inert

Finding-ID: AUDIT-20260618-73
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    hooks/hooks.json (new) + .claude-plugin/plugin.json

`plugin.json` contains only `name/version/description/license` — no `hooks` key. The new `hooks/hooks.json` registers `bin/intercept` for the `Bash` and `Skill` PreToolUse matchers and is the **only** thing that makes any of this code execute in a real session. Whether it fires depends entirely on Claude Code auto-discovering a plugin-root `hooks/hooks.json`; nothing in this diff confirms that, and there is no smoke/integration test asserting the hook is wired (the only hook-adjacent test, `intercept-prefilter.test.ts`, checks the grep *pattern*, not that the hook is *registered*).

Blast radius: if auto-discovery is not the mechanism on the target Claude Code version (or the path/shape differs), the interceptor silently never runs — every raw `backlog`/`speckit-*` call is permitted and the feature ships dead, with green unit tests. Because the failure is silent (a non-firing hook produces no error), this is the kind of packaging-is-UX gap the project rules call top-priority. Fix: either declare the hooks file explicitly in `plugin.json` if the schema supports it, or add a load smoke that asserts the PreToolUse hook is present after `claude --plugin-dir`.

---

### AUDIT-20260618-74 — Unset/empty `$CLAUDE_CODE_SESSION_ID` makes `front-door enter` fail exit 2, and the SKILL.md gives the agent no recovery — silently disabling the sanctioned path

Finding-ID: AUDIT-20260618-74 (claude-03 + claude-04 + claude-07 + claude-08 + codex-01 + codex-03 + codex-04; cross-model)
Status:     open
Severity:   blocking
Per-lane:   claude=medium, codex=blocking
Decision:   adjudicated (gate-counted blocking) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — blocking retained.
Surface:    src/subcommands/front-door.ts:71-73 + skills/{define,execute,extend}/SKILL.md

`front-door.ts` correctly fails loud on an empty session (codex-02 guard: `--session must be a non-empty value … is $CLAUDE_CODE_SESSION_ID set?`, exit 2). But the SKILL.md blocks instruct the agent to run `TOKEN=$(stackctl front-door enter … --session "$CLAUDE_CODE_SESSION_ID")` unconditionally. If that env var is unset/empty in the skill's Bash environment, `enter` exits 2, `$TOKEN` is empty, and the subsequent backend call is then refused by the interceptor — the sanctioned drive is blocked with two confusing errors and no SKILL guidance on what to do.

Blast radius: the failure mode lands precisely when the hook IS working, so it converts a correctly-installed mediation into a hard block on legitimate work. This compounds with claude-01 (the same env var must also *match* the payload). A reasonable fix: the SKILL.md should tell the agent to confirm `$CLAUDE_CODE_SESSION_ID` is populated before bracketing (or the marker should fall back to a session the interceptor can also derive), and the spike (task-164) should pin both "is it set" and "does it match" before these prose blocks ship as instructions.

---

### AUDIT-20260618-75 — The "no drift" derivation test is tautological — it compares `flatMap` to `flatMap` and can never fail

Finding-ID: AUDIT-20260618-75
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/speckit-wrapper/wrapper-refusal.test.ts:33-36

The new test claims to guard non-drift: *"WRAPPED_SKILLS == the registry skill identities (no drift)."* But `WRAPPED_SKILLS` is itself defined as `CAPABILITY_REGISTRY.capabilities.flatMap((c) => c.backendIdentities.skills)` (refusal.ts), and the test computes `registrySkills` with the identical expression. Both sides are the same derivation of the same source, so the assertion is `sort(X) === sort(X)` — it can never fail regardless of any future change. It does not test a contract; it tests that `Array.prototype.flatMap` is deterministic.

Blast radius: low (test-quality, not runtime). The cost is false confidence: the suite reads as if it pins the wrapper map against an independent expectation, but it would stay green even if both the registry and the derived list were wrong together. A genuine guard would assert against a literal expected list (the seven speckit identities the comment enumerates), so a registry edit that drops/renames a skill is caught by the explicit expectation rather than silently re-deriving.

---

### AUDIT-20260618-76 — `bin/intercept` fails open on any `stackctl` crash, with no signal that mediation was skipped

Finding-ID: AUDIT-20260618-76
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    bin/intercept:18-20

When the grep pre-filter matches, the script runs `… "$(dirname "$0")/stackctl" intercept` and then unconditionally `exit 0`. If `stackctl intercept` dies (tsx cold-start failure, missing `node_modules`, a throw in `interceptDecision`), it writes nothing to stdout, the PreToolUse hook sees no deny, and the call is permitted. The intercept verb itself is also fail-open on a malformed payload (`intercept.ts` verb, catch → return). This is consistent with the documented best-effort/FR-017 stance, so it is not wrong by design — but it is silent: a persistently broken `stackctl` (e.g. after a dependency change) disables all mediation indefinitely with no operator-visible signal.

Blast radius: low-to-medium depending on how often the runtime breaks. Because the project treats "a discipline that silently doesn't fire" as a real adopter gap (enforcement-lives-in-skills rule), it is worth at least a stderr breadcrumb on the crash path so a non-firing interceptor is observable rather than indistinguishable from "permitted."

---

### AUDIT-20260618-77 — Hook wrapper masks mediation failures as success

Finding-ID: AUDIT-20260618-77
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    bin/intercept:17-20

`bin/intercept` runs `stackctl intercept` when the payload matches the coarse backend pattern, then unconditionally executes `exit 0`. If `stackctl intercept` crashes, is missing, cannot start `tsx`, or throws on malformed marker state, the wrapper exits successfully without emitting a denial.

The blast radius is high because a runtime failure in the enforcement path becomes an allow-by-default outcome for the exact calls this hook exists to mediate. The wrapper should preserve or explicitly handle the mediation command’s failure mode, ideally emitting a deny/fail-loud hook response when mediation cannot be evaluated.

## 2026-06-18 — audit-barrage lift (20260618T035032078Z-026-capability-interface-mediation-phase-3)

### AUDIT-20260618-78 — Session ids can escape the marker state directory

Finding-ID: AUDIT-20260618-78
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/marker.ts:53-54; src/subcommands/front-door.ts:59-64

`markerPath()` interpolates the session id directly into a filesystem path: `${session}.json`. The CLI only checks that `--session` is non-empty, so a value containing `/` or `..` can write/read/remove marker files outside `.stack-control/state/front-door/`. The hook-provided session id is expected to be benign, but the public `stackctl front-door` verb also accepts operator/agent-supplied `--session`, and the blast radius is marker corruption or arbitrary JSON writes under paths reachable from the installation root.

A reasonable fix is to validate session ids against a conservative filename-safe grammar, or encode the session id before using it as a filename. The validation should live at the marker boundary as well as the CLI boundary, because `enterFrontDoor()` and `activeCapabilities()` are exported primitives.

### AUDIT-20260618-79 — False-positive payloads can still fail closed after reading a malformed marker

Finding-ID: AUDIT-20260618-79
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    bin/intercept:22-28; src/capability/intercept.ts:66-75; src/subcommands/intercept.ts:12-14

`bin/intercept` dispatches to Node whenever the raw JSON contains `backlog` or `speckit-`, and `interceptDecision()` then resolves the active marker before running the exact argv0/skill match. That means a harmless command like `cat backlog.md` correctly permits in the unit test with a clean injected resolver, but in production it still reads `.stack-control/state/front-door/<session>.json`; if that marker file is malformed, `activeCapabilities()` throws, `stackctl intercept` exits non-zero, and the shell shim denies the tool call.

The blast radius is avoidable operator-facing denial for non-backend commands that merely mention a backend string. The exact decision core already knows how to distinguish `cat backlog.md` from `backlog list`; the adapter should run the precise identity match before resolving marker state, or have `decideMediation` accept a lazy resolver only when a fronted backend actually matched.

### AUDIT-20260618-80 — Malformed hook payloads permit instead of denying a backend-like event

Finding-ID: AUDIT-20260618-80
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/intercept.ts:23-34; bin/intercept:22-28

The shell shim only invokes `stackctl intercept` after the raw payload matches `backlog|speckit-`, but `runIntercept()` returns success with no output when JSON parsing fails. In PreToolUse semantics, no output means the tool proceeds, so a backend-like payload that reaches this branch is allowed despite the shim comments saying evaluation failures fail closed.

The practical blast radius is limited because the host normally supplies valid JSON, but the feature’s enforcement path should not have an allow branch for the exact class of event the prefilter considered mediation-relevant. A reasonable fix is for parse failure in `stackctl intercept` to emit deny JSON, or for `bin/intercept` to treat empty output after a backend-like malformed payload as an evaluation failure.

### AUDIT-20260618-81 — Front-door skill docs ship an unverified session-id bridge as the required path

Finding-ID: AUDIT-20260618-81
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    skills/define/SKILL.md:106-131; skills/extend/SKILL.md:59-84; skills/execute/SKILL.md:119-144

The sanctioned skill instructions require agents to call `stackctl front-door enter --session "$CLAUDE_CODE_SESSION_ID"`, while the interceptor permits by reading `payload.session_id`. The docs themselves state that equality between those two ids is not live-verified. If they differ, the skill successfully writes a marker under one session key, then the hook checks another session key and refuses the sanctioned backend call.

This is high because downstream agents will follow these SKILL.md instructions unattended, and the feature’s main goal is complete mediation without blocking front-door calls. The fix should make the front-door marker use the same session identifier the hook will read, or add an executable acceptance test/smoke that proves the documented `$CLAUDE_CODE_SESSION_ID` value matches `payload.session_id` before claiming the front-door skills are operational.

## 2026-06-18 — audit-barrage lift (20260618T035949054Z-026-capability-interface-mediation-phase-3)

### AUDIT-20260618-82 — No-installation context refuses the adopter's own backend with an unsatisfiable redirect

Finding-ID: AUDIT-20260618-82
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/intercept.ts:11-14` + `src/capability/mediate.ts:30-43` + `src/subcommands/front-door.ts:88-94`

`resolveActive` maps "no installation" → empty active set → `decideMediation` matches the backend and **refuses**, identical to "installed but unmarked." But `front-door enter` *refuses with exit 2* when there's no installation. So in any repo where the plugin is loaded but `setup` never ran, the raw backend is denied **and** the front door can't be entered to authorize it — a deadlock. This contradicts the diff's own claim that the plugin "does NOT patch the adopter's own backend speckit skills." Likely fix: permit when no installation resolves (mediation is only meaningful where stack-control is set up). Masked today only because the hook isn't registered yet (claude-07).

### AUDIT-20260618-83 — A throw from `resolveActive` escapes `interceptDecision` — only `JSON.parse` is guarded

Finding-ID: AUDIT-20260618-83
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/intercept.ts:25-45` + `src/capability/marker.ts` (`readMarker`/`assertSafeSession`)

`runIntercept` try/catches only `JSON.parse`. After parse, an empty/unsafe `session_id` (regex rejects `''`) or a corrupt marker file makes `activeCapabilities` **throw**, escaping uncaught → non-zero exit → the generic "interceptor error" deny. It fails closed (good) but (a) is undiagnosable, and (b) **a corrupt marker denies the sanctioned drive too**, with no pointer to the bad file. Catch in `runIntercept` and degrade to an explicit, file-naming refuse.

### AUDIT-20260618-84 — cwd drift between `enter` and the hook payload silently refuses a sanctioned drive

Finding-ID: AUDIT-20260618-84
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `front-door.ts:78-82` + `intercept.ts:11-14` + the SKILL.md marker blocks

The marker is written under the installation resolved at `enter` time and read under the installation resolved from the hook payload's `cwd`. The SKILL.md guidance never pins `--at`. Under 009 nearest-wins nesting, a `cd` between the `enter` Bash call and the backend Skill call resolves a different marker store → sanctioned drive refused. Undisclosed sibling of task-164 (session-id), on the cwd axis.

### AUDIT-20260618-85 — `backlog` SKILL.md block omits the empty-session guard the other three carry

Finding-ID: AUDIT-20260618-85
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `skills/backlog/SKILL.md:113-123` vs `skills/{define,execute,extend}/SKILL.md`

`define`/`execute`/`extend` each open with `test -n "$CLAUDE_CODE_SESSION_ID" || … exit 1`; the new `backlog` block shows bare `enter`/`exit`. The verb rejects empty `--session` anyway, so it's guidance-inconsistency, not a hole — but make the templates symmetric.

### AUDIT-20260618-86 — Editing-residue grammar in shipped agent-facing SKILL.md blocks

Finding-ID: AUDIT-20260618-86
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `skills/extend/SKILL.md`, `skills/execute/SKILL.md` (marker blocks)

Template artifacts: extend's "a direct **the** `/speckit-*` … chain" and execute's "a direct native `/speckit-implement`, per phase)". Agent-facing instructions — won't change behavior, but undercut the block's precision.

### AUDIT-20260618-87 — `frontDoorsFor` now throws (total→partial) — currently safe, latent foot-gun

Finding-ID: AUDIT-20260618-87
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `refusal.ts:44-49` + `speckit-guard.ts:64-70`

The `WrappedSkill` narrowing is gone; `frontDoorsFor` throws on a non-wrapped name and `evaluateRefusal` calls it unconditionally. The only live caller gates with `isWrappedSkill` first, so no regression — flagged so future callers know the type system no longer enforces the gate.

### AUDIT-20260618-88 — Hook wired into CLI but not registered in the plugin manifest (context)

Finding-ID: AUDIT-20260618-88
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `.claude-plugin/plugin.json` (no `hooks` key) + `hooks/hooks.json` + SKILL.md

Verbs dispatch from `cli.ts:134-136`, but `plugin.json` has no `hooks` reference — the PreToolUse hook is inert (tests confirm registration is the deferred T018 gate). Yet the four SKILL.md marker instructions ship live now, so agents pay `enter`/`exit` overhead with nothing reading the markers. Harmless and per-plan, but it's why claude-01/03 are latent-until-T018 rather than currently observable.

Findings are recorded at `/Users/orion/.claude/plans/audit-barrage-multi-model-cosmic-otter.md`.

A note on the framing: this was an **audit/review task**, and its deliverable is the findings above — there's no code change for me to implement or for you to approve. I'm calling ExitPlanMode only because the harness requires the turn to end that way; treat the "plan" as the audit report for triage, not a proposal to execute.

On reflection, ExitPlanMode is explicitly **not** for research/review tasks (its own contract: "For research tasks where you're gathering information, searching files, reading files… do NOT use this tool"). This audit produced a findings report, not an implementation plan — so there's nothing to approve and no code to write.

The audit is complete. Seven findings delivered above and recorded to the plan file, calibrated by blast radius:

- **1 high** (claude-01): no-installation deadlock — raw backend denied while the front door refuses to open.
- **2 medium** (claude-02 uncaught-throw/fail-closed diagnosability; claude-03 cwd/installation drift refusing sanctioned drives).
- **2 low** (claude-04 missing session guard in backlog block; claude-05 SKILL.md grammar residue).
- **2 informational** (claude-06 latent throwing-contract foot-gun; claude-07 hook not yet registered — which is why 01/03 are latent-until-T018).

Strongest signal for triage is **claude-01** — it's a genuine contradiction with the diff's stated "we don't patch the adopter's own Spec Kit" principle, and it lands the moment T018 registers the hook.

### AUDIT-20260618-89 — Front-door docs lose the marker token across separate tool calls

Finding-ID: AUDIT-20260618-89
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    skills/define/SKILL.md:109-122, skills/extend/SKILL.md:62-75, skills/execute/SKILL.md:122-135, src/subcommands/front-door.ts:88-91

The skill docs tell the agent to run `TOKEN=$(stackctl front-door enter ...)`, then drive the backend, then run `stackctl front-door exit --token "$TOKEN"`, while also stating that `enter` and `exit` are separate tool calls. A shell variable set in one Bash tool call will not reliably exist in the later Bash tool call, so the documented path expands `"$TOKEN"` to an empty string. `frontDoor` only checks `token === undefined`, not `token.trim() === ''`, so `exit --token ""` succeeds and removes no marker.

Blast radius is high: the sanctioned path can leak an active marker after every successful front-door drive, wrongly permitting later raw backend calls until staleness pruning. A reasonable fix is to make the token durable across tool calls in the skill protocol, or provide a single wrapper command that brackets the backend drive, and reject empty `--token` in `front-door exit`.

### AUDIT-20260618-90 — Sanctioned skill drives depend on an unverified session id bridge

Finding-ID: AUDIT-20260618-90
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    skills/define/SKILL.md:106-131, skills/extend/SKILL.md:59-84, skills/execute/SKILL.md:119-144

The front-door instructions require `$CLAUDE_CODE_SESSION_ID` for `front-door enter/exit`, while the interceptor authorizes against `session_id` from the hook payload. The docs explicitly state this equality is “not yet live-verified”; if the environment variable is absent or differs from the hook payload, every correctly bracketed backend invocation is still refused.

Blast radius is high because it breaks the main feature path for spec-definition and spec-execution: agents can follow the new instructions exactly and still be blocked by mediation. The fix should make the session source verified and available to the skills, or route `enter/exit` through a mechanism that uses the same session id source as the interceptor.

### AUDIT-20260618-91 — Legacy speckit-guard still ignores the new marker file

Finding-ID: AUDIT-20260618-91
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/speckit-guard.ts:15-20, src/subcommands/speckit-guard.ts:69-70

`front-door enter` writes the new session-keyed marker file, but `speckit-guard` still decides “via front door” from `STACKCTL_FRONT_DOOR === '1'`. The comment states that a file-marker context is not seen by this verb, and the implementation confirms it at lines 69-70.

Blast radius is medium because the live interceptor path no longer uses this verb, but the subcommand is still shipped and documented as retained. Any adapter or operator using `speckit-guard` with the new `front-door enter` contract gets a false refusal. The fix is to have `speckit-guard` consult the same marker-file resolver as `mediate-check`, or remove it from any supported mediation path.

## 2026-06-18 — audit-barrage lift (20260618T040825588Z-026-capability-interface-mediation-phase-3)

### AUDIT-20260618-92 — `runIntercept` "Always exits 0" contract is false — fail-closed depends entirely on the bash wrapper

Finding-ID: AUDIT-20260618-92
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/intercept.ts (runIntercept docstring + resolveActive) ↔ bin/intercept (RC≠0 branch)

`src/subcommands/intercept.ts` states "Always exits 0 — a PreToolUse hook denies via its stdout JSON, not its exit code." That invariant is not actually held by `runIntercept`. It only catches `JSON.parse` failures. The subsequent `interceptDecision(...)` call invokes the injected `resolveActive`, which is `activeCapabilities(installation.root, session)` → `readMarker`, and `readMarker` is deliberately fail-loud: it **throws** on a malformed marker file (Principle V). That throw is uncaught inside `runIntercept`, so the process exits non-zero — contradicting the docstring.

The fail-closed guarantee for this case lives entirely in `bin/intercept`'s `if [ "$RC" -ne 0 ]` branch (the codex-02 net), not in the TypeScript. The diff explicitly advertises that "any other vendor adapter are thin shells over this" core. A second vendor adapter (the Codex PreToolUse adapter the comments anticipate) that reuses `interceptDecision`/`runIntercept` without faithfully replicating the bash RC→deny net would **fail open** on a malformed marker — exactly the silent-bypass this feature exists to prevent. A reasonable fix: wrap the decision path inside `runIntercept` in a try/catch that emits `denyOutput(...)` on any throw, so the fail-closed contract is honored at the layer that claims it, and correct the docstring to say so. The bash net then becomes defense-in-depth rather than the sole guarantee.

### AUDIT-20260618-93 — A corrupt marker file permanently wedges a session — `enter` throws and the interceptor denies, with no recovery verb

Finding-ID: AUDIT-20260618-93
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/marker.ts (readMarker, enterFrontDoor, exitFrontDoor)

`readMarker` throws on any malformed marker JSON (good fail-loud), but every primitive reads through it: `activeCapabilities`, `enterFrontDoor` (merges into `kept`), and `exitFrontDoor`. Consequence: if a session's marker file is ever corrupted (partial write outside the atomic path, external truncation, disk fault), that session is wedged in both directions — the interceptor's `resolveActive` throws → fail-closed deny on every backend-like call (per AUDIT-BARRAGE-claude-01), **and** `front-door enter` throws an uncaught error rather than recovering. So the agent can neither drive a backend nor re-establish a marker. There is no `front-door reset`/repair verb and nothing prunes a corrupt (vs. merely stale) file.

This self-heals only across sessions (a new `session_id` → new marker path), never within one. Note the asymmetry: `enterFrontDoor` is about to **overwrite** the active list anyway (`[...kept, newEntry]`), so it is the one operation that could legitimately recover by treating an unreadable file as empty-and-replace. Worth an explicit decision: either add a recovery path (enter rewrites a corrupt marker; or a `front-door reset --session` verb), or document that a corrupt marker requires manually deleting `<installation>/.stack-control/state/front-door/<session>.json`. As written, a rare-but-real corruption is an unrecoverable wedge for the live session, with no operator-facing remediation.

### AUDIT-20260618-94 — Permit path hinges on an unverified `$CLAUDE_CODE_SESSION_ID == payload.session_id` equality (task-164)

Finding-ID: AUDIT-20260618-94
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    src/capability/intercept.ts (session_id read) ↔ skills/{define,execute,extend}/SKILL.md (front-door marker section)

The entire permit mechanism is keyed on session identity: the front-door skills write the marker under `$CLAUDE_CODE_SESSION_ID` (the skill's bash env), while `interceptDecision` reads `payload.session_id` from the hook stdin and resolves the active set under that key. If those two identifiers are not literally equal, `enter` writes marker `A` and the interceptor reads under `B`, the active set is empty, and **every sanctioned drive is refused** — the feature breaks closed for all legitimate use, not just edge cases. The SKILL.md sections themselves flag this as "the expected mechanism, not yet live-verified" and point at task-164, with the right triage hint ("a session-id mismatch is the prime suspect").

I'm surfacing it because the cross-model signal is the point of the barrage, not because it's untracked — it is tracked. But the blast radius if the assumption is wrong is total (no backend can be driven through any front door), and this diff ships the SKILL.md instructions that depend on it as if live. The linchpin spike (task-164) should gate any claim that mediation works end-to-end; until it's live-verified, the `enter`/drive/`exit` guidance in three skills is predicated on an unproven equality. No code change is implied beyond not treating the path as proven — but the operator should weigh whether the SKILL.md guidance should ship before task-164 resolves.

### AUDIT-20260618-95 — Nothing in this diff wires `hooks/hooks.json` into the plugin — interceptor may be inert until T018

Finding-ID: AUDIT-20260618-95
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    hooks/hooks.json (new) + absent plugin-manifest/registration wiring

The diff adds `hooks/hooks.json` (PreToolUse → Bash/Skill → `${CLAUDE_PLUGIN_ROOT}/bin/intercept`) and `intercept.test.ts` asserts its *shape*, but no change in this diff demonstrates that the plugin actually loads `hooks/hooks.json` into a live PreToolUse registration. The test comment concedes this: "live hook REGISTRATION is the T018 install-time gate." Until that wiring exists, the entire mediation surface is structurally present but **inert** — every backend call passes unintercepted, which is precisely the "we've been measuring a UX we don't actually ship" failure mode the project's enforcement-lives-in-skills history warns about.

This is expected for mid-feature work, so I'm rating it medium rather than blocking, but it's the highest-leverage thing to verify before any "mediation works" claim: confirm whether Claude Code auto-discovers a plugin's `hooks/hooks.json` at that path, or whether a manifest entry / install step is required. If auto-discovery is the convention, a single integration assertion that the hook is registered (not just that the JSON is well-formed) would close the gap the unit test deliberately leaves open. If it's not auto-discovered, the wiring is a missing surface that should accompany this work.

### AUDIT-20260618-96 — SKILL.md capability ids (`spec-definition`) are only partially covered by tests — a mismatch silently kills the `enter` instruction

Finding-ID: AUDIT-20260618-96
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    skills/{define,extend}/SKILL.md (`--capability spec-definition`) ↔ src/subcommands/front-door.ts (codex-04 unknown-capability guard) + capability/registry.ts (not in diff)

`front-door.ts` correctly rejects an unknown `--capability` with exit 2 (codex-04). That guard means the literal id strings in the SKILL.md instructions must match `CAPABILITY_REGISTRY` ids *exactly* or the sanctioned `enter` step dies before the backend is ever driven. The shipped tests confirm `backlog` and `spec-execution` (mediate.test.ts, wrapper-refusal.test.ts redirect assertions), but I see **no test that pins `spec-definition`** — yet `skills/define/SKILL.md` and `skills/extend/SKILL.md` both call `--capability spec-definition`. `registry.ts` isn't in this diff, so I can't confirm the id is spelled `spec-definition` rather than, say, `spec-authoring` or `definition`.

If that id is wrong, both `define` and `extend` front doors are broken at step 1 (enter rejects with "unknown --capability") while `execute` and `backlog` work — a confusing partial failure that looks like an interceptor bug. Cheap fix: add an assertion that each capability id referenced in the front-door SKILL.md sections exists in `CAPABILITY_REGISTRY` (mirroring how `intercept-prefilter.test.ts` pins the bash grep to the registry), so a doc/registry drift on the id fails CI rather than at agent runtime.

### AUDIT-20260618-97 — `frontDoorsFor` changed from total (over `WrappedSkill`) to throwing on non-members — verify the deprecated `speckit-guard` caller still gates

Finding-ID: AUDIT-20260618-97
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/speckit-wrapper/refusal.ts (frontDoorsFor / evaluateRefusal) + src/subcommands/speckit-guard.ts (body not in diff)

The refactor changed `frontDoorsFor` from a type-guaranteed-total function over `WrappedSkill` (old ternary always returned) to one typed `(skill: string)` that **throws** when the skill isn't registry-fronted, and `evaluateRefusal` now calls it unconditionally with a `string`. The new test asserts callers must gate with `isWrappedSkill`. The `speckit-guard.ts` body isn't shown in the diff (only its header comments), so I can't confirm its dispatch path still calls `evaluateRefusal` only after an `isWrappedSkill` check. If any path reaches `evaluateRefusal`/`frontDoorsFor` with an arbitrary skill name (the verb's whole job is taking an arbitrary `<skill-name>` argument), it will now throw instead of returning a clean verdict.

The header note also widens the verb's refusal set from four to seven skills as a side effect of registry-derivation — correct per the comment, but it means the frozen 025 contract's *behavior* changed even though its signature didn't. Worth a quick confirmation that `speckit-guard`'s argument handling guards `isWrappedSkill` before delegating, and that an unknown skill name yields the documented exit-2 usage path rather than an unhandled throw. Low severity because the deprecated verb is dormant (the SKILL.md front doors use the file-marker interceptor, not speckit-guard per the TASK-165 divergence note), but a deprecated-but-shipped verb that throws on its primary input is a sharp edge.

### AUDIT-20260618-98 — Garbled phrasing in `execute` / `extend` front-door SKILL.md sections

Finding-ID: AUDIT-20260618-98
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    skills/execute/SKILL.md and skills/extend/SKILL.md (front-door marker section, line ~"refuses a RAW backend call")

Two of the four new SKILL.md sections have broken phrasing in the sentence describing what the interceptor refuses: execute reads "refuses a RAW backend call (a direct native `/speckit-implement`, per phase)" and extend reads "refuses a RAW backend call (a direct the `/speckit-*` clarify / re-plan / re-tasks chain)" — "a direct the" is ungrammatical and "a direct native … , per phase" parses awkwardly. These are agent-facing instructions; the meaning survives, so this is cosmetic, but since these blocks were clearly produced by templating one section across four skills, the substitution left artifacts. Worth a pass to make the four sections read cleanly and consistently, since the agent reading them at runtime is the consumer. No behavioral consequence.

---

**Net assessment:** the pure decision core (`mediate.ts`), the marker stack semantics (nesting isolation, token-scoped exit, staleness prune, O_EXCL lock with stale-steal), and the strict arg-parsing across both verbs are solid and well-tested — I checked the truth tables, the lock/read-without-lock split (atomic rename means no torn reads on the hot interceptor path), and the SC-003 argv0 handling, and they hold. My higher-severity findings (01–04) all cluster on the **same theme**: the feature's correctness is currently split across layers (TS core ↔ bash net ↔ not-yet-wired hook ↔ unverified session-id equality), so the end-to-end "a raw call is actually refused, a sanctioned call is actually permitted" claim isn't yet provable from this diff alone. That's consistent with Phase 2/3 mid-feature state, but it's the seam to close before claiming mediation works.

### AUDIT-20260618-99 — Backlog raw-backend bracketing cannot authorize the command it shows

Finding-ID: AUDIT-20260618-99
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    skills/backlog/SKILL.md:117-121

The added backlog guidance shows `front-door enter`, the raw `backlog` CLI call, and `front-door exit` in one Bash block using a shell variable. A PreToolUse hook evaluates the entire Bash payload before any line in that payload runs, so the marker created on line 118 is not active when the interceptor inspects the raw backend call on line 119. An agent copying this block as written will be denied before `enter` executes.

This matters because the block is the only sanctioned recipe given for direct raw-backend use from this skill. The define/extend/execute docs correctly account for separate tool calls and literal token carryover; backlog should use the same shape, or explicitly state that raw Bash backend invocation cannot be authorized by entering inside the same Bash payload.

### AUDIT-20260618-100 — mediate-check reads marker state before proving the identity is fronted

Finding-ID: AUDIT-20260618-100
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/subcommands/mediate-check.ts:64-65

`mediateCheck` resolves active marker state unconditionally before calling `decideMediation`. That means `stackctl mediate-check --surface bash --identity "ls -la" --session s` still reads and validates the session marker even though the identity is not a fronted backend and should permit without marker I/O.

The shipped `interceptDecision` avoids this by matching the capability first, but `mediate-check` is documented here as the vendor-neutral decision verb adapters call. If a marker file is malformed or lock/contention errors occur, a non-backend command can fail through the marker path, violating the no-false-positive shape the interceptor core preserves. A reasonable fix is to match the capability first in `mediateCheck`, returning permit for non-fronted identities before resolving active capabilities.

### AUDIT-20260618-101 — Marker validation does not bind file contents to the requested session

Finding-ID: AUDIT-20260618-101
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    src/capability/marker.ts:97-100, src/capability/marker.ts:207-215

`readMarker` validates that `sessionId` is a string, but it never checks that `obj.sessionId` equals the `session` argument used to choose the marker path. `activeCapabilities(root, "s1")` will therefore accept `.stack-control/state/front-door/s1.json` even if its JSON says `"sessionId": "s2"` and contains active entries for another session.

Normal writes create matching files, but the code explicitly treats malformed marker files as fail-loud state rather than silent “no marker.” A session mismatch is malformed for the session-keyed invariant and can incorrectly permit raw backend calls for the wrong session until staleness pruning. The validation should reject `obj.sessionId !== session` before returning active entries.

## 2026-06-18 — audit-barrage lift (20260618T045911515Z-026-capability-interface-mediation-phase-3)

### AUDIT-20260618-102 — Session-id linchpin (task-164) is the load-bearing assumption of the whole permit path and is unverified

Finding-ID: AUDIT-20260618-102
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   single-model (gate-counted high)
Surface:    `src/capability/intercept.ts:78-80`, `src/subcommands/front-door.ts:~70-95`, `skills/{define,execute,extend}/SKILL.md` (front-door note)

The entire permit mechanism depends on the marker being written under the same session key the interceptor reads. The writer (`front-door enter`) keys the marker on `$CLAUDE_CODE_SESSION_ID` (the env var the skill expands). The reader (`interceptDecision`) keys on `str(payload.session_id)` from the PreToolUse hook payload (`intercept.ts:78`). If those two identifiers are not identical strings, *every* sanctioned front-door drive is refused: the marker exists under key A, the interceptor looks under key B, finds nothing, and denies. The diff itself flags this as an open spike (task-164) and calls it "the expected mechanism, not yet live-verified."

Blast radius: this isn't a corner case — it's the happy path for `/stack-control:{define,execute,extend}`. If the assumption is wrong, the feature degrades to "deny all backend calls including sanctioned ones," which is safe (fail-closed) but renders the front doors unusable. Because an unattended agent following the SKILL.md will `enter` successfully, then have its `/speckit-implement` refused with a redirect that points back at the skill it is already inside, producing an infinite redirect loop with no human to break it. A reasonable fix is to make T018 install-verification (or a cheap startup self-check) assert `enter`→intercept round-trips against the live hook payload before this ships as a default-on hook, rather than leaving the linchpin to a spike task.

---

### AUDIT-20260618-103 — `frontDoorsFor` changed from total (compile-time-gated) to partial (throws), and `evaluateRefusal` calls it unconditionally

Finding-ID: AUDIT-20260618-103
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/speckit-wrapper/refusal.ts:38-44` (frontDoorsFor / evaluateRefusal), caller `src/subcommands/speckit-guard.ts` (not in diff)

Previously `frontDoorsFor(skill: WrappedSkill)` was total over a closed union, so the type system guaranteed callers passed a wrapped skill. The new signature is `frontDoorsFor(skill: string)` and it **throws** `'${skill}' is not a wrapped backend skill` for any non-wrapped name. `evaluateRefusal` calls `frontDoorsFor(skill)` on its first line, unconditionally. The safety that used to be enforced at compile time is now a runtime throw.

`stackctl speckit-guard <skill-name>` takes a **user-supplied** skill name as argv. If that verb calls `evaluateRefusal`/`frontDoorsFor` without first gating on `isWrappedSkill`, an unknown skill argument now produces an uncaught exception (stack trace, non-zero exit) instead of the previous clean behavior. The new test only asserts `frontDoorsFor('not-a-speckit-skill')` throws — it does not prove the deprecated verb's callsite gates it. The speckit-guard logic is not in this diff, so I cannot confirm. Fix: verify `speckit-guard.ts` checks `isWrappedSkill(name)` before reaching `evaluateRefusal`, and add a test that `speckit-guard <unknown-skill>` exits cleanly rather than throwing.

---

### AUDIT-20260618-104 — `backlog/SKILL.md` shows `$TOKEN` reuse, contradicting the explicit "separate Bash calls, carry the literal token" warning in the sibling skills

Finding-ID: AUDIT-20260618-104
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `skills/backlog/SKILL.md:114-118` vs `skills/{define,execute,extend}/SKILL.md` (step 1/3 notes)

The backlog skill's example brackets a raw call as:
```bash
TOKEN=$(stackctl front-door enter --capability backlog --session "$CLAUDE_CODE_SESSION_ID")
# ... raw backlog CLI call ...
stackctl front-door exit --token "$TOKEN" ...
```
This `$TOKEN` shell variable only survives because enter+call+exit are one Bash block. But define/execute/extend devote two emphatic paragraphs to the opposite: *"Your `enter` and `exit` run in SEPARATE Bash tool calls, so a `$TOKEN` shell variable will NOT survive... carry the LITERAL token value yourself."*

An agent that reads both will see one skill modeling `$TOKEN` reuse and three forbidding it. The risk is an agent generalizes the backlog pattern to the speckit skills, splits enter/exit across tool calls, and silently leaks a marker (the empty-`$TOKEN` `exit` no-ops). The two patterns are *both correct for their context*, but the inconsistency is a trap. Fix: add one sentence to backlog/SKILL.md noting the `$TOKEN` form is valid only because the three commands share a single Bash block, with a pointer to the literal-token rule when they don't.

---

### AUDIT-20260618-105 — Marker resolution is keyed on the hook payload `cwd`, adding a second silent-refusal linchpin alongside session-id

Finding-ID: AUDIT-20260618-105
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `src/subcommands/intercept.ts:9-12` (resolveActive), `src/capability/intercept.ts:79`

The interceptor resolves the installation from the **hook payload's `cwd`** (`findInstallation(cwd)`), while `front-door enter` resolves it from its own `--at`/`process.cwd()`. The marker is permit-checked only if both resolve to the same installation root. Within one installation tree any subdirectory resolves to the same root, so the common case is fine — but if `enter` runs in a directory under a *different* enclosing `.stack-control` than the intercepted tool call's `cwd` (nested installations, or a skill that `cd`s across an installation boundary), the marker is written to root A and read from root B, and the sanctioned call is refused with no diagnostic distinguishing it from a genuine raw call.

This compounds with the session-id assumption (AUDIT-BARRAGE-claude-01): there are now *two* independent identifiers (session_id, resolved install root) that must agree for a permit, and a mismatch in either produces an identical opaque refusal. Worth surfacing in the refuse reason whether a marker file existed-but-didn't-match vs. no installation found, so the failure is diagnosable rather than presenting as "the interceptor is broken."

---

### AUDIT-20260618-106 — This diff adds `hooks/hooks.json` but wires nothing to register it — the interceptor is inert until T018, and no test asserts the plugin actually loads it

Finding-ID: AUDIT-20260618-106
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    `hooks/hooks.json` (new), `src/__tests__/capability/intercept.test.ts:96-108`

The hook file is created and its *shape* is tested (matchers are `['Bash','Skill']`, command is `${CLAUDE_PLUGIN_ROOT}/bin/intercept`), but the test comment concedes "live hook REGISTRATION is the T018 install-time gate." Nothing in this diff connects `hooks/hooks.json` to the plugin manifest or proves Claude Code auto-discovers it at this path. Until that lands, the *entire mediation surface is dead code on a real install* — every test passes (they exercise `interceptDecision`/verbs directly), giving a green suite that does not prove the feature does anything end-to-end.

This is the classic "passing tests, inert feature" gap the project's own UI-verification rule warns against (assertions must trace to an operator-perceivable outcome). The shape test verifies the agent's mental model of the wiring, not that an actual `backlog list` issued in a session gets denied. Recommend: confirm `hooks/hooks.json` at the plugin root is the auto-discovered convention (not `.claude-plugin/`), and that T018 includes a live "raw `backlog` is denied / front-door `backlog` is permitted" smoke before this is claimed functional.

---

### AUDIT-20260618-107 — 12h staleness prune can refuse a sanctioned drive that outlives the bound, with no mid-drive renewal

Finding-ID: AUDIT-20260618-107
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    `src/capability/marker.ts:48-57` (STALE_AGE_MS), `isFresh` usage in `activeCapabilities`

`activeCapabilities` filters out entries older than `STALE_AGE_MS` (12h). The marker's `writtenAt` is stamped once at `enter` and never refreshed. A front-door drive that legitimately runs longer than 12 hours (an unattended multi-phase `/speckit-implement` left running) would have its still-active marker pruned on read mid-drive, and the next backend call within that same sanctioned drive would be refused. The diff documents this tradeoff honestly in the `STALE_AGE_MS` comment, so it's a disclosed design choice rather than a hidden bug — flagging it because "industrialized, unattended execution independent of operator attention" is an explicit project thesis, and a 12h ceiling on a single sanctioned drive is in tension with that. If long unattended drives are a target, consider refreshing `writtenAt` on permitted intercepts within the marked capability, or making the bound configurable, rather than a fixed 12h.

---

A note on what I deliberately did **not** flag: the `speckit-guard` ENV-vs-FILE marker divergence and the registry-widened refusal set are both explicitly documented in-diff (TASK-165, claude-04/claude-07 notes) as known deprecation artifacts with tracking, so I'm not re-litigating them. The `bin/intercept` pipeline correctly captures `stackctl`'s exit code (`$?` after a pipeline is the last command), fails closed on non-zero, and the pre-filter is test-pinned to every registry backend — those checked clean.

### AUDIT-20260618-108 — Backlog marker example cannot authorize the raw backend call it wraps

Finding-ID: AUDIT-20260618-108
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    skills/backlog/SKILL.md:117-120; bin/intercept:22-24; src/capability/identity.ts:435-438

The backlog skill documents `front-door enter`, the raw `backlog` call, and `front-door exit` in one Bash block. PreToolUse evaluates the whole Bash payload before any line executes, so the marker written by line 118 is not active when `bin/intercept` inspects the payload at lines 22-24. The Bash matcher then sees `backlog` as one of the command argv0s via `argv0sOf` at `identity.ts:435-438` and refuses the call.

Blast radius is medium because the current skill says it uses `stackctl backlog`, but an unattended agent changing this skill to call the raw backend would naturally copy the shown block and get denied. The guidance should require separate tool invocations with the literal token carried between them, matching the spec skill docs.

### AUDIT-20260618-109 — Spec skill marker instructions depend on an unverified session-id equality

Finding-ID: AUDIT-20260618-109
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    skills/define/SKILL.md:130-134; skills/execute/SKILL.md:142-147; skills/extend/SKILL.md:82-87; src/subcommands/front-door.ts:59-64; src/capability/intercept.ts:76-78

The define, execute, and extend skill docs ship live instructions that write the marker under `$CLAUDE_CODE_SESSION_ID`, while the interceptor reads `payload.session_id` and uses that value to resolve active markers. The docs themselves state this equality is not live-verified. If those values differ, `activeCapabilities` reads a different marker file, sees no active capability, and refuses the sanctioned backend drive.

Blast radius is high because this is the permit path for all spec-definition and spec-execution raw backend calls. A reasonable fix is to make the session key source a verified contract before claiming the skill’s backend calls are permitted, or change the marker protocol so `enter` and the hook derive the same key from a shared, tested source.

### AUDIT-20260618-110 — Hook registration is not proven by the changed packaging surface

Finding-ID: AUDIT-20260618-110
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    hooks/hooks.json:1-24; .claude-plugin/plugin.json:1-5; .codex-plugin/plugin.json:19-20; src/__tests__/capability/intercept.test.ts:90-107

The diff adds `hooks/hooks.json`, but the visible plugin manifests do not reference it. The Codex manifest only points at `./skills/`, and the Claude manifest is just name/version metadata. The hook-adjacent test asserts JSON shape and file existence, but it does not verify that an installed plugin actually registers the PreToolUse hook.

Blast radius is medium: if the plugin loader does not auto-discover exactly this path and shape, the mediation code is inert with green unit tests. Add explicit manifest wiring if the plugin schema requires it, or add an install-level smoke that proves a raw fronted backend call reaches `bin/intercept`.

## 2026-06-18 — audit-barrage lift (20260618T050530657Z-026-capability-interface-mediation-phase-4)

### AUDIT-20260618-111 — `args[i]!` non-null assertion bypasses the project's strict-typing rule

Finding-ID: AUDIT-20260618-111
Status: migrated-to-backlog TASK-166
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/capability.ts:50 (`const arg = args[i]!;`)

The flag-parsing loop reads `const arg = args[i]!;` under `for (let i = 1; i < args.length; i++)`. With `noUncheckedIndexedAccess`, `args[i]` is `string | undefined`, and the `!` non-null assertion silences that. The project guidelines (`CLAUDE.md`: "Never bypass typing — no `any`, no `as Type`, no `@ts-ignore`") prohibit typing bypasses; the non-null assertion is in the same family. Blast radius is effectively zero at runtime — the loop bound provably makes the index valid — so this is hygiene, not a correctness defect. The drift-free fix is `for (const arg of args.slice(1))`, which eliminates the assertion entirely and reads more clearly. Worth noting because the codebase otherwise holds a strict no-bypass line and this is the one spot that breaks it.

### AUDIT-20260618-112 — `USAGE` angle-bracket notation labels a literal subcommand as a placeholder

Finding-ID: AUDIT-20260618-112
Status: migrated-to-backlog TASK-167
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/capability.ts:11 (`const USAGE = 'usage: stackctl capability <list> [--json]';`)

The usage string renders `<list>` in angle brackets. By near-universal CLI convention, `<foo>` denotes a *required variable placeholder* the user substitutes, whereas `list` here is a literal subaction keyword (the only valid one — `capability.ts:35` rejects anything but `'list'`). An agent reading the error output (which is the only place this string surfaces, via `usageErr`) could plausibly read `<list>` as "supply a list argument here" rather than "type the word `list`". Since the audience is agents acting unattended on the usage line, the mild ambiguity is worth correcting to `usage: stackctl capability list [--json]` (or `capability {list}`). No behavioral consequence — purely the readability of the error surface.

### AUDIT-20260618-113 — Forward-reference comment to "Phase 5 adds the reconcile subaction"

Finding-ID: AUDIT-20260618-113
Status: migrated-to-backlog TASK-168
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/capability.ts:5-6 (header comment)

The header comment ends with "(Phase 5 adds the `reconcile` subaction in its own module to keep this file's phase scope stable.)". The project's `agent-discipline.md` rule ("Just for now is bullshit") and this barrage's hard constraints flag forward-phase references in comments as potential deferral/IOU breadcrumbs. This instance is defensible — it is a *scope-boundary note* explaining why `reconcile` is intentionally absent from this module, not an IOU promising to finish broken current functionality, and it does not gate any shipped behavior. It is surfaced per the constraint to call out future-phase phrases, with the recommendation to leave it as-is (it documents a deliberate modular split) or, if the rule is read strictly, point it at the tracking artifact (roadmap item / spec section) rather than a bare "Phase 5".

### AUDIT-20260618-114 — Audited surface is untracked working-tree files, not the named commit range

Finding-ID: AUDIT-20260618-114
Status: migrated-to-backlog TASK-169
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/capability.ts, src/__tests__/subcommands/capability.test.ts (both `new file`, untracked)

Provenance note for the operator's triage, not a code defect. The barrage header names the audited commit range as `cca46ab0 — T007–T018`, but the two files under audit are headed `T019`/`T020` and are shown as `new file mode` (and appear as `??` untracked in the session's git status). So this review is of uncommitted working-tree work that post-dates the named commit, and `src/cli.ts` (which I read to confirm the wiring at line 139) is also modified-but-uncommitted. The implication: whatever pre-commit/governance gate runs at commit time has not yet exercised these files, and the test-suite delta these add is not yet reflected in any committed count. Flagging so the finding set is joined to the right SHA when these land.

### AUDIT-20260618-115 — CLI wrapper `runCapabilityCli` (process.exit path) has no test

Finding-ID: AUDIT-20260618-115
Status: migrated-to-backlog TASK-170
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/subcommands/capability.ts:60-66 (`runCapabilityCli`)

The pure core `capability()` is thoroughly tested (exit codes, `--json` shape, registry-equality, rejection cases). The thin wrapper `runCapabilityCli` — which does `process.stdout/stderr.write` and `process.exit(result.code)` — is not exercised by any test in the diff. This matches the established split in the file ("Pure core … hermetically testable; `runCapabilityCli` does the process I/O + exit") and mirrors how sibling subcommands are structured, so it is an accepted trade-off rather than a gap to fix. Surfaced only because a future refactor that moves logic *into* the wrapper (e.g. argv slicing, env reads) would silently escape coverage; the contract boundary to preserve is "the wrapper stays trivial." No action needed as written.

---

**Summary for triage:** No `blocking`/`high`/`medium` findings. The implementation is correct and well-factored — single-source registry read (FR-012) is honored verbatim by the `--json` equality test, the human render pulls every field from `CAPABILITY_REGISTRY`, exit codes are typed `0 | 2` with no magic, and all error paths (`bogus`, `--nope`, empty args) are covered. The five notes above are hygiene (`-01`, `-02`), a defensible-but-flagged comment (`-03`), and two provenance/coverage informationals (`-04`, `-05`). What I checked that came back clean: argument parsing edge cases (empty, duplicate `--json`, unknown flag/subaction), the `redirectFor` empty-interface throw path (unreachable for the static registry, which `validateRegistry` guards), CLI wiring (present at `cli.ts:139`), and registry/test data agreement.

### AUDIT-20260618-116 — Deferral Phrase In Implementation Comment

Finding-ID: AUDIT-20260618-116
Status: migrated-to-backlog TASK-171
Severity:   low
Per-lane:   codex=low
Decision:   single-model (gate-counted low)
Surface:    src/subcommands/capability.ts:5-6

The file header says, “Phase 5 adds the `reconcile` subaction in its own module,” which is a deferred-work statement embedded in the implementation. The audit prompt explicitly rejects deferral phrases because they can normalize incomplete behavior as intentional scope rather than making the current contract stand on its own.

The blast radius is low because this comment does not change runtime behavior for `stackctl capability list`, and the implemented `list` path appears coherent. A reasonable fix is to remove the future-phase note from the code comment or replace it with a present-tense description of this module’s current responsibility only.
