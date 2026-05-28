# Hygiene — design

A family of small, UNIX-style `/dw-lifecycle:` skills that make permanent debt burndown a sustainable habit. Hygiene is not a sprint with a finish line; it is the operational pattern by which this project keeps its open-issue backlog, workplan deferrals, and parked branches from rotting into invisible IOUs.

## Problem

Three converging debt sources accumulate silently and compound. None is currently tracked across categories:

1. **Stale GitHub issues.** 180 open issues (81 enhancement, 52 bug, 46 unlabeled at the time of this spec). The oldest unlabeled issues have no clear disposition; nobody triages them; new contributors can't tell what's actionable. The backlog isn't a queue — it's a midden.

2. **Workplan deferrals as invisible IOUs.** 88 lines tagged `TBD`, `defer`, `follow-up`, or `out of scope` across in-progress workplans. Most aren't tracked in GitHub. Per the project's existing `Just for now is bullshit` rule (`.claude/rules/agent-discipline.md`), these are the exact pattern the rule names: "Code-side breadcrumb + future-dispatch promise" without a tracked disposition. The rule exists; mechanical enforcement does not.

3. **Parked branches with real work.** `feature/studio-bridge` carries 35 unmerged commits intentionally deferred until a security gap closes; `feature/deskwork-open-issue-tranche-cleanup` is a stalled placeholder; several other feature branches show no activity. Each represents either work to merge, work to archive, or noise to clear — no skill exists to decide.

The operator's framing on shape: *"it might never end. we always need hygiene."* This reframes the goal from "burn N debts before Friday" to "ship the tooling and operational pattern that makes recurring burndown sustainable indefinitely." Any kickoff sprint is dogfooding against real work, not the deliverable.

## Goal

Ship a family of small, focused `/dw-lifecycle:` skills (one action per skill, UNIX-style) that:

- Surface debt across all three categories on demand, without a heavyweight scan-everything report.
- Drive operator-triggered batched-proposal cycles for stale GitHub issues (agent proposes dispositions per item, operator approves the batch).
- Promote workplan TBDs into tracked GitHub issues with mechanical back-links, OR record explicit "wontfix because <substantive-reason>" inline.
- Decide the fate of a parked branch (archive-tag + delete, or leave with explicit reason).
- Integrate with the natural lifecycle waypoints (session-end captures hygiene observations + writes a next-session recommendation; complete sweeps for unaddressed TBDs before merge; release closes shipped-in-this-version issues).
- Share no persistent state — every skill reads live state (GitHub via `gh`, workplans via grep, branches via git) and mutates the same source-of-truth.

The deliverable is the skills + lifecycle integration. The first dogfood round (run by the operator against the existing backlog) validates the tooling against real work; it is not "the work."

## Scope

**In:**

- Six new skills (read-only `:debt-report`; GitHub-category `:triage-issues` + `:close-shipped`; workplan-category `:promote-deferrals`; branch-category `:archive-branch`).
- Three lifecycle-integration touches (session-end addition; complete pre-merge gate; release close-shipped invocation).
- Per-skill helper scripts under `plugins/dw-lifecycle/src/subcommands/` mirroring existing layout.
- Vitest unit + integration tests against fixture projects + mocked `gh` stub.
- Local smoke script for end-to-end wiring (no CI bloat per project rule).
- Adopter-facing documentation: README section + per-skill SKILL.md prose.
- Tear-down of the stalled `feature/deskwork-open-issue-tranche-cleanup` branch + worktree before `hygiene` infrastructure stands up.

**Out:**

- A debt-registry / persistent state file. The source-of-truth stays in GitHub + workplan markdown + git refs. Adding a new layer (`.dw-lifecycle/debt-registry.json` etc.) would introduce its own drift surface; rejected during brainstorm.
- A doctor-rule-centric model where every debt category becomes a doctor finding. Rejected in favor of skill-centric UNIX composability — operator picks the tool for the job, no monolithic "what's wrong" surface.
- A "session-start hygiene injection." Operator's correction during brainstorm: session-start must stay lightweight (re-entry, not ceremony). Session-end is the right capture point because it has the just-completed work's context to inform the next session's recommendation.
- Code-vs-rule drift detection (rules in `.claude/rules/` that have no mechanical enforcement). Distinct concern; potential follow-up.
- Doctor / scope-discovery findings burndown as a distinct skill. Those flows already exist in their respective subsystems; hygiene doesn't subsume them.
- Pixel-diff visual-regression burndown. Out of scope; sibling concern to the in-flight `visual-verification-gate` feature.

