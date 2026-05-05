---
deskwork:
  id: 818a5ef7-5ff8-444a-a01c-3fa31906d345
---
# Open Issue Tranche Proposal

Date: 2026-05-04
Scope: open GitHub issues relevant to the `deskwork` and `deskwork-studio` plugins.

## Scope Assumption

This review treats "devwork" as a typo for `deskwork`. I included issues whose current implementation surface is in `plugins/deskwork`, `plugins/deskwork-studio`, or their supporting `packages/cli`, `packages/core`, and `packages/studio` code. I excluded `dw-lifecycle` except where it intersected shared architecture.

## Recommendation

Process the remaining issue set in four passes:

1. Close the items that are already implemented but still need a human operator to verify installed-release behavior.
2. Tackle the current scrapbook/storage architecture tranche, because it affects live correctness and keeps creating compensating logic.
3. Handle studio UX polish items that are still real but are not architectural blockers.
4. Sweep the stale, moot, and upstream-owned issues so the tracker reflects the current product shape.

## Tranche 1: Verify And Close

These appear implemented in code and docs, but should be verified by a human in an installed build before closing.

- `#159` entry-review edit-mode real-estate fix
  Status: implemented in Phase 34; workplan explicitly leaves closure pending operator verification.
- `#160` edit-pane typography fix
  Status: implemented in Phase 34; same closure-pending note.
- `#161` scrapbook redesign umbrella
  Status: main work shipped; verify installed behavior, then close or split any residual follow-ups.
- `#163` JPEG/WebP/GIF image dimensions in scrapbook
  Status: implemented in Phase 34b.
- `#164` secret-card visual continuity
  Status: implemented in Phase 34b.
- `#165` studio dev-mode Tailscale binding
  Status: implemented and locally verified in docs; still worth human confirmation in the target environment.
- `#166` restore scrapbook inline composer and remove native prompts
  Status: implemented in Phase 34b.
- `#183` `ingest` should write entry-centric sidecar
  Status: implementation and tests are present.
- `#184` `add` should write entry-centric sidecar
  Status: implementation and tests are present.
- `#188` marginalia should auto-open when adding a note
  Status: implementation appears present; confirm in browser before closure.

### Verification Standard

For this tranche, do not re-debate design. Verify the shipped behavior in an installed plugin setup, add a short issue comment noting the exact build/commit checked, and close if behavior matches the issue.

## Tranche 2: Active Architecture Cleanup

These are the highest-value remaining issues because they track the scrapbook/storage split that is still causing dual-path logic and operator confusion.

- `#191` studio scrapbook writes still use slug-template path
  Priority: highest
  Why: this is the live correctness bug in the current architecture. It keeps scrapbook writes detached from the entry-aware location model.
- `#192` collapse dual scrapbook resolvers
  Priority: immediately after `#191`
  Why: once writes are entry-centric, the fallback resolver logic can be simplified and a whole class of legacy ambiguity can be removed.

### Proposed Handling

Implement `#191` first, then `#192` in the same short arc if the write-path change is stable. Avoid mixing unrelated UX work into this tranche.

## Tranche 3: Real But Non-Blocking Product Work

These are still valid issues, but they are not the best first use of release-stabilization time.

- `#190` marginalia vertical alignment / placement polish
  Status: active and appears to be in progress on this branch.
  Recommendation: finish and verify after the scrapbook path cleanup, unless it is already effectively done in the current working tree.
- `#54` agent-reply margin notes on the studio review surface
  Status: still valid feature work, not shipped.
  Recommendation: keep open as a distinct feature arc.
- `#84` iterate skill says to read pending comments without a documented path
  Status: still real
  Recommendation: either document the current path or reword the skill so it matches the current review flow.
- `#85` version diff view / compare review versions
  Status: still valid feature work.
- `#82` editable voice catalog
  Status: still valid feature work.
- `#87` skinnable studio
  Status: still valid feature work.
- `#86` Google Docs plugin
  Status: still valid, but long-horizon and not release-critical.

