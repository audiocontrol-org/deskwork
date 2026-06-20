# Govern-operability — make cross-model governance operable end-to-end

**Roadmap node:** `multi:feature/govern-operability` (part-of `multi:feature/lifecycle-industrialization`).
**Phase:** designing. **Status:** design complete, pending operator `design-approved:` marker.

This is the burn-down of the entire `multi:feature/govern-operability` umbrella in one
feature — nine coherent phases that turn per-phase cross-model governance from an
operator-vigilance tax into a deterministic, cheap, observable gate. The convergence loop
itself already shipped (specs/015) and was hardened once (specs/021); this feature fixes the
*residual operability friction* discovered by live-using those shipped features across the
027 and 028 dogfoods. No scope cuts: every child node and all sixteen referenced backlog
tasks are covered.

## Problem domain

Governance *converges* (015) and the per-phase substrate is *mechanically enforced* (021),
but running it is still expensive in operator attention. Five friction families recurred
across the 027 and 028 dogfoods, each forcing manual overrides or hand-reconciliation:

1. **Convergence rings.** The dampener's "2 consecutive 0-HIGH" terminal branch is defeated
   by severity non-determinism: the fleet re-rates the *same* finding on *unchanged* code
   (LOW in round 2, HIGH in round 4 — TASK-146/gh-482; observed live in the 006
   recurring-subscription-report feature and again in 028 phases 4+6). Severity jitter alone
   makes the quiet-streak criterion unreachable, so loops run 20 rounds where 6–10 were
   structurally necessary (TASK-60/gh-453: fix-induced surface growth, boundary patching,
   serial single-fleet discovery, adversary-priced gate).

2. **The fleet degrades silently.** The codex lane reasons silently >60s on real payloads and
   trips `killed-no-liveness` before its 300s timeout (TASK-145) — the stopgap widened the
   window 60→300s, blinding the watchdog. The shipped Anthropic-lane template default still
   runs with `--permission-mode plan`, which lets the model burn its whole budget on a
   grounding Read/Grep tool-loop and time out (opus killed at 311s on 24KB; TASK-288 — the
   fast no-grounding config lives only in this project's override, so adopters never get it).
   A SIGTERMed lane leaves a zero-byte artifact; nothing at synthesis/lift distinguishes
   "produced nothing because killed" from "clean, no findings" (timeout-observability), so a
   degraded fleet can be mistaken for convergence.

3. **The loop manufactures backlog noise — and worse, lifts work that is already done.**
   The dampener migrates MEDIUM residuals to the backlog *while those same findings are being
   fixed in the same loop* (TASK-149/gh-471: TASK-30…35 migrated minutes before being fixed).
   Each barrage run lifts findings with no cross-run dedup, so convergence iterations multiply
   near-duplicate tasks (TASK-317/gh-490: 028 slushed TASK-303…312, several duplicating in-loop
   fixes). The two compound. **The sharper invariant the operator named (2026-06-19): an
   ALREADY-FIXED finding must never be lifted at all** — not in-loop-fixed, not prior-commit
   fixed, not deduped-after-the-fact. A backlog task created for a finding that is already
   resolved is pure noise; the lift/slush must consult finding status and skip anything already
   `fixed-<sha>` before it ever creates a task. Dedup (TASK-317) is the safety net; not-lifting
   the fixed in the first place is the fix.

4. **Per-phase scoping raises false HIGHs from harness input, not code.** Per-phase diff
   scoping fed only part of a phase's changed files (TASK-263: only the test file, not the
   impl in the same commit → spurious "the diff omits the fix" HIGH). The per-phase payload
   window also excludes files a finding *references*, so the auditor flags a
   referenced-but-out-of-window file as "absent/not-imported" and raises a HIGH it cannot
   disconfirm (TASK-316: recurred 3× in 028 US3/US4 — runIntercept resolveInstalled, the
   normalize import, the extend gate — all present, all flagged absent, each forcing an
   override).

