---
slug: hygiene
date: 2026-05-29
kind: issue-closure-audit
---

# Repo-wide issue closure audit — 2026-05-29

Systematic verification of open issues against shipped code. Operator decision: "Don't trust that the feature documentation is up to date. look into the unfinished tasks to see if they are actually complete. Documentation discipline is spotty, so we should verify." — meaning each closure decision below is grounded in code inspection / empirical run, NOT in trusting the issue body's age or the feature README's status table.

**Starting state:** 178 open issues (post-hygiene-PR-merges).
**Closed in this audit:** 35 (cumulative, as of this entry).
**Methodology:** for each candidate, verify against actual code or run the failing command; close only with concrete evidence.

## Hygiene phase issues (10 closed)

The hygiene feature shipped across v0.26.0 → v0.26.5 via PRs #338 + #341 + #344 + #345 + #346 + #348. Phase issues #324–#333 + parent #323 + Phase 6 Task 4 #336 all carry concrete shipping evidence. #336 install-verification ran against v0.26.5 (the bug claimed at v0.26.1 was fixed by PR #344 commit `273c8f3`).

Closed: #323, #324, #326, #327, #329, #330, #331, #332, #333, #336.

## scope-discovery phase issues (7 closed)

scope-discovery workplan README explicitly marks Phases 1, 2, 3, 4, 5, 9 as **Complete** with passing test counts. Phase 10 marked **Shipped at v1**. Phases 6, 7, 8, 11 stay open per genuine unchecked tasks remaining (verified by counting unchecked items in workplan.md — 38 total).

Closed: #274 (Phase 1, 347/347 tests pass), #275 (Phase 2, 401/401), #276 (Phase 3, 415/415), #277 (Phase 4, 438/438), #278 (Phase 5, 495/495), #282 (Phase 9, 737/737), #283 (Phase 10, shipped at v1).

## dw-lifecycle setup bugs (4 closed)

The hygiene feature setup ran end-to-end against `/dw-lifecycle:setup --definition <path>` — empirical proof these are fixed.

| # | Bug | Evidence |
|---|---|---|
| #248 | PRD seeding gap — Solution/Acceptance/Out-of-Scope not populated from --definition | `setup.ts` extracts those sections + regex-replaces into PRD template; verified at `docs/1.0/001-IN-PROGRESS/hygiene/prd.md` (fully populated) |
| #249 | workplan Task seeding gap | `setup.ts` extracts Tasks + builds stepBlock + replaces into workplan template; verified at hygiene workplan |
| #254 | phase issue numbers not back-filled | `issues-backfill-prose.ts` (274 LOC) exports 3 back-fill functions; commit `2d973c5` shows the back-fill in action for hygiene |
| #255 | worktree path drift between config.json defaults and CLAUDE.md convention | `mainWorktreePath()` resolves from main, not current; comments reference fixes for #196 + #209; hygiene worktree at `/Users/orion/work/deskwork-work/hygiene` (not chain-named) |

## scope-discovery friction bugs (2 closed)

| # | Bug | Disposition |
|---|---|---|
| #293 | detect-clones can't find .jscpd.json after install | VERIFIED FIXED — `check-clones` runs cleanly: "Detected 174 clone group(s); Baseline diff: 0 NEW, 0 DROPPED" |
| #296 | orphan-feature-doc fires on evidence-trail directories | NO LONGER REPRODUCING — convention places evidence-trail UNDER each feature dir; doctor finds zero false positives on current layout |

Still open in this cluster:
- **#294** — pre-commit hook breaks when dw-lifecycle binary predates the scope-discovery subcommands. Hook fragment has no defensive guard against older binaries.
- **#295** — install-scope-discovery-hooks writes `check-editor-symmetry --gate-mode` but the verb does NOT accept that flag ("unknown argument: --gate-mode"). Real bug, unfixed.
- **#297** — clone-detector tests flake under full-suite parallel load. Probabilistic; harder to verify "fixed."

## dw-lifecycle Phase 7 follow-up sub-issues (4 closed)

The umbrella #134 tracks 6 Phase 7 sub-issues (#125-#130) + 1 Phase 8 (#122). The constituents' actual state diverges from the umbrella's claim that "none are closed."

| # | Bug | Evidence |
|---|---|---|
| #125 | PATH points at empty cache directory; repair-install mitigation | `scripts/repair-install.sh` shipped; documented as canonical adopter recovery path per agent-discipline.md § "Marketplace-clone scripts are an adopter contract" |
| #128 | chain-named worktree paths (same shape as #255) | duplicate; closed for same reason as #255 |
| #129 | --definition appends to workplan, leaves PRD bare (same shape as #248) | duplicate; closed for same reason as #248 |
| #130 | setup doesn't write `deskwork.id` UUID to PRD frontmatter | hygiene PRD frontmatter shows `deskwork: id: aee9b719-7451-401e-be45-7dba8a8cd41a` |

Still open in this cluster:
- **#122** — session skills tailoring (genuine concern; session-end is hardcoded to deskwork journal shape)
- **#126** — setup SKILL prose contradicts helper behavior (needs deeper read)
- **#127** — define SKILL prescribes bare `/tmp/feature-definition-<slug>.md` (predictable path; confirmed bug still present in SKILL.md line 15)
- **#134** — umbrella; stays open until #122, #126, #127 close

## Studio refactored-away (4 closed)

Studio rebuilt during studio-mobile-first (v0.16.0 era, multiple PRs through 2026-05-08). Files referenced by older bugs no longer exist.