## Approach

### Skill family — one action per skill

Six v1 skills, each scoped to a single debt source + a single action:

**Read-only:**

- **`/dw-lifecycle:debt-report`** — cross-source snapshot. Counts open issues by label / age / stale-since-last-comment; workplan-TBD totals per in-progress feature; parked-branch list with ahead/behind status. Pure observation. Output is a markdown table (operator-readable) + JSON (downstream-readable). The "what's the state right now" surface.

**GitHub-issue category:**

- **`/dw-lifecycle:triage-issues`** — operator-triggered batched-proposal cycle. Flags: `--bucket <name>` (e.g., `stale-30d`, `unlabeled`, `bug-no-comment-7d`), `--limit N` (default ~10 for batch-reviewability). Fetches matching issues via `gh`. The agent proposes a disposition per item with one-paragraph reasoning (close-wontfix with reason, add labels, mark as duplicate, leave-with-comment). Operator reviews the full batch, approves (`y` / `1,3,5` for partial / `n` to abort). Per-item rejection loops the agent back through proposal for those items. Approved decisions apply via `gh`.
- **`/dw-lifecycle:close-shipped`** — invoked at release time. Reads release notes / git log between two tags, finds issues referenced as fixed/closed in commits, posts a "fixed in v<X>, please verify against the install" comment, transitions to a "pending-verification" state (a label, not closure). Per the project's `Issue closure requires verification in a formally-installed release` rule — closure waits for verification, not commit.

**Workplan-deferral category:**

- **`/dw-lifecycle:promote-deferrals`** — scans a target workplan (operator picks; one workplan per invocation to keep batches reviewable) for `TBD:`, `defer`, `follow-up:`, `out of scope`-style markers. For each, the agent proposes either (a) convert-to-GitHub-issue with the surrounding workplan context + back-link OR (b) inline "wontfix because <substantive-reason ≥40 chars, no gaming phrases>". Operator approves the batch. Approved (a)-items: skill creates issues via `gh issue create` + edits the workplan to replace the bare TBD with `[debt: #NNN]` back-link. Approved (b)-items: skill replaces the bare TBD with the substantive-reason text inline.

**Branch-debt category:**

- **`/dw-lifecycle:archive-branch <branch>`** — for a parked branch the operator wants to remove from the working set. Creates an annotated tag (`archived/<branch>-<YYYY-MM-DD>`) pointing at the branch tip, pushes the tag, deletes the branch (after confirming no checked-out worktree). The annotated tag preserves the work forever; the branch list de-clutters. Designed for the `studio-bridge` / `canary-feedback-fixes` / etc. parked-branch case. Refuses if the branch has uncommitted work in a worktree OR if the tag already exists.

### Lifecycle integration — modifications to existing skills

- **`/dw-lifecycle:session-end`** — adds a "hygiene observations + next-session recommendation" block. Captures debts noticed during the session (TBDs the agent wrote, issues that surfaced in passing, debt-shaped patterns in the commit log) and writes a small, targeted recommendation for the next session's hygiene slice. The recommendation lands in `DEVELOPMENT-NOTES.md`. **Session-start does NOT do a fresh scan** — it just displays the recommendation written by the prior session's session-end. Re-entry stays cheap; momentum is not killed.
- **`/dw-lifecycle:complete`** — adds a pre-merge gate: fails if the closing feature's workplan has any uncalled-out TBDs (no `[debt: #NNN]` back-link, no inline "wontfix because <substantive-reason>"). Operator must run `/dw-lifecycle:promote-deferrals` on the workplan first, or invoke `complete --skip-tbd-gate --reason "<substantive>"` for an explicit override (the override reason gets logged in the session journal).
- **`/release`** (optional) — adds the `:close-shipped` invocation as a post-publish step. Operator-overridable.

### Data flow (worked example: `:triage-issues`)

1. **Operator invokes:** `/dw-lifecycle:triage-issues --bucket stale-30d --limit 10`
2. **Skill fetches state:** `gh issue list --search "updated:<2026-04-28 state:open" --limit 10 --json number,title,body,labels,comments`. Pure read.
3. **Skill builds proposals:** for each issue, the agent (in the calling conversation) generates a proposed disposition with one-paragraph reasoning. Format is uniform — markdown table or numbered list.
4. **Operator reviews:** sees all 10 proposals at once. Approves (`y` / `1,3,5` for partial / `n` to abort). Can reject individual items with corrections that loop back to step 3 for those items.
5. **Skill applies approved decisions:** one `gh` call per approved disposition. Failures do not roll back the rest — partial success is fine, surfaced at the end.
6. **Skill reports:** "Applied X dispositions, Y failures with reasons, Z deferred to the next pass."