## Tranche 4: Moot, Superseded, Or Stale-Framing Issues

These should be reviewed for closure or reframing so the tracker stops implying work that no longer matches the architecture.

- `#75` dashboard Publish button returns 404
  Assessment: moot
  Why: the dashboard Publish button was removed by the Phase 30 rewrite. The failure path no longer exists.
  Action: close with a note that the UI element was removed rather than repaired.
- `#94` Phase 26 umbrella
  Assessment: historical umbrella
  Why: docs record the Phase 26 work as shipped in `v0.9.5`, with later descendants split into other issues.
  Action: close if still open, or update to point at the surviving follow-on issues only.
- `#89` stale `installed_plugins.json` path after old marketplace-source upgrade
  Assessment: likely moot locally, with residual risk upstream-owned
  Why: the repo already ships `repair-install`, troubleshooting docs, and migration notes; the remaining failure mode was attributed to Claude Code plugin installation behavior.
  Action: either close as mitigated with upstream reference, or relabel as upstream-tracking if the team wants it visible.
- `#83` should state-mutating actions auto-commit?
  Assessment: likely superseded by the current THESIS/manual-command architecture
  Why: the product has moved toward explicit operator-invoked commands rather than implicit commits from UI actions.
  Action: close as superseded unless the team wants to reopen the policy question under the new architecture.

## Tranche 5: Reframe Before Acting

These issues are not cleanly "open work" or "moot". Their original framing no longer matches the product, so they should be rewritten before someone tries to implement the wrong thing.

- `#40` move outline artifact into scrapbook / content sandbox
  Assessment: likely partially or fully absorbed already
  Evidence: current core and plugin code already treat the outlining artifact as `scrapbook/outline.md`.
  Risk: feature docs still describe the corresponding phase as not started, so the issue tracker and the code disagree.
  Action: verify current shipped behavior, then either close `#40` or reopen it as a narrower migration/documentation cleanup issue.
- `#53` install should prompt for author instead of failing later
  Assessment: stale reproduction, possibly still-real underlying UX gap
  Why: the old `outline`/`draft` verbs named in the issue are retired, but scaffold paths still rely on `author` config in at least some cases.
  Action: rewrite the issue around the current command surface. Do not close it solely because the original reproduction path changed.

## External / Upstream Blockers

- `#92` hyphenated `deskwork-studio` namespace dispatch bug in Claude Code
  Assessment: external blocker / platform quirk
  Why: this does not look like a product bug in the plugin code itself, and project docs already treat it as out of local scope.
  Action: keep open only if it is serving as a tracking issue for upstream behavior; otherwise close with upstream reference.

## Lower-Priority Background Issues

These are still conceptually open, but they should not block the current release or stabilization pass.

- `#18` multi-content-type / hierarchical content-tree architecture
- `#30` cache content-tree assembly
- `#33` content identity vs path / slug architecture

Recommendation: keep them in backlog until the scrapbook path unification work is done. They are bigger architectural topics, not cleanup issues.

## Proposed Working Order

1. Run the human verification sweep and close the "implemented but unclosed" tranche.
2. Fix `#191`.
3. Fix `#192`.
4. Finish or verify `#190` if it is still incomplete after the current branch settles.
5. Sweep the moot/superseded/stale issues and close or rewrite them so the tracker matches reality.
6. Reprioritize the remaining product-feature tranche (`#54`, `#84`, `#85`, `#82`, `#87`, `#86`) against roadmap goals.

## Practical Closure Proposal

If the goal is to make the tracker operationally useful again, the fastest win is:

- close the verify-ready tranche after a short human pass
- close the clearly moot tranche immediately with explanatory comments
- rewrite `#40` and `#53` before anybody picks them up
- treat `#191` and `#192` as the only near-term architecture-critical open issues for these plugins

That would leave a much smaller and more accurate issue set, with the remaining open items grouped by actual implementation strategy instead of by historical residue.