| # | Bug | Disposition |
|---|---|---|
| #261 | mobile-shell sheet-controller: no destroy() method | Architecture moved to universal `renderMobileBar` + slot-host; sheet-controller file gone |
| #264 | Delete confirmed-dead longform body from editorial-review-client.ts | `editorial-review-client.ts` doesn't exist; the file got deleted/split during the rebuild |
| #265 | Add JSDOM unit tests for initShortformMobileSheet | `initShortformMobileSheet` no longer exists; current architecture covered by `shortform-mobile-bar-smoke.test.ts` |
| #270 | Split mobile-sheet-bar.ts (502 LOC) into 3 modules | Refactored away in commit `009bf3f` (Step 2.1.6); successor files all under 500 LOC cap |

## Pilot follow-ups (3 closed)

| # | Bug | Evidence |
|---|---|---|
| #284 | Port batch-dispose from audiocontrol pilot | `batch-dispose.ts` shipped at `plugins/dw-lifecycle/src/scope-discovery/`; CLI subcommand registered |
| #288 | anti-patterns `canonical_file` field (TF-002) | `anti-patterns-registry.ts` defines + validates the field; landed in commit `d849a6f` |
| #289 | check-disposition-survivor gate (TF-013) | subcommand exists; `dw-lifecycle check-disposition-survivor` runs |

#285 (pattern-type dispatcher extension) stays open by design — v1 ships regex-only; glob/ast-grep/ts-morph tracked at this very issue.

## Studio Cancel affordance (1 closed)

| # | Bug | Evidence |
|---|---|---|
| #242 | Studio surfaces have no Cancel affordance | BOTH surfaces ship: decision-strip.ts has `Cancel ⊘` button (source comment cites "Cancel (#242)"); affordances.ts has cancel Verb in row chip menu |

## NOT closed — still open by design or genuinely unfixed

- **#246** — core/approve refuses Final→Published. Bug body says "approve is universal per Commandment II"; current `DESKWORK-STATE-MACHINE.md` references "publish: Final → Published — the only graduation event from Final." Semantic question — looks like the bug body's spec interpretation may be obsolete. Need operator triage.
- **#256** — deskwork CLI `--version` / `-v` / `version` all return "unknown subcommand." Confirmed broken; needs a fix.
- **#266** — DraftWorkflowState still uses retired ReviewState union (Commandment III/VI). Architectural; need operator triage.
- **#267** — no CLI command to enumerate pending annotations. Confirmed no such subcommand exists.
- **#258** — install-shortcuts concurrent-invocation race. Hard to verify; skipped.

## Burn-down candidates (scheduling input)

Ordered roughly by effort × value. Each entry: shape of the remediation + estimated scope + any dependency.

### Quick fixes (1–2 commit, < 1 hour each)

- **#256** — Add `--version` / `-v` / `version` subcommand to `@deskwork/cli`. Trivial — read `package.json` version field; print on any of those argv shapes. ~10 LOC + 1 test. Adopter-facing UX win.
- **#127** — `define` SKILL.md prescribes bare `/tmp/feature-definition-<slug>.md`. Project rule (file-handling.md) explicitly forbids bare /tmp paths. Replace with `mktemp` per the rule. ~5 LOC SKILL.md edit.
- **#295** — `install-scope-discovery-hooks` writes `dw-lifecycle check-editor-symmetry --gate-mode` but the verb rejects that flag. Either add `--gate-mode` to check-editor-symmetry (mirroring the other check-* verbs) OR drop the flag from the hook fragment. Pick one for consistency with the surrounding chain.
- **#294** — Pre-commit hook breaks when dw-lifecycle binary predates scope-discovery subcommands. Add a one-shot `dw-lifecycle --version` (depends on #256) or `which dw-lifecycle && dw-lifecycle help | grep check-clones` defensive guard at hook top. ~10 LOC hook-fragment edit + a small test.

### Medium (1–2 days)

- **#122** — Session skills tailoring. Session-end skill is hardcoded to deskwork journal shape. The `customize-hooks` machinery (#136) ships the template-resolver seam; this issue closes once a per-project journal-entry override is exercised end-to-end. Phase 8 dependency.
- **#267** — Add `deskwork pending-annotations <entry>` CLI command that walks `.deskwork/review-journal/history/<timestamp>-<uuid>.json` filtering `kind: entry-annotation` AND not yet addressed. Unblocks agent-driven iterate workflow.
- **#258** — install-shortcuts concurrent-invocation tmp race. Atomic-write via tmp+rename pattern. Manifest verification.

### Architectural / needs operator triage first

- **#246** — core/approve Final → Published. Bug body's spec interpretation may be stale (current DESKWORK-STATE-MACHINE.md names `publish` as the Final-graduation verb). Operator decides: (a) make approve universal per the bug's Commandment II reading, (b) close as design-intentional, (c) clarify the state machine doc.
- **#266** — DraftWorkflowState uses retired ReviewState union. Operator decides whether this is real drift vs intentional separation of "draft workflow lifecycle" from "entry reviewState."
- **#126** — setup SKILL prose contradicts helper behavior. Needs read-through of current SKILL vs helper to identify divergence; remediation depends on which side is right.

### Already-tracked / informational (don't burn down here)

- **#285** — pattern-type dispatcher extension (v1 ships regex; tracked at #285 itself)
- **#297** — clone-detector tests flake under full-suite parallel load (probabilistic)
- **#134** — umbrella; auto-closes when #122 + #126 + #127 close
- **#136** — Phase 8 customize-hooks (sibling tracking issue)

## Methodology notes

- Each closure cites concrete evidence: code path, file:line, or empirical command output.
- Where a bug was "obsoleted by refactor," the closure comment names the successor architecture and any test that still covers the spec contract.
- Where a bug duplicates one we already closed (#128 ≈ #255, #129 ≈ #248), the closure comment notes the duplication and references the canonical fix.
- Where verification surfaces ANOTHER bug (e.g. #295 found while checking install-scope-discovery-hooks), the new finding goes here.
