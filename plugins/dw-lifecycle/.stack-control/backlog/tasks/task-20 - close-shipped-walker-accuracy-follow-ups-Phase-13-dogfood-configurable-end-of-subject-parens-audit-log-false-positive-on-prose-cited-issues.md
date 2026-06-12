---
id: TASK-20
title: >-
  close-shipped walker accuracy follow-ups (Phase 13 dogfood): configurable
  end-of-subject parens + audit-log false-positive on prose-cited issues
status: To Do
assignee: []
created_date: '2026-06-10 20:07'
labels:
  - 'type:imported-issue'
  - bug
dependencies: []
references:
  - gh-369
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

The Phase 13 / #366 fix is strict-correct per GitHub's auto-close grammar, but the v0.28.1 dogfood verification surfaced two real follow-ups:

1. **Commit-log walker drops too much for the deskwork convention.** This project's commit-message convention uses `feat(scope): subject (#NNN)` (end-of-subject parens) to mark fix-shipping commits. Phase 13 dropped `parens` as a category because the same shape also appears in back-fill / docs commits that merely cite an issue number. Result: dogfooding `close-shipped --from-tag v0.26.5 --to-tag v0.27.0 --dry-run` after v0.28.1 ships surfaces **zero** commits even though `#356`, `#361`, `#364` were all closed by commits using `(#NNN)` end-of-subject convention. The fix is technically correct under GitHub's grammar; the gap is the convention mismatch.
2. **Audit-log walker matches `Closes #NNN` literals inside prose / test-fixture text.** Same dogfood surfaced `#50` as a false-positive candidate because `AUDIT-20260529-09`'s entry body literally contains the test-fixture text `"Bare \`#50\` in subject is dropped post-Phase-13; the \`Closes #50\` in the body is the only fix-shipping signal."` — a description, not a fix claim. The audit-log entry's actual subject is the Phase 13 review which has nothing to do with issue #50. The walker can't distinguish "this entry tracks #N" from "this entry's prose mentions #N as an example."

Found during the v0.28.1 install verification (2026-05-30). Both surfaces missed the post-Phase-13 dogfood acceptance.

## Repro

After `v0.28.1` install:

```bash
dw-lifecycle close-shipped --from-tag v0.26.5 --to-tag v0.27.0 --dry-run
```

Expected: `#356`, `#361`, `#364` surface (these had explicit fix commits in v0.27.0).

Actual: only `#50` surfaces — from the audit-log walker false-positive. Zero commit-log matches even though every fix commit's subject ends in `(#NNN)`.

## Root cause

**Walker 1 (commit-log).** Phase 13's drop of `parens` covered the false-positive case (`docs: back-fill (#353)` shouldn't surface #353), but also the genuine fix case (`feat: ... (#361)` does close #361). The shape is genuinely ambiguous on its own — distinguishing requires more context (commit type prefix? body?) or project-side opt-in.

**Walker 2 (audit-log).** `audit-log-walker.ts`'s `ISSUE_PATTERNS` accept any `Closes #N` / `Fixes #N` / `Resolves #N` in the entry body. The walker assumes those keywords claim that this audit entry IS the fix for that issue, but they may also appear inside test fixtures, code examples, or descriptive prose. Same false-positive shape Phase 13 fixed for the commit-log walker, but in a different surface.

## Suggested fix

### Task 1: Commit-log walker — configurable end-of-subject parens

Add a project-level config knob (`.dw-lifecycle/close-shipped-config.yaml`):

```yaml
treat_end_of_subject_parens_as_fix_marker: true
```

When the knob is true, the walker re-enables the `parens` pattern but ONLY for matches at the END of the subject (mid-subject or body parens stay dropped). When false (default), Phase 13's strict behavior holds — adopters who follow GitHub's auto-close grammar literally get the strict semantic; adopters whose convention uses end-of-subject `(#NNN)` for issue references opt in.

The deskwork project would ship this config knob set to `true` since the existing convention uses end-of-subject parens.

Regression tests: case (a) `feat: subject (#42)` with knob=true → surfaces #42; case (b) same with knob=false → does NOT surface; case (c) `feat: subject (#42) trailing text` (parens not at end) → does NOT surface regardless of knob.

### Task 2: Audit-log walker — entry-tracked vs prose-cited disambiguation

Two approaches:

- **Light:** add an explicit per-entry frontmatter field `tracks_issue: NNN`. The walker prefers this field over body-scraping. Body fix-keyword matches fall back only when the frontmatter is absent.
- **Medium:** require the issue reference to appear in the FIRST line of the body (the entry's title/subject), not anywhere in the body. Mirrors GitHub's auto-close grammar for commit subjects.
- **Heavy:** combine both — frontmatter field is canonical; the first-line scan is the fallback when the field is absent.

The Light approach matches how the workplan-checkbox walker works (the `· [#NNN](url)` back-fill is on the same line as the checked task) and is the smallest change. Adopters who don't set the frontmatter field get the existing behavior; adopters who do get strict-canonical.

For the v0.28.1 false-positive case: AUDIT-20260529-09's subject line is `Phase 13 Task 1 (commit 5f620b1) — close-shipped fix-keyword filter` — it doesn't claim to fix any issue number, so the strict walker would drop it.

## Acceptance

- [ ] `close-shipped --from-tag v0.26.5 --to-tag v0.27.0 --dry-run` against an installed release-after-this-fix surfaces `#356`, `#361`, `#364` (the 3 real candidates from the v0.27.0 dogfood).
- [ ] Does NOT surface `#50`, `#351`, `#352`, `#353`, `#355`, `#362`, `#365` (the false positives).
- [ ] `.dw-lifecycle/close-shipped-config.yaml` knob `treat_end_of_subject_parens_as_fix_marker: true` documented in the close-shipped SKILL.md; default value, opt-in semantics, and the trade-off (relaxes GitHub's strict grammar in exchange for project-convention support) explained.
- [ ] Audit-log walker accepts an optional `tracks_issue: NNN` frontmatter field per entry; body scrape becomes the fallback.
- [ ] Vitest coverage; clone gate clean; full plugin suite green.

## Provenance

- Surfaced via v0.28.1 install verification: ran `dw-lifecycle close-shipped --from-tag v0.26.5 --to-tag v0.27.0 --dry-run` immediately after install. Expected 3 candidates; got 1 (audit-log false positive). Phase 13's strict semantic is GitHub-grammar-correct but the project's convention doesn't match.
- Tracked as Phase 14 in the hygiene workplan (`docs/1.0/001-IN-PROGRESS/hygiene/workplan.md`).
- Cross-link: [#366](https://github.com/audiocontrol-org/deskwork/issues/366) (Phase 13 — the commit-log narrowing this Phase 14 supplements).
<!-- SECTION:DESCRIPTION:END -->
