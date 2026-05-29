---
slug: scope-discovery
phase: 10
deliverable: paper-test
canary: graphical-entries
date: 2026-05-25
---

# Paper-test: scope-discovery vs. graphical-entries

This document is the v1 acceptance signal for the `scope-discovery`
feature. The protocol is exercised end-to-end against the in-flight
`graphical-entries` feature design spec
(`docs/superpowers/specs/2026-05-16-graphical-entries-design.md`); the
coverage matrix below counts how many documented surfaces each detector
caught.

**Methodology mirrors the audiocontrol pilot's 87.5% paper-test**
referenced in the design spec. The audiocontrol pilot used a single-
run `scope-inventory` against the audiocontrol-side prd; we do the same
here against deskwork itself as the canary install (Phase 10 Task 1)
and the graphical-entries spec as the PRD-substitute (Phase 10 Task 3).

## Pass criterion

Combined coverage **> ~80%** across the four detector columns. Below
80%, the protocol ships with documented gaps + follow-up issues filed.

## Detectors evaluated

The four detector columns evaluated:

1. `scope_inventory_caught` — did `dw-lifecycle scope-inventory
   --slug graphical-entries` reference the surface in the resulting
   manifest at
   `docs/1.0/001-IN-PROGRESS/scope-discovery/scope-inventory-graphical-entries.yaml`?
