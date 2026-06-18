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
