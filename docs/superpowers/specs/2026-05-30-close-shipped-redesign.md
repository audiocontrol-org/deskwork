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

The dispatch primitive is the **Agent tool from within the agent's Claude Code session**, not a subprocess pool or an SDK direct call. `/dw-lifecycle:close-shipped` is a dw-lifecycle skill; skills are invoked from inside a Claude Code session; every other dw-lifecycle skill that needs agent judgment (`/dw-lifecycle:review`, `/dw-lifecycle:implement`) already follows this shape — SKILL.md prose tells the agent (Claude) to dispatch sub-agents via the Agent tool. close-shipped joins the same pattern. CLI helpers stay pure-mechanical (walk sources, assemble bundles, validate proposals, dispatch gh mutations); the SKILL.md prose orchestrates the Agent-tool dispatches between those helper calls.

## Architecture

```
                                                              ┌───────────────────────────┐
        ┌── commit-log mention scan                           │                           │
        │                                                     │   per-candidate           │
        ├── PR description scan                               │   evidence bundle         │
walk ───┤                                                ─►   │   {issue, commits,        ├──► Agent-tool dispatch
range   ├── audit-log Tracks-Issue + body mention             │    pr, audit, workplan}   │     (parallel, single
        │                                                     │                           │      message, multiple
        └── workplan-checkbox back-fill                       └───────────────────────────┘      tool_use blocks)
                                                                                                    │
                                                                                                    │   verdict + reason
                                                                                                    ▼
                                                                                            proposals-<ts>.json
                                                                                                  │
                                                                                                  ▼
                                                                                            operator review
                                                                                                  │
                                                                                                  ▼
                                                                                            apply (gh comment + label)
```

The split between mechanical CLI helpers and skill-prose orchestration:

**Mechanical CLI helpers (pure, replayable, testable):**

- `dw-lifecycle close-shipped scan --from-tag vA --to-tag vB` — walks all 4 sources permissively, extracts every `#NNN` mention, assembles per-candidate evidence bundles, emits the bundle set as JSON to stdout. No agent, no judgment. Fully deterministic.
- `dw-lifecycle close-shipped propose --bundles <path> --verdicts <path>` — takes the bundle JSON + a verdict JSON (one verdict per candidate), composes the `proposals-<timestamp>.json` and the markdown summary table. No agent, no judgment.
- `dw-lifecycle close-shipped apply --proposal <path>` — pre-validates every item has a non-empty decision; dispatches `gh issue comment` + `gh issue edit --add-label` per effectively-shipped row; records per-item outcome. No agent.

**SKILL.md prose (orchestration; the agent runs this):**

1. Run `dw-lifecycle close-shipped scan --from-tag <vA> --to-tag <vB>` → JSON bundle set
2. If the bundle set's candidate count exceeds the configured threshold (default 50), surface the count to the operator and confirm before continuing
3. **For each bundle, dispatch an Agent in parallel.** Single message with multiple `Agent({...})` tool_use blocks (one per candidate). Each agent gets the bundle as prompt input + the prompt template from § Prompt below. The general-purpose subagent type is appropriate — this is a classification task, not a specialized one.
4. Collect the verdicts (one per candidate) into a `verdicts-<timestamp>.json` file
5. Run `dw-lifecycle close-shipped propose --bundles <path> --verdicts <path>` → writes the proposal JSON + prints the markdown table
6. Report the markdown table to the operator. Stop. The operator reviews the proposal file out-of-band.
7. (Operator re-invokes the skill in apply mode after filling in decisions.)
8. Run `dw-lifecycle close-shipped apply --proposal <path>` → applies the operator-approved mutations

The Agent-tool dispatch in step 3 is the same pattern used by `/dw-lifecycle:review` (parallel dispatch of code-reviewer agents) and `/dw-lifecycle:implement` (sequential dispatch of implementer + reviewer agents). No new dispatch infrastructure; no subprocess pool; no SDK package; no `ANTHROPIC_API_KEY` env requirement. The model in use is whatever the operator's Claude Code session is configured with.

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

**Total per-candidate budget:** ~2-5K tokens (high-end when the issue has many commits + a PR + multiple audit-log entries). For 20-30 candidates per release: ~50-150K tokens total agent input across all dispatches.

**Bundle assembly is mechanical.** Same code path for every candidate; no per-source decision logic. The judgment moves out of the assembly step and into the Agent dispatches.

## Prompt