5. **The override — the sanctioned escape from ringing — itself fires another audit round.**
   When the barrage is ringing at diminishing returns (problem 1) the operator records a
   `--override` to *stop* auditing and graduate. But `convergence-loop.ts:20-25` documents the
   current design verbatim: govern "routes it through the gate so an overridden run **still
   produces a barrage record** … the gate records the reason … and returns OPEN → the driver
   sees converged." So the override runs a **full render→barrage→lift→slush pass first**, then
   graduates. That is the exact opposite of the operator's intent: an override exists precisely
   to *not* run another round, yet the override path always runs one (TASK-318, operator
   2026-06-19). It also re-triggers problem 3 — that final spurious pass lifts findings nobody
   will act on.

6. **Shared-file features pay O(n²) to govern.** The per-phase checkpoint fingerprints
   whole-file content, so a later phase editing an earlier phase's file re-stales the earlier
   checkpoint; the all-earlier-checkpoints-current gate then forces re-governing 1..N−1 at
   each new phase (TASK-289: 027 phases 2/3/4 all edit roadmap.ts/roadmap-command.ts). The
   granularity decision compounds this: 025 made per-phase the *mandatory* graduate path and
   removed full-audit-at-end, but per-phase did not pay off — it multiplied the audit surface
   (8 phases × N oscillating rounds) and created the out-of-window blind spots above
   (TASK-154).

Plus a tail of 027 residual hygiene surfaced but deferred to avoid re-triggering the
staleness cascade mid-feature: test `!` assertions (TASK-290), undocumented cluster verb
(TASK-291), asymmetric list-flag guards + a dead branch (TASK-292), a non-fence-aware
edge-rewriter (TASK-293), and tooling-feedback that routes adopter friction to an invisible
local file instead of GitHub issues (TASK-294/gh-488).

**Constraints that bound any solution:**

- **Don't re-plan 015/021.** Both are shipped and tested; this feature is additive residual
  fixing, not re-implementation. The convergence loop driver, severity-agreement substrate,
  per-phase units, checkpoint persistence, fleet negotiation, and terminal reporting all
  already exist and are the surfaces we extend.
- **Cross-vendor, capability-not-identity.** Liveness/observability/config changes branch on
  lane capability, never vendor name (Principle III).
- **Dogfood-coherent.** We will govern this feature's own phases as we build it, so the
  phases that make our own per-phase govern bearable must land first (sharpen-the-saw).
- **Default per-phase stays** (operator decision, below). So the per-phase path must become
  O(n) and false-alarm-free — its correctness is critical-path, not optional polish.

## Solution space

Program-level shape — how to burn down the umbrella (≥2 alternatives weighed):