The same shape applies across skills — fetch live state, propose, gate, apply. The "batched proposal" pattern lives in the calling conversation, not a separate UI surface.

### Error handling — three failure shapes per skill

- **Fetch-time failure** (gh auth, network, rate limit, malformed workplan): skill aborts before any mutation, surfaces the cause, no partial state. Operator fixes and re-runs.
- **Per-item proposal failure** (issue body unreadable, can't parse a workplan deferral's surrounding context): item skipped from the batch with a "could-not-propose" note. Other items propose normally.
- **Per-item apply failure** (gh write fails, git mutation conflicts, workplan edit collides with concurrent change): the failing item gets a "failed to apply: <reason>" line in the report; the rest of the batch lands. No rollback. Per the project's existing pattern, partial success is visible and acceptable.

### Testing strategy

Per `.claude/rules/testing.md`:

- **Unit (vitest):** per-skill helper-script logic — proposal-formatter, bucket-query-builder, workplan-TBD-parser, archive-branch-tag-namer. Fast, in-memory.
- **Integration (vitest + tmp fixtures):** each skill against a fixture project tree (mocked `gh` via env-var stub or a recorded-response harness; fixture workplans with seeded TBDs). Verifies the fetch → propose → apply path against a synthetic but realistic shape.
- **Local smoke (no CI):** the new `bin/dw-lifecycle` subcommands invoked end-to-end against a throwaway `gh` fixture repo + a fixture workplan tree. Confirms wiring, not behavior.

Per project rule, no test infrastructure added to CI — `npm --workspace @deskwork/plugin-dw-lifecycle test` continues to run vitest fast.

## Acceptance criteria

- [ ] `/dw-lifecycle:debt-report` ships; emits markdown + JSON across the three categories.
- [ ] `/dw-lifecycle:triage-issues` ships; supports at least the `stale-30d`, `unlabeled`, and `bug-no-comment-7d` buckets; partial-approval works; partial-success surfaces failures with reasons.
- [ ] `/dw-lifecycle:close-shipped` ships; reads commit log between two tags; transitions matching issues to a pending-verification label (does NOT close).
- [ ] `/dw-lifecycle:promote-deferrals` ships; finds all `TBD:` / `defer` / `follow-up:` / `out of scope` patterns in a target workplan; supports promote-to-issue and inline-wontfix dispositions; substantive-reason validator enforced for wontfix.
- [ ] `/dw-lifecycle:archive-branch` ships; creates `archived/<branch>-<date>` annotated tag; pushes; deletes the branch; refuses on dirty worktree or pre-existing tag.
- [ ] `/dw-lifecycle:session-end` carries the hygiene-observations + next-session-recommendation block; lands in `DEVELOPMENT-NOTES.md`.
- [ ] `/dw-lifecycle:session-start` displays the prior session's recommendation without re-scanning.
- [ ] `/dw-lifecycle:complete` carries the pre-merge TBD gate; supports `--skip-tbd-gate --reason "<substantive>"` override with logged reason.
- [ ] `/release` (optional) invokes `:close-shipped` post-publish.
- [ ] All v1 skills carry vitest unit + integration tests against fixture projects.
- [ ] Local smoke script exercises end-to-end wiring.
- [ ] Adopter-facing docs (README + per-skill SKILL.md) explain the skills + the operational pattern.
- [ ] Pre-existing stalled `feature/deskwork-open-issue-tranche-cleanup` branch + worktree are torn down as part of the hygiene feature's setup.
- [ ] Dogfood round against the existing backlog runs at least one full batched-proposal cycle for each of `:triage-issues` and `:promote-deferrals`, exercising the proposal → approval → apply path against real items.

## Tasks (high-level phases)

Capture-mode enumeration. Operator scopes into phases / v1 cut during PRD iteration.