The SKILL.md prose composes one prompt per candidate by substituting the bundle's fields into this template, then dispatches via `Agent({subagent_type: 'general-purpose', prompt: <composed>})`:

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
- `agent_verdict` ∈ {`shipped`, `not-shipped`, `uncertain`, `error`}. `error` is the failure path when the dispatched agent's response can't be JSON-parsed.
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

## Cost + parallelism shape

The dispatch is the Agent tool from inside the agent's own session, so:

- **Model:** whatever the operator's Claude Code session is using. The skill doesn't pick. Operators who run Sonnet for everything pay Sonnet rates per dispatch; operators on Haiku pay less. No model knob; no SDK configuration; no environment variables to set.
- **Parallelism:** all candidates dispatch in a single message containing N parallel `Agent({...})` tool_use blocks. Claude Code runs them concurrently; the operator sees them complete asynchronously. For 20-30 candidates per release, this fans out in one round-trip — typically completes in 30-90s wall-clock depending on per-agent latency.
- **Cost shape:** dominated by the bundle prompts (issue body + commits + PR + audit-log + workplan, truncated). At 2-5K tokens per candidate × 20-30 candidates × whatever model rate the session is paying.
- **Candidate-count threshold:** the SKILL.md prose surfaces a confirmation prompt to the operator when the bundle set has more than 50 candidates (default; configurable). This gives an opportunity to bail out cheaply on a release that grew past the expected size before any agent dispatches fire.
- **Error path:** if the dispatched agent's response can't be JSON-parsed (malformed verdict, refusal, timeout), the SKILL.md prose records `agent_verdict: "error"` + the raw response excerpt in the verdict JSON. The operator can override per item in the proposal.

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
- Project-config file (`scanner-config.ts`) — repurposed as the candidate-count threshold's home (e.g. `candidate_confirm_threshold: 50`).

**New (all pure CLI helpers):**
- `bundle.ts` — assembles per-candidate evidence bundles from the 4 source signals; pure function over the bundle inputs.
- `scan-subcommand.ts` — CLI verb that walks the tag range, calls `bundle.ts`, emits the bundle set as JSON.
- `propose-subcommand.ts` — CLI verb that takes bundles JSON + verdicts JSON, composes the proposal JSON + markdown table.
- `apply.ts` — rewritten to consume the proposal JSON; pre-validation gate; per-item gh dispatch. (The file name stays; the body is new.)

**Notably NOT new:** no subprocess pool, no SDK client, no API-key handling, no model-router, no agent-dispatcher module. The dispatch happens in the SKILL.md prose using the Agent tool that's already part of the agent's runtime.

## Migration

**Phase 14 ships first** in an upcoming release (the configurable-parens knob + Tracks-Issue field land before this redesign, since they're already implemented on `feature/hygiene`). The redesign is **additive**: new `scan | propose | apply` verbs land in a subsequent version; the existing single-command `close-shipped <flags>` path stays as a legacy fallback for one release cycle past the redesign ship, then deprecates with a notice pointing at the new shape.

**Sunset path:**
1. v0.X.Y ships the redesign as the new default. Old single-command flow available behind `--legacy` flag.
2. v0.X.(Y+1) deprecates `--legacy` with a stderr warning naming the future removal version.
3. v0.X.(Y+2) removes the legacy path entirely.

This gives adopters ~3 release cycles to migrate from the prose-grammar config knobs to the new agent-judged flow.

## Testing

**Mechanical paths (scan + bundle assembly + propose + apply):**
- Vitest unit + integration tests against fixture project trees + mocked `gh` stub.
- Coverage parity with current close-shipped tests (every walker path → bundle entry; every proposal-JSON shape → apply outcome).
- The `scan` CLI verb's output is deterministic given the input tree; snapshot-test against fixture repos.
- The `propose` CLI verb's output is deterministic given bundles + verdicts; snapshot-test.
- The `apply` CLI verb's gh-call sequence is mockable; assert the exact gh argv per decision shape.

**Agent-dispatch path:**
- Not directly testable in vitest — the dispatch is in SKILL.md prose calling the Agent tool, not in TypeScript code. Instead, the SKILL.md prose itself is what gets reviewed for correctness during the `/dw-lifecycle:review` cycle.
- The bundle JSON shape is what the agent sees; the truncation + assembly rules are what vitest covers.
- Live verification: run the SKILL.md flow end-to-end against the v0.27.0..v0.28.1 range from this very project once the redesign ships. Expected: the agent correctly identifies #356 / #361 / #364 / #366 as shipped; correctly rejects back-fill docs commits (#353 / #355) + cross-references (#340 / #347) + the PR self-reference (#365).

**End-to-end smoke:**
- Extend `scripts/smoke-hygiene.sh` (local-only, per project rule) with a `scan → propose → apply` round-trip against a fixture repo + canned verdicts JSON. The smoke doesn't exercise the agent dispatch (that's the SKILL.md prose); it exercises the CLI-helper boundaries.

