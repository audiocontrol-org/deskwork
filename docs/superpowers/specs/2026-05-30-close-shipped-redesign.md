---
slug: close-shipped-redesign
date: 2026-05-30
kind: design-spec
status: design-approved
supersedes: parts of #366 + all of #369
---

# close-shipped redesign — narrow mechanically, judge with an agent

## Problem

`/dw-lifecycle:close-shipped` infers "this commit shipped a fix for issue #N" from free-form prose across four evidence sources (commit-log, audit-log, tooling-feedback, workplan-checkbox). Every release surfaces a new convention or false-positive shape that requires a new regex, knob, or field. Phases 11 → 14 are the four patches the design has accrued:

| Phase | What it added | Why |
|---|---|---|
| 11 (v0.26.0) | Original 4-walker prose sweep | Initial implementation |
| 13 (v0.27.0) | Drop `refs` / `parens` / `plain` from commit-log; add `Merge pull request` filter | False-positives surfaced in v0.27.0 install dogfood |
| 14 Task 1 (v0.28.1 pending) | Config knob to re-enable end-of-subject parens | Strict v0.27.0 narrowing missed this project's commit convention |
| 14 Task 2 (v0.28.1 pending) | `Tracks-Issue` field for audit-log + splitter heading-level fix | False-positives from prose-cited fixture text inside AUDIT entries |

The **convention-sensitivity** failure mode is the most painful: every adopter project has its own commit-message + audit-log + workplan conventions; the walkers either guess wrong or make the operator hand-tune knobs. The system never converges; each release exposes a new edge case. Even the Phase 14 Task 1 acceptance criterion was wrong as written — the strict narrowing was correct per GitHub's auto-close grammar but the project's own convention didn't match, and the configurable-parens fix re-introduces a documented limitation (back-fill docs commits whose subject happens to end in `(#NNN)`).

The structural problem: **we are re-deriving fix-ship semantics from prose, in four sources, each with its own grammar**. Continuing down this path means an unbounded patching cycle whose marginal value declines with each fix.

## Decision

Replace the per-walker decision logic with **mechanical narrowing + agent judgment + operator-curated propose | apply**. The mechanical step is intentionally permissive (extract every `#NNN` mention regardless of context); the agent reads a per-candidate evidence bundle and renders a verdict; the operator reviews the verdicts in a batched-proposal JSON before any GitHub mutations land.

## Architecture

```
                                                              ┌───────────────────────────┐
        ┌── commit-log mention scan                           │                           │
        │                                                     │   per-candidate           │
        ├── PR description scan                               │   evidence bundle         │
walk ───┤                                                ─►   │   {issue, commits,        ├──► agent dispatch (parallel)
range   ├── audit-log Tracks-Issue + body mention                │    pr, audit, workplan}   │     │
        │                                                     │                           │     │   verdict + reason
        └── workplan-checkbox back-fill                          └───────────────────────────┘     ▼
                                                                                            proposals-<ts>.json
                                                                                                  │
                                                                                                  ▼
                                                                                            operator review
                                                                                                  │
                                                                                                  ▼
                                                                                            apply (gh comment + label)
```

**Step 1 — Narrow (mechanical, permissive):** walk the four sources in the tag range; extract every `#NNN` mention regardless of verb, position, or context. The output is the candidate issue set: every issue number that appears anywhere in the release's evidence corpus. No grammar to maintain; no false-negative risk from convention mismatch.

**Step 2 — Bundle (mechanical):** for each candidate issue, collect the evidence the agent will read. Five components per bundle — see § Evidence bundle below.

**Step 3 — Dispatch (agent, parallel):** one agent invocation per candidate, dispatched in parallel via `child_process.spawn` subprocess pattern (same shape as `scope-discovery/audit-barrage/spawn-cli.ts`). The default invocation is `claude -p` with the prompt on stdin; the project-level config knob can swap to `codex exec` or `gemini` for adopters using a different default agent CLI. The prompt is a strict-JSON classification task with three possible verdicts (`shipped` / `not-shipped` / `uncertain`) plus a one-sentence reason. See § Prompt below. Standalone-CLI design — works whether or not the operator is invoking `dw-lifecycle close-shipped propose` from inside Claude Code.

**Step 4 — Propose (write):** all verdicts land in a `proposals-<timestamp>.json` file under `.dw-lifecycle/close-shipped/`. The CLI prints a markdown table summarizing the verdicts for operator scanning. See § Proposal JSON below.

**Step 5 — Operator review:** the operator fills in a `decision` field per item (`accept-verdict` / `override-shipped` / `override-not-shipped` / `skip`). This is the disposition gate.