- [ ] **P0 — Infrastructure teardown.** Remove the stalled `feature/deskwork-open-issue-tranche-cleanup` branch + worktree.
- [ ] **P1 — Read-only baseline.** Ship `/dw-lifecycle:debt-report`. No mutations; lowest blast radius.
- [ ] **P2 — GitHub-issue triage.** Ship `/dw-lifecycle:triage-issues` (multi-bucket support; batched-proposal infrastructure that subsequent skills reuse).
- [ ] **P3 — Workplan-deferral promotion.** Ship `/dw-lifecycle:promote-deferrals`. Reuses the batched-proposal pattern from P2.
- [ ] **P4 — Branch archive.** Ship `/dw-lifecycle:archive-branch`.
- [ ] **P5 — Release-time issue closure.** Ship `/dw-lifecycle:close-shipped`; wire into `/release`.
- [ ] **P6 — Lifecycle integration.** Modify `/dw-lifecycle:session-end` (recommendation-writing) + `/dw-lifecycle:session-start` (recommendation-displaying) + `/dw-lifecycle:complete` (pre-merge TBD gate).
- [ ] **P7 — Documentation.** README section + per-skill SKILL.md prose + the operational-pattern narrative.
- [ ] **P8 — Tests + smoke.** Vitest unit + integration + local smoke script.
- [ ] **P9 — Dogfood round.** Run `:triage-issues` + `:promote-deferrals` against the existing backlog.

## Open questions (capture-mode)

- **Bucket vocabulary for `:triage-issues`.** Initial set: `stale-30d`, `unlabeled`, `bug-no-comment-7d`. Are there others the operator knows are load-bearing (e.g., `pre-release-tag`, `assigned-but-stale`, `mentions-shipped-feature`)? Decided during PRD iteration.
- **TBD-pattern detection in `:promote-deferrals`.** Currently `TBD:`, `defer`, `follow-up:`, `out of scope`. Worth adding `FIXME` / `HACK` / `XXX` / `for now` / `temporary` (per the `Just for now is bullshit` rule)? Operator decides during PRD iteration; likely yes.
- **Substantive-reason validator for inline wontfix in `:promote-deferrals`.** Mirror the in-flight `visual-verification-gate` feature's pattern (≥40 chars, no gaming phrases like `for now`, `next pass`, `TBD`)? Yes by default; lock in during PRD iteration.
- **`complete` pre-merge gate strictness.** Default to refuse-on-TBD, override needs substantive reason. Or default to warn? Operator policy on "teeth as default" (from the visual-verification-gate brainstorm) suggests refuse; confirm during PRD iteration.
- **`session-end` recommendation source.** Agent-generated from the session's commits + DEVELOPMENT-NOTES.md draft? Or hand-authored by the operator with agent help? Probably agent-drafted, operator-edits; lock in during PRD iteration.
- **Override-skip pattern.** All "teeth-as-default" skills should accept an explicit override flag with a substantive reason that gets logged. Mirror the visual-verification-gate marker pattern. Confirm during PRD iteration.
- **Adopter-customizable pieces.** Which knobs should adopters be able to override per-project (bucket vocabulary, TBD-pattern regex, archive-tag namer)? Decided during PRD iteration.

## Dependencies

- **`gh` CLI** must be on PATH (already a project requirement).
- **`.claude/rules/agent-discipline.md`** § `Just for now is bullshit` — this feature mechanizes part of the rule. The rule stays canonical; the skills enforce it where they can.
- **Project's existing dw-lifecycle plugin structure** — new skills live alongside existing ones under `plugins/dw-lifecycle/skills/`, helper scripts under `plugins/dw-lifecycle/src/subcommands/`.
- **`/release` skill** — `:close-shipped` integration is optional; the release skill needs a hook point.
- **`DEVELOPMENT-NOTES.md`** — recommendation-block format adds a new section to the journal entry shape.

## Cross-references

- Project rule: `.claude/rules/agent-discipline.md` § "Just for now is bullshit" (the in-code-comment IOU pattern this feature partly mechanizes)
- Project rule: `.claude/rules/agent-discipline.md` § "Operator owns scope decisions" (the batched-proposal-with-operator-approval pattern this feature uses)
- Project rule: `.claude/rules/testing.md` (testing strategy)
- In-flight feature: `feature/visual-verification-gate` (companion pattern — `Captured-debt:` marker mirrors `Visual-verify:` marker shape; substantive-reason validator is shared infrastructure)
- Issue closure policy: `.claude/rules/agent-discipline.md` § "Issue closure requires verification in a formally-installed release" (drives `:close-shipped`'s "pending-verification" label rather than direct closure)
- Plugin convention: `.claude/CLAUDE.md` § Plugin Conventions ("Skills are composable and UNIX-style — one skill per action, never a monolith")