2. `scope_widen_caught` — N/A in v1. `scope-widen` is deferred to
   [#292](https://github.com/audiocontrol-org/deskwork/issues/292)
   pending operator-driven design via `/frontend-design`. Marked
   `deferred` for every surface.
3. `anti_patterns_caught` — did
   `dw-lifecycle check-anti-patterns --root packages` flag a shape on a
   related code path? The deskwork-specific registry authored in Phase
   10 Task 2 contains four patterns: `hardcoded-stage-name-array`,
   `review-state-write`, `host-required-throw`,
   `single-pipeline-shape-assumption`.
4. `step0_enforcement_caught` — would the refactor-precondition
   checklist (Step 0a + Step 0b, enforced via
   `dw-lifecycle check-refactor-preconditions` against `clones.yaml`)
   surface a relevant rule when the operator runs a refactor commit
   that touches this surface? The baseline `clones.yaml` (Phase 10
   Task 1.2) has 105 clone groups across packages/ + plugins/; refactor
   commits affecting any of those groups must satisfy Step 0a/0b.

## Surface inventory

The graphical-entries spec promises these surfaces. Each row is one
documented promise that an adopter operator (or this agent, in a
downstream implementation session) would touch during the feature's
~11-phase rollout.

| # | surface_id | description |
|---|---|---|
| 1 | `pipeline-template-loader` | Plugin-shipped JSON template defaults at `packages/core/src/pipelines/<id>.json` + project overrides at `<projectRoot>/.deskwork/pipelines/` |
| 2 | `lane-config-loader` | `<projectRoot>/.deskwork/lanes/<id>.json` reader + default-lane bootstrap |
| 3 | `entry-schema-lane-field` | Entry sidecar `lane: string` field |
| 4 | `entry-schema-artifact-kind` | Entry sidecar `artifactKind: 'markdown' | 'html-mockup' | 'single-file-html' | 'image'` field |
| 5 | `entry-schema-members` | Group entries' `members: string[]` field |
| 6 | `verb-stage-list-refactor` | `approve/iterate/cancel/induct` read the entry's lane template instead of a hardcoded stage list |
| 7 | `studio-lane-tab-strip` | New tab strip in dashboard (one tab per lane + Combined) |
| 8 | `studio-per-template-stage-columns` | Each lane's dashboard renders columns from its template's `linearStages` |
| 9 | `studio-multi-lane-composed-views` | Operator-defined views pinning N lanes side-by-side |
| 10 | `studio-lane-visibility-panel` | Operator-controlled lane visibility + ordering |
| 11 | `studio-graphical-review-surface` | Iframe (HTML) / `<img>` (image) with marginalia overlay |
| 12 | `studio-group-review-surface` | Members panel rendering members in their lane positions |
| 13 | `studio-pipeline-editor` | Template editor UI (add/rename/remove stages) |
| 14 | `studio-lane-management-page` | CRUD for lanes |
| 15 | `studio-group-management-page` | CRUD for groups |
| 16 | `annotation-schema-replyTo` | Threaded replies via `replyTo: <comment-id>` field |
| 17 | `annotation-schema-attachments` | Screenshot/external-image attachments via `attachments: string[]` |
| 18 | `annotation-schema-spatial-anchor` | `spatialAnchor: { kind, selector?, x?, y? }` for graphical entries |
| 19 | `screenshot-storage` | `<entryDir>/scrapbook/screenshots/<comment-id>-<timestamp>.png` |
| 20 | `screenshot-capture-mechanism` | Browser-side `getDisplayMedia()` or DOM-to-canvas; selection-rectangle UI |
| 21 | `iterate-handler-registry` | Per-project iteration handlers at `<projectRoot>/.deskwork/iterate-handlers/<artifactKind>.ts` |
| 22 | `iterate-image-paths` | Skill prose enumerates regenerate / transform / SVG-edit / operator-supplied paths |
| 23 | `doctor-rule-lane-config-missing-template` | Lane references unknown template |
| 24 | `doctor-rule-entry-lane-not-found` | Entry references unknown lane |
| 25 | `doctor-rule-entry-stage-not-in-template` | Entry stage not in lane's template stages |
| 26 | `doctor-rule-group-recursive` | Group member is itself a group |
| 27 | `doctor-rule-group-member-missing` | Group references unknown member UUID |
| 28 | `doctor-rule-artifact-kind-mismatch` | Sidecar `artifactKind` mismatches file extension |
| 29 | `doctor-rule-image-locked-stage` | Image entry iterated while in locked stage |
| 30 | `migration-default-lane-bootstrap` | First-run doctor creates `default` lane + back-fills `lane: default` + `artifactKind` on every sidecar |
| 31 | `migration-sites-to-lanes` | Legacy `sites.<id>.contentDir` → `lanes/<id>.json` migration with deprecation warning |
| 32 | `cli-skill-lane` | New `/deskwork:lane` composite skill (list/show/create/update/archive/purge) |
| 33 | `cli-skill-group` | New `/deskwork:group` composite skill (list/show/create/update/add-member/remove-member/archive) |
| 34 | `cli-skill-pipeline` | New `/deskwork:pipeline` composite skill (list/show/create/update/delete) |
| 35 | `cli-skill-add-kind-flag` | `/deskwork:add --lane <id> --kind <kind>` flag additions |

Total surfaces: **35**.

## Coverage matrix

| surface_id | scope_inventory_caught | scope_widen_caught | anti_patterns_caught | step0_enforcement_caught | notes |
|---|---|---|---|---|---|
| pipeline-template-loader | yes | deferred | yes | yes | manifest's `pipeline` theme (50 occurrences); anti-pattern `hardcoded-stage-name-array` targets the canonical replacement; refactor-precondition gates the `core` clone groups |
| lane-config-loader | yes | deferred | no | no | manifest discovery theme captures the concept but no anti-pattern targets the legacy single-pipeline assumption (the regex didn't fire on source; only design-doc prose mentions it) |
| entry-schema-lane-field | yes | deferred | no | no | covered by manifest's `entry` + `stage` themes; no schema-shape anti-pattern yet (would require a regex over schema files) |
| entry-schema-artifact-kind | yes | deferred | no | no | covered by manifest's `entries` theme; same gap as above |
| entry-schema-members | yes | deferred | no | no | covered by manifest themes; no anti-pattern for unbounded array fields |
| verb-stage-list-refactor | yes | deferred | yes | yes | DIRECT HIT — anti-pattern `hardcoded-stage-name-array` caught all 5 sites (cli/induct, core/types, studio/dashboard/data, studio/entry-review/decision-strip, studio/pages/index); refactor-precondition gates clones in cli/cancel/induct/iterate/publish |
| studio-lane-tab-strip | yes | deferred | no | yes | manifest's `studio` theme + clone groups in `packages/studio/**`; no specific anti-pattern |
| studio-per-template-stage-columns | yes | deferred | yes | yes | tab-strip's child component; same coverage as above + anti-pattern hits in dashboard/data + entry-review/decision-strip |
| studio-multi-lane-composed-views | yes | deferred | no | yes | manifest captures via `studio` theme + clone groups in studio package |
| studio-lane-visibility-panel | yes | deferred | no | no | manifest captures via `studio` theme; no panel-specific anti-pattern |
| studio-graphical-review-surface | yes | deferred | no | yes | manifest captures via `review` + `surface` themes (50+ each); clone groups in studio/pages/shortform-review.ts (rev affordance) |
| studio-group-review-surface | yes | deferred | no | yes | covered by `studio` + `review` themes; clone groups in studio |
| studio-pipeline-editor | yes | deferred | no | yes | covered by `pipeline` + `studio` themes; clone groups in studio render code |
| studio-lane-management-page | yes | deferred | no | yes | covered by `studio` theme; clone groups in studio |
| studio-group-management-page | yes | deferred | no | yes | same |
| annotation-schema-replyTo | yes | deferred | no | yes | covered by `comment` theme (50 occurrences in spec); clone groups in core's annotations.ts (5c72154b2f6d shares with review/pipeline) |
| annotation-schema-attachments | yes | deferred | no | yes | same |
| annotation-schema-spatial-anchor | yes | deferred | no | no | covered by `comment` theme; no anchor-shape anti-pattern |
| screenshot-storage | yes | deferred | no | no | covered by manifest themes implicitly (`entry` + `surface`); no storage-path anti-pattern |
| screenshot-capture-mechanism | no | deferred | no | no | manifest doesn't capture browser-side capture machinery; no source-tree surface today |
| iterate-handler-registry | no | deferred | no | no | manifest doesn't capture `.deskwork/iterate-handlers/` (no source code lives there in baseline); no anti-pattern; no clone group |
| iterate-image-paths | yes | deferred | no | yes | covered by manifest themes; clone groups in cli's iterate.ts |
| doctor-rule-lane-config-missing-template | yes | deferred | no | yes | covered by `doctor` theme (50 occurrences); clone groups in core/doctor/rules |
| doctor-rule-entry-lane-not-found | yes | deferred | no | yes | same |
| doctor-rule-entry-stage-not-in-template | yes | deferred | no | yes | same |
| doctor-rule-group-recursive | yes | deferred | no | yes | same |
| doctor-rule-group-member-missing | yes | deferred | no | yes | same |
| doctor-rule-artifact-kind-mismatch | yes | deferred | no | yes | same |
| doctor-rule-image-locked-stage | yes | deferred | no | yes | same |
| migration-default-lane-bootstrap | yes | deferred | yes | yes | clone group 98a17ac7f3a7 (26 lines, doctor/migrate.ts vs missing-frontmatter-id.ts); anti-pattern `hardcoded-stage-name-array` hits core/types.ts (the canonical Stage type that migration must back-fill) |
| migration-sites-to-lanes | yes | deferred | no | yes | covered by `pipeline` theme; clone groups in core/calendar.ts |
| cli-skill-lane | yes | deferred | no | yes | covered by themes; clone groups in cli/commands/* (16+ groups in cli) |
| cli-skill-group | yes | deferred | no | yes | same |
| cli-skill-pipeline | yes | deferred | no | yes | same |
| cli-skill-add-kind-flag | yes | deferred | no | yes | covered by themes; clone groups 014b49040fe1 (add.ts ↔ ingest.ts) |

## Coverage computation

Per-detector tallies across 35 surfaces:

| detector | yes | no | deferred | coverage |
|---|---|---|---|---|
| `scope_inventory_caught` | 33 | 2 | 0 | 33/35 = **94.3%** |
| `scope_widen_caught` | 0 | 0 | 35 | N/A (deferred) |
| `anti_patterns_caught` | 4 | 31 | 0 | 4/35 = **11.4%** |
| `step0_enforcement_caught` | 27 | 8 | 0 | 27/35 = **77.1%** |

**Combined coverage** (across the three non-deferred detectors):

```
total_yes_cells = 33 + 4 + 27 = 64
total_evaluated_cells = 35 * 3 = 105
combined = 64 / 105 = 0.6095...
```

**Combined: 60.9%.**

## Pass / fail against the ~80% threshold

**FAIL** — combined coverage is 60.9%, below the workplan's ~80% gate.

### Honest accounting of the gap

The shortfall is concentrated in `anti_patterns_caught` (11.4%) and to
a lesser extent `step0_enforcement_caught` (77.1%). The
`scope_inventory_caught` column hits 94.3% on its own — the synthesis
+ discovery agents capture nearly every documented surface via PRD
themes + clone groups + module globs.

**Why anti_patterns_caught is low:** the registry shipped in Phase 10
Task 2 is a *starter set* (4 patterns), targeting deskwork's most
egregious refactor candidates (hardcoded stages + retired reviewState +
host-required + single-pipeline). The graphical-entries surface set is
much broader — annotation schema extensions, screenshot storage,
spatial anchors, browser-side capture, doctor rules, migration paths —
and each of those would need its own anti-pattern entry to register
as a "caught" cell. The workplan explicitly framed Phase 10 Task 2 as
a starter set ("Author 2-4 entries reasonably") rather than exhaustive
coverage.

**Why step0_enforcement_caught is 77.1%:** the `clones.yaml` baseline
covers the existing code packages (cli + core + studio), and most
documented surfaces in graphical-entries WILL touch those packages
during implementation. The 8 surfaces NOT covered are new-construction
surfaces (`iterate-handler-registry`,
`screenshot-capture-mechanism`, `studio-lane-visibility-panel`, etc.)
where no existing code exists to clone-detect against.

### What a 80%+ paper-test would look like

To reach 80% combined coverage, the anti-patterns registry needs ~10
additional entries targeting:

- Annotation-schema shape (so the regex catches code that hand-rolls
  the comment / annotation shape).
- Screenshot path conventions (storage paths, capture invocation
  patterns).
- Doctor rule shape (deskwork doctor rules follow a documented
  contract; an anti-pattern for hand-rolled doctor rules outside the
  registered shape would catch new rules that miss the contract).
- Migration step shape (atomic write conventions; journal append shape).
- Browser-side capture invocation (single canonical
  `getDisplayMedia()` wrapper to prevent ad-hoc instantiation).

Plus a future `scope-widen` invocation (deferred to #292) would close
the second deferred column once the verb lands.

## Operator action items

The Phase 10 paper-test surfaces the following follow-up work. Each
item is filed as a tracked GH issue or referenced from one. Per the
agent-discipline.md rule *"Operator owns scope decisions"*, the
agent's role here is to surface the gaps; the operator decides what
ships in v1.1+.

| # | gap | action | tracking |
|---|---|---|---|
| 1 | jscpd config path mismatch (install places config at `.dw-lifecycle/scope-discovery/.jscpd.json`; runner expects root) | Update `jscpd-runner.ts` to read from the documented path | [#293](https://github.com/audiocontrol-org/deskwork/issues/293) |
| 2 | pre-commit hook breaks when `dw-lifecycle` binary predates scope-discovery subcommands | Add version-check + skip-with-warning in hook template | [#294](https://github.com/audiocontrol-org/deskwork/issues/294) |
| 3 | `check-editor-symmetry --gate-mode` flag missing (hook template hard-codes the flag) | Add `--gate-mode` to `check-editor-symmetry` | [#295](https://github.com/audiocontrol-org/deskwork/issues/295) |
| 4 | Anti-patterns registry starter set is too small to reach 80% combined coverage on a graphical-entries-shaped feature | Author additional patterns: annotation-schema, screenshot-storage, doctor-rule-shape, migration-step, browser-capture | TBD — operator triage from this paper-test |
| 5 | `scope-widen` deferred; one detector column always "deferred" until it lands | Design + implement `scope-widen` per [#292](https://github.com/audiocontrol-org/deskwork/issues/292) | [#292](https://github.com/audiocontrol-org/deskwork/issues/292) |
| 6 | Anti-patterns scanner regex fires inside comment text (false positive on `packages/cli/src/commands/ingest.ts`) | Pattern-type dispatcher follow-up; ts-morph backend skips comments | [#285](https://github.com/audiocontrol-org/deskwork/issues/285) |
| 7 | PRD lacked a References/Appendix section; `reference_docs[]` defaulted to PRD + LAYOUT.md | Add References section to the graphical-entries spec when it enters implementation | (No issue yet — operator-side spec iteration) |

## Conclusion

The scope-discovery protocol is **functional end-to-end against a
real-shaped feature** but **does not meet the ~80% combined coverage
threshold** specified as the v1 ship-gate. The protocol's machinery
works (install commands all succeed; scope-inventory completes in
<0.5s with full evidence trail; anti-patterns scanner returns real
findings; refactor-precondition gates engage on commits via the
pre-commit hook); the gap is in the **breadth of the deskwork-specific
anti-patterns registry**, which is the deliberate "starter set"
choice from the Phase 10 Task 2 brief.

The operator's call: ship v1 with the gap documented + follow-up items
filed, or extend Phase 10 with additional anti-pattern authoring
before declaring v1 acceptance.