## Acceptance criteria

- [ ] `dw-lifecycle close-shipped scan --from-tag <vA> --to-tag <vB>` walks the 4 sources permissively + emits the bundle set as JSON to stdout.
- [ ] `dw-lifecycle close-shipped propose --bundles <path> --verdicts <path>` writes a proposal JSON + prints a markdown table.
- [ ] `dw-lifecycle close-shipped apply --proposal <path>` validates every item has a non-empty decision, dispatches gh comment + label per effectively-shipped row, records per-item success/failure.
- [ ] SKILL.md prose covers the `scan → Agent-tool parallel dispatch → propose → operator review → apply` orchestration end-to-end.
- [ ] Live verification against v0.27.0..v0.28.1: agent correctly identifies #356, #361, #364, #366 as shipped (genuine fixes); correctly rejects #353, #355 (back-fill docs commits), #340/#347/etc. (already-closed / cross-reference), #365 (PR self-reference).
- [ ] Candidate-count threshold (default 50) surfaces a confirmation before the parallel Agent dispatch fires.
- [ ] Vitest unit + integration tests for the mechanical paths; full plugin suite stays green.
- [ ] Legacy `--legacy` flag preserves the old single-command behavior for one release cycle.
- [ ] SKILL.md prose names the new flow + the Agent-tool dispatch + the proposal/apply gate + the legacy-flag sunset.

## Open questions

- **Diff content in the bundle?** Diff stats (file count + line counts) are in. Full diff body is out. If the agent can't render confident verdicts from prose-only evidence, this is the next escalation.
- **Multi-model judgment?** A future variant could dispatch multiple agents per candidate (different subagent_types or different models within a session) and reconcile their verdicts. Out of scope for v1.
- **Cross-release issue tracking?** Some issues take multiple releases to fully fix. The current close-shipped contract is per-release-range, and that stays. An issue closed across two releases will surface for verification in both — the operator can decide to verify-and-close after the second.

## Risks

- **Agent verdict drift.** Same input → different verdict run-to-run, since LLMs aren't deterministic. Mitigation: the strict-JSON output schema + the propose|apply gate (operator can re-run propose if a verdict looks wrong; the second pass is cheap; the SKILL.md prose makes re-running explicit).
- **Bundle prompt cost spike.** A release with 100+ candidates could spike token usage at the session's model rate. Mitigation: the candidate-count threshold knob fires a confirmation prompt before dispatch; operator can bail out cheaply.
- **Agent dispatch returns malformed JSON.** If the dispatched agent's response can't be JSON-parsed on the first try, the SKILL.md prose re-dispatches once with a short "your previous response was not valid JSON; return only the verdict JSON" correction. If the second response also fails to parse, the verdict for that candidate becomes `agent_verdict: "error"` with the raw response excerpt captured. Operator can override individually in the proposal.
- **Legacy-flag adoption drift.** Adopters who pin `--legacy` permanently never migrate. Mitigation: the deprecation stderr in v0.X.(Y+1) names the removal version; the v0.X.(Y+2) removal forces the migration.

## Cross-references

- Originating discomfort: v0.28.1 install verification surfaced Phase 14's documented limitations (back-fill docs commits whose subject ends in `(#NNN)` still produce false-positives; prose-cited fixture text inside audit-log entries was leaking before the splitter heading-level fix). Operator pushback after the verification surfaced the structural concern: parsing prose to infer fix-ship semantics is an unbounded patching cycle.
- Phase 14 / [#369](https://github.com/audiocontrol-org/deskwork/issues/369) — the prose-grammar fixes this design supersedes.
- Phase 13 Medium fix tracked under [#366](https://github.com/audiocontrol-org/deskwork/issues/366) — the operator-curation `propose | apply` shape is part of this design.
- **Existing dw-lifecycle pattern this design follows:** `/dw-lifecycle:review` (parallel dispatch of `feature-dev:code-reviewer` agents via the Agent tool) and `/dw-lifecycle:implement` (sequential dispatch of implementer + reviewer agents via the Agent tool). SKILL.md prose composes prompts, dispatches Agent tool calls, collects results; CLI helpers stay pure-mechanical.
