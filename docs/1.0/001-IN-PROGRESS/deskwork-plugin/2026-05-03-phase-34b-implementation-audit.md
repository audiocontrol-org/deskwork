# Phase 34b Implementation Audit

Date: 2026-05-03

## Scope

Audit target: the most recent feature implementation on this branch, interpreted as the Phase 34b feature work (`c93fc65`, `59aeafe`) on top of the already-landed 34a remediation.

## Findings

### 1. Scrapbook composer defaults note filenames using UTC, not the operator's local date

Severity: medium

The restored inline scrapbook composer generates its default filename with `new Date().toISOString().slice(0, 10)` both when the form is first shown and when a blank filename is submitted:

- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:405)
- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:432)

This means operators west of UTC can get a default `note-YYYY-MM-DD.md` for the next calendar day during late-evening local usage. For scrapbook notes, the filename date is user-visible content, so this is a real correctness issue rather than a cosmetic quirk.

### 2. Composer keyboard shortcuts stop working when focus is in the filename field

Severity: medium

The 34b workplan describes the scrapbook composer restoration as a return to the pre-F1 interaction pattern:

- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1757)

But the implementation wires `Cmd/Ctrl+S` and `Escape` only on the body textarea:

- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:472)
- [plugins/deskwork-studio/public/src/scrapbook-mutations.ts](/Users/orion/work/deskwork-work/deskwork-plugin/plugins/deskwork-studio/public/src/scrapbook-mutations.ts:475)

If the operator is editing the filename and presses either shortcut, nothing happens. That makes the restored composer less consistent than the rest of the inline prompt work shipped in the same phase and weakens the "restored known-working behavior" claim.

## PRD Adherence

Phase 34b is mostly implemented as described in the PRD and workplan:

- inline scrapbook composer restored
- rejection-reason prompt restored inline
- native browser dialogs removed from production code
- JPEG/WebP/GIF dimensions added
- secret-card glyph added
- edit-toolbar tooltip and shortcuts discoverability work shipped

Relevant PRD/workplan references:

- [prd.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/prd.md:587)
- [workplan.md](/Users/orion/work/deskwork-work/deskwork-plugin/docs/1.0/001-IN-PROGRESS/deskwork-plugin/workplan.md:1757)

Assessment: partial adherence.

The phase lands the intended feature set, but the scrapbook composer still has two operator-facing behavior gaps: incorrect local-date filename defaults and incomplete keyboard handling once focus moves to the filename field. Those are small relative to the whole phase, but they are real deviations from the implied "restored working interaction" bar.

## Verification

Targeted tests run:

```sh
npm run test --workspace @deskwork/studio -- no-native-prompts scrapbook-image-dimensions review-scrapbook-index-redesign entry-review-edit-toolbar entry-review-decision-strip
```

Result: passing.

Manual verification:

- source audit of the 34b implementation files
- PRD/workplan comparison against the shipped behavior
