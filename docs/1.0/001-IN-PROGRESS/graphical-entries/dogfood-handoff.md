# scope-discovery v1 dogfood — graphical-entries handoff

## What this is

`scope-discovery` shipped as v1 with a measured 60.9% paper-test coverage against this feature's design spec — below the originally-stated ~80% gate. The operator reframed the ship gate from "paper-test coverage percentage" to "dogfood-based feedback": graphical-entries' implementation team uses scope-discovery as they build, logs friction in this directory's `tooling-feedback.md`, and the scope-discovery v1 hardens via an audit cycle on that log. This mirrors the audiocontrol pilot pattern that produced [TF-001..TF-016 in audiocontrol-akai-harmonization](https://github.com/audiocontrol-org/audiocontrol-akai-harmonization) — 16 friction entries became 7 closed-via-PR-#462/#463 fixes + 4 follow-ups that landed back in deskwork as #284–#290.

## Where to start

- **Design spec:** [`docs/superpowers/specs/2026-05-16-graphical-entries-design.md`](../../../superpowers/specs/2026-05-16-graphical-entries-design.md). The full graphical-entries feature definition (lanes, templates, artifact kinds, ~35 surfaces).
- **Scope-inventory baseline:** [`docs/1.0/001-IN-PROGRESS/scope-discovery/scope-inventory-graphical-entries.yaml`](../scope-discovery/scope-inventory-graphical-entries.yaml). The 445-line manifest produced by `dw-lifecycle scope-inventory --slug graphical-entries` against the spec. Lists modules, regime holdouts, agent findings. The graphical-entries team REFERENCES it but the file is owned by the scope-discovery feature directory.
- **Paper-test baseline:** [`docs/1.0/001-IN-PROGRESS/scope-discovery/paper-test-graphical-entries.md`](../scope-discovery/paper-test-graphical-entries.md). 35 surfaces × 4 detector columns; tells you what scope-discovery already catches and where the gaps are. The dogfood team's friction adds the "what's still missing" signal.
- **Evidence trail from the canary run:** [`docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/runs/20260525T110802Z-1cdd0f/`](./scope-inventory/runs/20260525T110802Z-1cdd0f/) — 6 per-agent JSONs + `synthesis.md` + `editor-symmetry.md` + `args.json`.

## What to log in tooling-feedback.md

Pay attention to (and file TF entries for) friction in any of these categories:

- **A** — anti-pattern registry false-positives, false-negatives, prefix-collision traps (per pilot TF-015), missing patterns the spec implies
- **AM** — adopter-manifest `from:` path semantics, primitive-relocation awareness (per pilot TF-001/TF-002), expected_adopters_glob authoring ergonomics
- **CL** — clone-detector + clones.yaml workflow (refresh-baseline ergonomics, disposition-survivor protection, batch-dispose hints — pilot TF-003/TF-013/TF-014 area)
- **GATE** — pre-commit hook chain ergonomics (multi-gate failure consolidation per pilot TF-004; check-* output verbosity per pilot TF-010)
- **DSC** — discovery agent over/under-broad outputs (per pilot TF-005), synthesis warnings (per pilot TF-006), per-agent override resolution
- **MISC** — dispatch-hygiene gaps (per pilot TF-016), packaging, agent-prompt mirror drift, anything that didn't fit elsewhere

The graphical-entries feature touches every layer the scope-discovery protocol exercises (router enumeration, pattern matrix, clone detection, themed-pattern hunting, regime holdouts, editor symmetry, adopter manifests) — friction in any of these is on-topic.

## Known open friction

These four GH issues were filed during Phase 10 of scope-discovery; do **not** re-file:

- [#293](https://github.com/audiocontrol-org/deskwork/issues/293) — `.jscpd.json` config-path mismatch on install (symlink workaround in place)
- [#294](https://github.com/audiocontrol-org/deskwork/issues/294) — `install-scope-discovery-hooks` hardcodes a `dw-lifecycle` binary path that predates the scope-discovery subcommands
- [#295](https://github.com/audiocontrol-org/deskwork/issues/295) — hook chain writes `check-editor-symmetry --gate-mode` (unsupported flag)
- [#296](https://github.com/audiocontrol-org/deskwork/issues/296) — anti-pattern starter-set is intentionally small (4 entries); operator action item from Phase 10 Task 2

## Open follow-ups from the audiocontrol pilot import

Already-deferred friction surfaced during the audiocontrol pilot dogfood and imported into the scope-discovery workplan. The graphical-entries team should know these exist so they don't re-file:

- [#284](https://github.com/audiocontrol-org/deskwork/issues/284) — `batch-dispose` paste-ready hint (amended from pilot TF-014)
- [#285](https://github.com/audiocontrol-org/deskwork/issues/285) — pattern-type dispatcher (glob/ast-grep/ts-morph; amended with pilot TF-015's `negative_match_classes:` schema extension)
- [#288](https://github.com/audiocontrol-org/deskwork/issues/288) — anti-pattern `canonical_file` field (from pilot TF-002)
- [#289](https://github.com/audiocontrol-org/deskwork/issues/289) — disposition-survivor gate (from pilot TF-013) — note: the verb itself landed Phase 6 Task 3; this issue tracks pre-commit hook-chain integration
- [#290](https://github.com/audiocontrol-org/deskwork/issues/290) — primitive-extraction dispatch hygiene (from pilot TF-016)

Plus two operator-deferred items:

- [#291](https://github.com/audiocontrol-org/deskwork/issues/291) — `migrate-from-pilot` (audiocontrol-specific)
- [#292](https://github.com/audiocontrol-org/deskwork/issues/292) — `scope-widen` verb design (needs `/frontend-design`)

## How to escalate

- **Stays in `tooling-feedback.md`:** routine friction with a clear suggested-fix shape; recurring papercuts; small ergonomic improvements; observations about tool output. The audit cycle on this log will roll multiple TF entries into one batch fix when patterns emerge.
- **Promotes to GH issue:** architecture-level concerns (a contract or schema shape needs to change); repeated patterns across multiple audit cycles (per agent-discipline's `Just for now is bullshit` rule, a recurring deferral becomes a tracked debt); design-decision asks that need operator input; anything that would block the next scope-discovery release.

Pattern: file the TF entry first (cheap, captures the friction in context). When you find yourself referencing the same TF entry across 2+ situations, that's the signal to promote to a GH issue. The GH issue body cites the TF entries that motivated it; the TF entries get a `Status: promoted to #NNN` line.

## Closure protocol

When the graphical-entries feature ships (PR merges, the implementation team is moving on):

1. **Add a final TF entry summarizing the dogfood result.** Title shape: `TF-NNN · MISC · n/a · Dogfood closure summary`. Body: what worked (which protocol layers caught friction proactively), what didn't (which surfaces fell through), what needs follow-up (recurring patterns that justify a v1.1 audit cycle).
2. **Post a closing comment on the graphical-entries PR.** Link the `tooling-feedback.md` file and the closure entry. Cite the total TF count + how many promoted to GH issues.
3. **Hand off to the scope-discovery team.** The deskwork team imports the closure into [`docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md`](../scope-discovery/audit-log.md) as `AUDIT-<date>-<NN>` entries — mirror of how we imported the audiocontrol pilot's TF-001..TF-016 into AUDIT-20260525-05..09. Those audit entries become the v1.1 workplan input.
4. **The log itself stays here, never deleted** — when this feature's docs move to `003-COMPLETE/`, `tooling-feedback.md` moves with them. Future scope-discovery audits read it as historical record.
