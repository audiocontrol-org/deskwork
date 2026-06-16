# Quickstart: Lifecycle Compass — validation scenarios

Runnable validation that the feature works end-to-end. Each scenario maps to a Success
Criterion (SC-00x) and the acceptance scenarios in [spec.md](./spec.md). Contracts referenced,
not duplicated — see [contracts/](./contracts/).

## Prerequisites

- Repo: `plugins/stack-control/` (this installation). Run from the plugin root.
- The 022 workflow engine present (it is — shipped v0.48.0). Governed `WORKFLOW.md` resolves.
- Tests: `npm test` (Vitest) from the plugin root. Fixtures are on-disk installations under
  `src/__tests__/fixtures/` (real trees, never mocked FS — `.claude/rules/testing.md`).

## Scenario 1 — Compass orients and diffs intent (SC-001, US1)

```bash
# Orientation (no intent) — read-only map
stackctl workflow compass <item>
# expect: current phase, the single legitimate next action, exit gate M of N — exit 0

# Skip detection — intent belongs to a later phase
stackctl workflow compass <planned-item> --intent define
# expect: verdict: ahead; skipped step: designing; exit non-zero

# On-course — intent is the legitimate next move
stackctl workflow compass <designing-item> --intent design   # or the legit next intent
# expect: verdict: on-course; exit 0

# Orphan — spec dir with no roadmap node
stackctl workflow compass <orphan> --intent define
# expect: verdict: off-rail; names the missing node; exit non-zero

# Determinism / read-only — run twice, no on-disk change
stackctl workflow compass <item> > /tmp/a; stackctl workflow compass <item> > /tmp/b
diff /tmp/a /tmp/b   # expect: identical; git status clean (nothing written)
```

**Expected**: one verdict per case, matching exit code; `ahead` always names the jumped step
(SC-001). Automated by `compass.test.ts` (verdict matrix) + `compass-cli.test.ts` (exit codes,
read-only). Unknown intent (`--intent frobnicate`) exits `2` naming the known set (FR-004,
`intent-vocabulary.test.ts`).

## Scenario 2 — Every lifecycle skill refuses an off-rail action (SC-002, US2)

```bash
# A planned item (no design record): invoking the spec-authoring skill must refuse
/stack-control:define <planned-item>
# expect: refusal naming the skipped 'designing' step; NO spec authored, NO file written

# An on-course item: the skill proceeds
/stack-control:define <designing-item-ready-to-specify>
# expect: proceeds normally
```

**Expected**: a non-zero compass verdict ⇒ the skill performs none of its work and refuses
loud (contracts/skill-precondition.md). Automated by `lifecycle-precondition.test.ts`; the
SKILL.md opening step is exercised via the shared helper, not by invoking the model.

## Scenario 3 — Capture fused to authoring; no orphans through the front door (SC-003, US3)

```bash
# Author a spec through the supported path → a roadmap node exists in the same move
/stack-control:define <new-feature>
stackctl roadmap show <new-node>      # expect: node exists, references the spec dir

# A hand-created orphan spec dir is a hard error for every spec-resolving verb
mkdir specs/099-orphan && touch specs/099-orphan/spec.md
stackctl workflow compass 099-orphan  # expect: off-rail / hard error naming missing node
```

**Expected**: through the front door a spec dir cannot exist without a node (FR-008); an orphan
is a hard error, not a reconcile footnote (FR-009). Automated by `capture-fusion.test.ts`.

## Scenario 4 — Govern runnable on the session-pinned branch (SC-004, US4)

```bash
# On feature/stack-control, govern resolves the feature from the item's spec pointer
stackctl govern --mode implement <item-with-spec-pointer>
# expect: NO "feature 'stack-control' not found" FATAL

# A spec containing a /stack-control:* backtick span does not crash payload assembly
#   (fixture: a tasks.md phase body with `/stack-control:define`)
stackctl govern --mode implement <item-with-skill-ref-span>
# expect: payload assembles; NO "escapes the installation root" FATAL
```

**Expected**: feature resolves via spec pointer / SPECKIT marker (FR-011); a skill-reference
backtick span is not treated as a governed path (FR-012, TASK-83). Automated by
`govern-resolution.test.ts`.

## Scenario 5 — One canonical identity; no basename collision (SC-005, US6)

```bash
# Two specs sharing a dir basename do not collide on the convergence record
#   (fixture: two items whose naive key would collide — see contracts/canonical-identity.md)
stackctl govern --mode impl <item-A>     # converges A
stackctl workflow status <item-B>        # expect: B NOT reported converged by A's record
```

**Expected**: convergence records are keyed by the canonical node id, not the spec-dir
basename (FR-013); compass, govern, and `close-related` agree on identity. Automated by
`canonical-identity.test.ts`.

## Scenario 6 — The demonstrated 023-class failure is now mechanically impossible (SC-006)

Re-run the failure the feature exists to prevent: author a feature *without* capture.

```bash
# Attempt to author a spec with no roadmap node, through the lifecycle skill
/stack-control:define <no-node-feature>
# expect: refused at the first skipped step (off-rail / ahead) — no spec authored off-rail
```

**Expected**: the workflow refuses at the first skipped step for an agent following its skills
(SC-006). The honest boundary (FR-014): a human with raw `git`/`gh` can still bypass — this is
documented, not claimed prevented. Verified end-to-end after implementation via the installed
plugin (closure requires a formally-installed release, per project rule — the agent posts
evidence, the operator decides closure).

## Test → criterion map

| Test | Criterion | Contract |
|---|---|---|
| `compass.test.ts` | SC-001 | compass-cli, intent-vocabulary |
| `compass-cli.test.ts` | SC-001 | compass-cli |
| `intent-vocabulary.test.ts` | FR-004 | intent-vocabulary |
| `lifecycle-precondition.test.ts` | SC-002 | skill-precondition |
| `capture-fusion.test.ts` | SC-003 | (authoring path) |
| `govern-resolution.test.ts` | SC-004 | govern-resolution |
| `canonical-identity.test.ts` | SC-005 | canonical-identity |
| end-to-end (post-release) | SC-006 | all |