- **(A — CHOSEN) One feature, nine phases, sharpen-the-saw ordered.** A single spec
  (`govern-operability`) with nine user-stories/phases executed in one `/stack-control:execute`
  run, ordered so fleet-reliability + observability + determinism land first (they make every
  later phase's own govern run bearable), then loop-coordination + payload-correctness, then
  the granularity/staleness structural changes, then process discipline + hygiene. Pro:
  matches the operator's "fix it all at once" directive; the early phases de-risk the later
  ones' governance; one coherent spec. Con: a large execute run.
- **(B) N sequential micro-features.** Split each child gap into its own define→execute cycle.
  Pro: smaller blast radius per feature. Con: re-pays the design/spec/governance ceremony N
  times for tightly-coupled work that shares surfaces (lift+slush+loop; identity+dedup;
  payload+staleness); contradicts "burn the entire thing down at once"; the determinism fix
  would land last instead of first, so every intervening feature governs through the ringing
  it is meant to remove. Rejected.
- **(C) Root-only: fix determinism, defer the rest.** Ship only TASK-146 (severity
  determinism) on the theory that it is the dominant ring driver, and re-queue the others.
  Pro: smallest. Con: explicit "fake YAGNI" the operator forbade; leaves the false-HIGH,
  O(n²), and silent-degradation taxes in place. Rejected.

Per-axis design alternatives (the levers each phase chooses among — decisions recorded below):

- **Severity determinism (P3).** (a) cross-round hysteresis (count a HIGH only if rated HIGH
  in the recent N runs); (b) finding-identity-keyed gate (the dampener counts *new*
  previously-unseen HIGHs, not raw per-run count); (c) both. Chosen: both — identity is the
  robust fix, hysteresis the cheap complement.
- **Granularity graduate gate (P6).** (a) either-of gate, default full-audit-at-end, per-phase
  opt-in; (b) either-of gate, default per-phase, full-audit opt-in; (c) per-feature config
  with no default. Chosen: (b) — operator decision (below).
- **codex liveness (P1).** (a) `model_reasoning_summary=detailed|auto` → stderr pulses, minimal
  parser change; (b) `--json` streamed JSONL events → continuous liveness but a new stdout
  extractor in codex.md. Chosen: (a) first; (b) only as a follow-up if pulses remain
  insufficient.
- **Out-of-window false alarms (P5).** (a) widen the payload to referenced-but-out-of-window
  deps; (b) feed the auditor enough context to disconfirm "absent"; (c) teach the prompt that
  out-of-window = not-this-phase-scope. Chosen: combine (a)+(c) rather than betting on one.
- **Checkpoint staleness (P7).** (a) fingerprint each phase's *own hunks*, not whole files; (b)
  a govern ordering/mode that tolerates later-phase edits; (c) document govern-at-end for
  shared-file features. Chosen: (a) as the structural fix (keeps per-phase O(n)); (c) is
  partially delivered by P6's full-audit opt-in.
- **Lift hygiene — never lift the already-done (P4).** (a) skip any finding already
  `fixed-<sha>` before creating a task (the operator's invariant); (b) defer MEDIUM migration to
  loop terminal; (c) auto-reconcile a backlog task when its finding flips `fixed-<sha>`; (d) add
  a `backlog done` verb; (e) cross-run signature dedup as the safety net. Chosen: all five —
  same surface; (a) is the primary fix, the rest catch the residue.
- **Override is terminal — it must not run another round (P4).** (a) short-circuit: when
  `--override` is supplied, govern records the reason and graduates, firing NO
  render→barrage→lift→slush pass at all; (b) status quo (route through the gate, which runs a
  full pass then returns OPEN); (c) persistent override marker keyed to the audited fingerprint
  so *every* later invocation on unchanged code graduates without re-auditing, invalidated only
  when the code changes. Chosen: (a) as the load-bearing fix (it directly removes the spurious
  round); (c) considered as a stronger follow-on (open question). (b) is the current defect and
  is rejected.

## Decisions

1. **One feature, nine phases, sharpen-the-saw order** (shape A). Phase order: P1 fleet
   reliability → P2 observability → P3 determinism → P4 loop hygiene (never-lift-fixed +
   dampener-in-loop + dedup + override-is-terminal) → P5 payload-scoping correctness → P6
   granularity switch → P7 hunk-fingerprint → P8 process discipline → P9 027 hygiene.
2. **Granularity: either-of graduate gate, default stays per-phase** (operator decision
   2026-06-19). The gate graduates on `all-phase-checkpoints-current` **OR** whole-feature
   `record-converged`; full-audit-at-end becomes the opt-in escape hatch. Because per-phase
   remains the default common path, P5 (payload union + out-of-window) and P7 (hunk
   fingerprint) are **critical-path** — per-phase must be O(n) and false-alarm-free. Amend the
   025 "compose, reject augment" clarify record.
3. **Severity determinism = identity-keyed gate + cross-round hysteresis** (both).
4. **codex liveness via `model_reasoning_summary=detailed` first**; restore the tight liveness
   window; update installation config AND `templates/audit-barrage-config.yaml`. `--json` is a
   deferred follow-up, not in this feature unless (a) proves insufficient.
5. **Promote the no-grounding Anthropic-lane config to the shipped template default** (TASK-288):
   remove `--permission-mode plan`, add `--disallowedTools …` read-only-by-construction, raise
   the timeout floor. Apply ONLY the grounding-config change; do NOT touch fleet *composition*
   (the opus+codex+sonnet 3-lane set is a separate calibration-backed decision). Only sonnet is
   wall-clock-validated no-grounding; opus no-grounding is mechanism-sound but un-calibrated —
   flag as an open question, do not silently drop opus.
6. **Out-of-window false alarms = widen payload to referenced deps + teach the prompt**
   (combine levers).
7. **Lift hygiene (P4) — operator friction (a), 2026-06-19.** Primary invariant: **never lift a
   finding that is already `fixed-<sha>`** (in-loop or prior-commit) — the lift/slush consults
   finding status and skips the done before it creates any task. Supporting: defer MEDIUM
   migration to loop terminal (TASK-149); auto-reconcile a backlog task when its finding flips
   `fixed-<sha>`; add a `backlog done` verb; cross-run finding-signature dedup as the safety net
   (TASK-317). Define the finding signature once and share it between the dampener identity-key
   (P3) and the lift dedup (P4).
8. **Override is terminal (P4) — operator friction (b), 2026-06-19 (TASK-318).** When
   `--override` is supplied, govern **short-circuits the barrage entirely**: record the override
   reason in the audit trail and graduate, firing NO render→barrage→lift→slush pass. The current
   "route through the gate, run a full pass, then return OPEN" behavior
   (`convergence-loop.ts:20-25`) is the defect and is removed. The override is the sanctioned
   diminishing-returns escape (`.claude/rules/spec-audit-diminishing-returns.md`); it must
   actually escape, not buy one more round. Whether the override also *persists* (fingerprint-
   keyed, so later invocations on unchanged code also skip the barrage) is an open question;
   the short-circuit is the load-bearing fix regardless.
9. **Degraded fleet is never convergence** (P2): a SIGTERMed/timed-out/zero-byte lane is
   surfaced at synthesis and lift, and a run with a degraded lane does not count as a quiet
   run for the dampener.
10. **027 hygiene is in scope** (P9), bundled last because it is independent and low-stakes;
    tooling-feedback guidance (TASK-294) is corrected to route adopter friction to GitHub issues
    against `audiocontrol-org/deskwork`.
11. **TDD-first, governed per phase** at each `tasks.md` phase boundary; commit + push per
    boundary; no protocol shortcuts. The granularity opt-in (P6) does not change *this*
    feature's governance cadence (per-phase as we build).

## Decision provenance — architecture & components (informing the spec)

The phases map to these existing surfaces (from the 2026-06-19 code census); the spec/plan will
turn each into RED-first tasks:

- **P1** `templates/audit-barrage-config.yaml`, `scope-discovery/audit-barrage/spawn-cli.ts`
  (watchdog/liveness window), installation `.stack-control/audit-barrage-config.yaml`.
- **P2** `scope-discovery/audit-barrage/run-artifacts.ts` (INDEX.md terminal-state taxonomy),
  `subcommands/audit-barrage-lift.ts` (fleet-filter + quiet-section), the dampener's quiet-run
  count.
- **P3** `scope-discovery/promote-findings/check-barrage-dampener.ts`, `cluster-severity.ts`,
  `adjudicate-findings.ts`, `extract-barrage-findings.ts` (finding signature/identity).
- **P4** `subcommands/slush-findings.ts` (skip already-`fixed-<sha>`; defer-to-terminal),
  `subcommands/audit-barrage-lift.ts` (lift status check + signature dedup), `backlog/` (new
  `done` verb + auto-reconcile-on-fixed), `govern/convergence-loop.ts` + `convergence-types.ts`
  + `govern.ts` override path (short-circuit the barrage when `--override` is supplied — today
  `convergence-loop.ts:20-25` runs a full pass then returns OPEN).
- **P5** `govern/incremental-audit.ts`, `subcommands/govern.ts` (diff-base / union of phase
  commits), `payload-implement.ts`, the audit prompt template.
- **P6** `templates/WORKFLOW.md` gate semantics, `workflow/gate-eval.ts`
  (`all-phase-checkpoints-current` OR `record-converged`), govern default mode, the 025 clarify
  record.
- **P7** `govern/checkpoint-state.ts` (`computeScopeFingerprint` → hunk-level),
  `phase-checkpoint-status.ts`.
- **P8** audit/implement skill bodies + the barrage prompt templates (channel enumeration,
  invariant-first boundaries, round-0 self-red-team, fleet-degradation pricing, rubric
  anchoring).
- **P9** `tests/roadmap/cluster.test.ts`, roadmap `SKILL.md`, `subcommands/roadmap.ts`,
  decompose `rewriteEdgeLine`, tooling-feedback docs/skill bodies.

## Open questions

Resolved during `/speckit-clarify` / `/speckit-plan`, not blocking design approval:

1. **Finding-signature definition.** What canonical key identifies "the same finding" across
   runs for both the P3 identity-gate and the P4 dedup? Candidate: normalized heading +
   primary file path (mirroring the existing ≥12-char heading-overlap cluster merge). Needs a
   fixture-backed spec.
2. **opus no-grounding calibration.** Decision 5 keeps opus in the fleet but only sonnet is
   wall-clock-validated no-grounding. Calibrate opus no-grounding in P1, or escalate a
   fleet-composition decision to the operator if it can't meet the timeout envelope.
3. **Hunk-fingerprint granularity (P7).** Hunk boundaries vs. line-range vs. per-symbol — what
   unit makes a shared-file checkpoint stable without missing a real later edit to the *same*
   hunk? Needs a staleness-cascade regression fixture.
4. **Hysteresis window N (P3).** The number of recent runs over which a HIGH must persist to
   gate-count, and how it interacts with the existing 2-consecutive-quiet threshold.
5. **`--json` codex extractor (P1).** Deferred; reconsider only if `model_reasoning_summary`
   pulses prove insufficient on real payloads.
6. **Override persistence (P4).** Decision 8 mandates the short-circuit (an override never runs
   a barrage round). Should it also *persist* — a fingerprint-keyed override marker so every
   later govern invocation on unchanged code graduates without re-auditing, invalidated when the
   code changes? The short-circuit alone fixes the named friction; persistence is a stronger
   property to weigh in `/speckit-clarify` (it interacts with the P7 hunk-fingerprint and the
   P6 either-of gate).
7. **Phase boundary sizing for P5/P7.** These edit shared govern internals; sequence their
   tasks so the feature's own per-phase checkpoints don't thrash before P7's fix lands (eat our
   own dogfood deliberately, document it).

## Provenance

- **Operator directive (2026-06-19):** "take up the govern operability item … design an
  execution plan to burn down the entire thing at once — no fake yagni bullshit, no scope
  shirking. I just want it all fixed." Granularity fork resolved by the operator the same day:
  *either-of gate, default per-phase*.
- **Umbrella + children:** `multi:feature/govern-operability` and its subtree
  (`audit-barrage-convergence` → granularity-switch / severity-determinism / dampener-in-loop /
  lift-cross-run-dedup; `govern-per-phase-friction-burndown` → audit-payload-out-of-window;
  `audit-barrage-codex-liveness`; `audit-barrage-timeout-observability`), clustered 2026-06-19
  (commit a366533f).
- **Backlog tasks (the defect census, 2026-06-19):** TASK-60 (gh-453), TASK-145, TASK-146
  (gh-482), TASK-149 (gh-471), TASK-154, TASK-263, TASK-288, TASK-289, TASK-290, TASK-291,
  TASK-292, TASK-293, TASK-294 (gh-488), TASK-316, TASK-317 (gh-490), TASK-318
  (operator-override-triggers-another-round; filed 2026-06-19).
- **Operator friction follow-ups (2026-06-19):** (a) already-fixed audit items must never be
  lifted into the backlog — sharpened into P4 decision 7 (the never-lift-fixed invariant atop
  TASK-149 + TASK-317); (b) an operator override must not cause another audit round — captured
  as P4 decision 8 + TASK-318 (short-circuit the barrage on `--override`).
- **Shipped prior art (do not re-plan):** specs/015-audit-protocol-convergence (35/35 done —
  severity agreement, code loop driver, payload drop, per-phase units, sonnet re-admit, raw
  guard); specs/021-audit-protocol-friction-burndown (32/32 done — checkpoint enforcement,
  boundary sizing, fleet negotiation, anchor unification, terminal reporting);
  specs/025-unskippable-workflow-protocol (the granularity clarify this feature amends).
- **Governing rules:** `.claude/rules/spec-audit-diminishing-returns.md` (plateau detection,
  the convergence-friction log this feature operationalizes),
  `.claude/rules/agent-discipline.md` (govern-per-phase; capture-don't-cut),
  `.claude/rules/stack-control-succession.md` (thesis: industrialize execution).
- **Code census (2026-06-19):** the surface map under *Decision provenance* above, derived from
  a read-only sweep of `plugins/stack-control/src/{subcommands,govern,scope-discovery,workflow}`.
