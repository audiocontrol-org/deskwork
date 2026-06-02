### Required-field copy builders can copy placeholder commands

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:95-103,182-189`; `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:88-102,205-228`

The New Lane and New Pipeline builders render placeholders (`<id>`, `<template>`, `<path>`, `<stages>`) when required fields are empty, but the Copy handlers still copy that preview verbatim. That means an operator can click Copy on an incomplete form and paste `/deskwork:lane create <id> ...` or `/deskwork:pipeline create <id> --shape <stages>`, which is not a valid, relevant command and is especially risky if pasted into a shell.

Reasonable fix: disable the Copy button while required fields are blank or invalid, surface a short inline validation message, and keep the placeholder only as a preview shape.

### Set-locked builder advertises a CLI-refused empty lock command

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:157-163`; `packages/studio/test/pipelines/pipelines-page-client.test.ts:214-238`

`buildSetLockedCommand` turns an empty checkbox selection into `--set-locked ""`, and the test explicitly asserts that shape. The CLI’s `splitStageList` refuses an empty comma-separated stage list, so the studio presents a command that looks like “clear all locks” but will fail when pasted.

Reasonable fix: either add a supported CLI clear-locks behavior, or make the UI refuse empty selection with an inline message instead of copying a doomed command.

### Page init is not actually idempotent

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   low
Surface:    `plugins/deskwork-studio/public/src/lanes/lanes-page.ts:167-189,193-221,240-289,322-344,347-364`; `plugins/deskwork-studio/public/src/pipelines/pipelines-page.ts:141-174,177-231,240-267,294-347,350-367`

Both controllers describe init as idempotent, but every init path calls `addEventListener` unconditionally. A second `initLanesPage()` or `initPipelinesPage()` call on the same DOM attaches duplicate input, toggle, and copy handlers; copy buttons can write/flash twice and toggle handlers can perform redundant state changes.

Reasonable fix: add a module-level or container-level wired guard, or mark each wired element with a dataset sentinel before attaching listeners.

### Lanes and pipelines pages mark Dashboard as the current page

Finding-ID: AUDIT-BARRAGE-codex-04
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/lanes.ts:76-80`; `packages/studio/src/pages/pipelines.ts:72-75`; `packages/studio/src/pages/chrome.ts:63-67`

Both new pages call `renderEditorialFolio('dashboard', ...)`, and `renderEditorialFolio` maps that to `aria-current="page"` on the Dashboard link. On `/dev/lanes` and `/dev/pipelines`, assistive tech is told the Dashboard link is the current page, which is incorrect link semantics.

Reasonable fix: extend the folio active key set for `lanes` and `pipelines`, or pass a no-current key for these pages until they have explicit nav entries.