**Step 6 — Apply (mechanical):** the operator runs `close-shipped apply --proposal <path>`. Pre-validation: every item must have a non-empty decision. For each effectively-shipped row: post the `pending-verification` comment + add the label via `gh`. Per-item dispatch is best-effort; partial failures recorded.

## Evidence bundle

For each candidate issue, the bundle carries five components:

```yaml
issue:
  number: 361
  title: "session-end-hygiene 'issues filed this session' sweeps..."
  state: OPEN | CLOSED
  body: <truncated to ~1k chars; trailing ellipsis if cut>
  recent_comments: <last 3 comments, ~300 chars each>

commits:                        # every commit in tag range that mentions #N anywhere
  - sha: 8841be9
    subject: "feat(dw-lifecycle): Phase 12 Task 1 — ..."
    body: <truncated to ~500 chars>
    diff_stat: "12 files changed, 631 insertions(+), 236 deletions(-)"

pr:                              # GitHub PR data IF any commits in the bundle merged via PR
  number: 365
  title: "feat(hygiene): ..."
  body: <truncated to ~1k chars>

audit_log_entries:               # entries that reference #N (any source: Tracks-Issue or body)
  - finding_id: AUDIT-20260529-02
    status: fixed-d8e08f0
    tracks_issue: 361
    surface: "plugins/dw-lifecycle/src/.../session-end-hygiene.ts:90"
    body: <truncated to ~500 chars>

workplan_backfills:              # `[x]` task lines whose `· [#N](url)` link matches
  - file: docs/1.0/.../workplan.md
    line: 41
    text: "[x] Step 1: Implement debt-report. · [#325](...)"
```

**Truncation rules:** text fields use trailing `…` if over cap. Caps chosen for token budget: issue body 1k, commit body 500, PR body 1k, audit-log body 500. Numbers and structural fields never truncate.

**Total per-candidate budget:** ~2-5K tokens (high-end when the issue has many commits + a PR + multiple audit-log entries). For 20-30 candidates per release: ~50-150K tokens total agent input.

**Bundle assembly is mechanical.** Same code path for every candidate; no per-source decision logic. The judgment moves out of the assembly step and into the agent dispatch.

## Prompt

```
You are evaluating whether a GitHub issue's fix was shipped in a specific release range.

Issue #{n}: {title}
State: {state}
Body:
{body}

Recent comments:
{comments}

Evidence from the release (commits, PR, audit-log, workplan):
{bundle}

Question: Did the work above actually CLOSE this issue?

A commit/PR closes an issue if its work made the issue's reported problem go
away. References, back-links, cross-cites, and "tracks #N for context"
patterns are NOT closes. Mere mentions, back-fill links, or docs commits that
cite the issue number for context are NOT closes.

Return strict JSON only:
{"verdict": "shipped" | "not-shipped" | "uncertain", "reason": "<one sentence>"}
```

**Design intent:**
- Tight, single-task framing → classification not synthesis
- Three-state output (`uncertain` is a real verdict, not a "try again")
- One-sentence reason → enough for operator to spot-check; not enough to over-spend
- Strict-JSON contract → parser-friendly; no narrative drift

## Proposal JSON

```json
{
  "generated_at": "2026-05-30T03:15:22Z",
  "from_tag": "v0.27.0",
  "to_tag": "v0.28.1",
  "repo": "audiocontrol-org/deskwork",
  "items": [
    {
      "issue": 361,
      "issue_title": "session-end-hygiene 'issues filed this session' sweep",
      "issue_state": "OPEN",
      "agent_verdict": "shipped",
      "agent_reason": "Phase 12 Task 1 commit 8841be9 implements the commit-range walker the issue described.",
      "evidence_summary": "5 commits, 1 audit-log entry, in PR #365",
      "decision": ""
    }
  ]
}
```

**Field semantics:**
- `agent_verdict` ∈ {`shipped`, `not-shipped`, `uncertain`, `error`}. `error` is the failure path when the agent dispatch fails or the response can't be JSON-parsed.
- `agent_reason` is the agent's one-sentence text.
- `evidence_summary` is a mechanical summary of bundle contents (commit count + audit-log entry count + PR linkage) — useful for the operator's table scan.
- `decision` is empty after propose. Operator fills with one of `accept-verdict` / `override-shipped` / `override-not-shipped` / `skip`. `accept-verdict` means "go with whatever `agent_verdict` says" (so `shipped` triggers apply, `not-shipped` skips, `uncertain` skips with a warning). The two override values are operator's manual call. `skip` means "don't touch this issue regardless of verdict."

**CLI markdown table after propose:**

```
| #  | Issue | Title (truncated)              | State | Verdict     | Reason (truncated)                | Decision    |
|----|-------|--------------------------------|-------|-------------|-----------------------------------|-------------|
| 1  | #361  | session-end-hygiene ...        | OPEN  | shipped     | Phase 12 Task 1 commit 8841be9... | _(operator)_|
| 2  | #353  | scope-discovery audit-barrage  | OPEN  | not-shipped | back-fill docs commit, not a fix  | _(operator)_|
| 3  | #340  | session-end-hygiene calendar   | CLOSED| not-shipped | already CLOSED before this range  | _(operator)_|
```

**Pre-validation in apply:** every item's `decision` must be one of the four valid values. Empty decisions abort the whole apply pass with exit 2. Mirrors `triage-issues apply` / `dismantle-worktrees apply` / `complete-parent-closure apply`.

**Partial-failure recording in apply:** per-item gh mutation runs in best-effort mode. Failed items get recorded in the run summary (`applied`, `skipped`, `failed` buckets); exit code 0 if at least one apply succeeded; exit code 1 if every approved item failed; exit code 2 only on pre-validation failure.

## Cost shape

| Knob | Value | Rationale |
|---|---|---|
| Model | `claude-haiku-4.5` | Classification task; Haiku tier is appropriate. Cheaper alternatives possible (gpt-4o-mini, gemini-flash) but Haiku is the project's existing default. |
| Parallelism | up to 10 concurrent | Via `child_process.spawn` subprocess pool (audit-barrage pattern); bounded to avoid rate-limit churn. |
| Estimated cost per release | $0.05–$0.20 | 20-30 candidates × ~3K input + ~50 output × Haiku rates. Trivial compared to operator time. |
| Sync vs async | Sync (propose blocks) | Operator runs `close-shipped propose`, waits ~30-60s, gets the proposal file. Mental model matches `triage-issues propose`. |
| Progress UX | `Agent pass: 5/22…` stderr | Operator sees the dispatch run, knows it's not hung. |
| Error path | `agent_verdict: "error"` + error message | Per-item; operator can override individually. No retry on dispatch failure (operator decides whether to re-propose). |

**Cost ceiling:** if a release ever produces >50 candidates, the propose step prompts the operator with the count before dispatching — gives an opportunity to bail out cheaply on a release that grew past the expected size.

## What replaces, what stays

**Replaced:**
- `commit-scanner.ts` `PATTERNS` array + verb-strength selection + parens config knob (Phase 14 Task 1) — gone. Replaced by mechanical `#NNN` mention extraction without grammar interpretation.
- `audit-log-walker.ts` Tracks-Issue field precedence + body fix-keyword grammar (Phase 14 Task 2) — gone. Replaced by mechanical mention collection feeding into the bundle.
- `tooling-feedback-walker.ts` issue extraction patterns — gone. Same.
- `merger.ts` cross-source deduplication + orphan-source warning — simplified to "collect all per-source evidence into bundles keyed by issue."
- `apply.ts` decision logic (auto-apply on any walker hit) — replaced by reading the operator-curated proposal JSON.

**Retained:**
- Tag resolution (`tag-resolver.ts`).
- Reachability checks for audit-log SHA references (`isReachable` / `isAncestor`).
- gh comment/edit mechanics (`buildEvidenceCommentBody`, `gh issue comment`, `gh issue edit`).
- Release-notes-body emission (`release-notes.ts`).
- Project-config file (`scanner-config.ts`) — repurposed as the cost-ceiling knob's home (e.g. `propose_confirm_threshold: 50`).

**New:**
- `bundle.ts` — assembles per-candidate evidence bundles from the 4 source signals.
- `agent-dispatcher.ts` — wraps `child_process.spawn` for per-candidate CLI agent dispatch; pool-bounded parallelism; handles error recording. Models the existing `scope-discovery/audit-barrage/spawn-cli.ts` contract.
- `propose.ts` — orchestrates narrow → bundle → dispatch → write proposal JSON.
- `apply.ts` — rewritten to consume the proposal JSON; pre-validation gate; per-item gh dispatch.

## Migration

**Phase 14 ships first** in an upcoming release (the configurable-parens knob + Tracks-Issue field land before this redesign, since they're already implemented on `feature/hygiene`). The redesign is **additive**: new `propose | apply` verbs land in a subsequent version; the existing single-command `close-shipped <flags>` path stays as a legacy fallback for one release cycle past the redesign ship, then deprecates with a notice pointing at the new shape.

**Sunset path:**
1. v0.X.Y ships the redesign as the new default. Old single-command flow available behind `--legacy` flag.
2. v0.X.(Y+1) deprecates `--legacy` with a stderr warning naming the future removal version.
3. v0.X.(Y+2) removes the legacy path entirely.

This gives adopters ~3 release cycles to migrate from the prose-grammar config knobs to the new agent-judged flow.

## Testing

**Mechanical paths (narrowing + bundle assembly + apply gate):**
- Vitest unit + integration tests against fixture project trees + mocked `gh` stub.
- Coverage parity with current close-shipped tests (every walker path → bundle entry; every proposal-JSON shape → apply outcome).

**Agent dispatch:**
- Stub the agent dispatcher in unit tests; assert per-candidate prompt content matches the expected bundle.
- Integration test: run agent dispatcher against a fixture bundle with `claude-haiku` (live, opt-in via env var); assert verdict shape is JSON-parseable + verdict ∈ valid set.
- Cost gate: tests confirm bundle-size truncation rules + ceiling enforcement (`propose_confirm_threshold`).

**End-to-end smoke:**
- Extend `scripts/smoke-hygiene.sh` (local-only, per project rule) with a propose → fill → apply round-trip against a fixture repo + canned agent responses.

**Live verification gate:**
- Same convention as Phase 14: re-run against the v0.27.0..v0.28.1 range after the redesign ships in an installed release. Expected: the agent correctly identifies #356 / #361 / #364 / #366 as shipped; correctly rejects back-fill docs commits + prose-cited fixture mentions.

## Acceptance criteria

- [ ] `dw-lifecycle close-shipped propose --from-tag <vA> --to-tag <vB>` walks the 4 sources permissively, assembles per-candidate evidence bundles, dispatches one agent per candidate in parallel, and writes a proposal JSON.
- [ ] `dw-lifecycle close-shipped apply --proposal <path>` validates every item has a non-empty decision, dispatches gh comment + label per effectively-shipped row, records per-item success/failure.
- [ ] Run against v0.27.0..v0.28.1: agent correctly identifies #356, #361, #364, #366 as shipped (genuine fixes); correctly rejects #353, #355 (back-fill docs commits), #340/#347/etc. (already-closed / cross-reference).
- [ ] Cost per release ≤ $0.50 at default settings; cost-ceiling prompt fires when candidate count > 50.
- [ ] Vitest unit + integration tests for the mechanical paths; full plugin suite stays green.
- [ ] Legacy `--legacy` flag preserves the old single-command behavior for one release cycle.
- [ ] SKILL.md prose names the new flow + the agent dispatch + the proposal/apply gate + the legacy-flag sunset.

## Open questions

- **Multi-model barrage?** The audit-barrage feature dispatches multiple CLI tools in parallel (claude + codex + gemini) for stronger judgment. For close-shipped, this could be a future cost-vs-confidence tradeoff. Out of scope for the initial ship; tracked as a follow-up if the single-model verdicts prove insufficient in practice.
- **Diff content in the bundle?** Diff stats (file count + line counts) are in. Full diff body is out. If the agent can't render confident verdicts from prose-only evidence, this is the next escalation.
- **Cross-release issue tracking?** Some issues take multiple releases to fully fix. The current close-shipped contract is per-release-range, and that stays. An issue closed across two releases will surface for verification in both — the operator can decide to verify-and-close after the second.

## Risks

- **Agent verdict drift.** Same input → different verdict run-to-run, since LLMs aren't deterministic. Mitigation: the strict-JSON output schema + the propose|apply gate (operator can re-run propose if a verdict looks wrong; the second pass is cheap).
- **Cost overrun.** A release with 100+ candidates could spike costs. Mitigation: the `propose_confirm_threshold` knob fires a confirmation prompt before dispatch; operator can bail out cheaply.
- **Agent unavailable.** If the agent dispatcher fails (network, rate-limit, model deprecation), every per-candidate verdict becomes `agent_verdict: "error"`. The operator falls back to overriding each item by hand. Slower but functional.
- **Legacy-flag adoption drift.** Adopters who pin `--legacy` permanently never migrate. Mitigation: the deprecation stderr in v0.X.(Y+1) names the removal version; the v0.X.(Y+2) removal forces the migration.

## Cross-references

- Originating discomfort: v0.28.1 install verification surfaced Phase 14's documented limitations (back-fill docs commits whose subject ends in `(#NNN)` still produce false-positives; prose-cited fixture text inside audit-log entries was leaking before the splitter heading-level fix). Operator pushback after the verification surfaced the structural concern: parsing prose to infer fix-ship semantics is an unbounded patching cycle.
- Phase 14 / [#369](https://github.com/audiocontrol-org/deskwork/issues/369) — the prose-grammar fixes this design supersedes.
- Phase 13 Medium fix tracked under [#366](https://github.com/audiocontrol-org/deskwork/issues/366) — the operator-curation `propose | apply` shape is part of this design.
- Existing `scope-discovery/audit-barrage/` (shipped in v0.28.0) — the `child_process.spawn`-based CLI dispatch pattern this design reuses; specifically `spawn-cli.ts` for the stdin-closed subprocess shape with `claude -p` / `codex exec` / `gemini` support.
