---
slug: dw-lifecycle
date: 2026-05-03
audit-kind: prd-conformance
audited-against: design.md
auditor: independent (codebase-auditor)
---

# dw-lifecycle PRD Conformance Audit

**Date:** 2026-05-03
**Audited feature:** `dw-lifecycle`
**Audited against:** `design.md`, `README.md`, the shipped `plugins/dw-lifecycle/` source, and the reopened follow-up arc in `workplan.md`
**Audit type:** Independent re-check of the as-built branch against the PRD. Distinct from `2026-05-03-implementation-audit.md` (pre-remediation gap list) and `2026-05-03-post-remediation-audit.md` (self-audit written as part of Task 52 of the very arc under review).

## Executive summary

The remediation arc largely landed. The five headline claims of the post-remediation audit — real peer-plugin detection, install probing, PRD-first setup with `deskwork.id`, real cross-version retargeting, and the journal-template override seam — are all genuinely backed by code with realistic test coverage. **Recommendation:** the branch can land as the closeout of the remediation arc.

At audit time, three follow-up gaps in the same drift class the arc was supposed to close deserved operator attention before the next release:

1. **`/dw-lifecycle:doctor` shipped 2 of the 6 rules its SKILL.md and the PRD's §4 advertised.**
2. **`/dw-lifecycle:install`'s probe surface was narrower than its SKILL.md described.**
3. **`targetVersion` and `--from-target` lacked the path-traversal guard `slug` has** — an `--target ../../etc` argument flowed directly into `mkdirSync`.

All three were concrete instances of the same SKILL.md / helper drift class the post-remediation audit said was mostly closed. Since this audit was written, the `targetVersion` / `--from-target` guard and the `doctor` / `install` / `extend` skill-prose alignment have been fixed on the branch. The remaining substantive item from this audit is doctor-rule completeness versus the broader PRD scope.

## Audit method

Reviewed:

- `docs/1.0/001-IN-PROGRESS/dw-lifecycle/design.md`
- `docs/1.0/001-IN-PROGRESS/dw-lifecycle/README.md`
- `docs/1.0/001-IN-PROGRESS/dw-lifecycle/workplan.md` (~3,300 lines; range-read)
- `docs/1.0/001-IN-PROGRESS/dw-lifecycle/2026-05-03-implementation-audit.md`
- `docs/1.0/001-IN-PROGRESS/dw-lifecycle/2026-05-03-post-remediation-audit.md`
- `plugins/dw-lifecycle/src/**/*.ts`
- `plugins/dw-lifecycle/skills/*/SKILL.md`
- `plugins/dw-lifecycle/src/__tests__/*.test.ts`
- `plugins/dw-lifecycle/.claude-plugin/plugin.json`, `package.json`, `bin/`
- `.claude-plugin/marketplace.json`

All claims about specific symbols, file contents, or test names below were verified by direct read or grep against the working tree.

## Findings by contract

### 1. Lifecycle skill set matches the PRD's named flow

`skills/` contains: `define`, `setup`, `issues`, `implement`, `review`, `ship`, `complete`, `extend`, `pickup`, `teardown`, `customize`, `doctor`, `help`, `install`, `session-start`, `session-end`. The flow the PRD describes (define → setup → issues → implement → review → ship → complete) plus extend, pickup, teardown, doctor, customize, install, help, session-start, session-end is fully present.

**Verdict:** Conformant.

### 2. Setup: PRD-first, `deskwork.id`, definition import, worktree, branch, doc-tree

`src/subcommands/setup.ts` writes `prd.md` with `deskwork.id` UUID nested under the `deskwork:` key. Definition imports seed `prd.md` first; `workplan.md` is generated as a derivative artifact. Tests in `src/__tests__/setup.smoke.test.ts` exercise a tmp git repo and confirm both the UUID and PRD-first behavior end-to-end.

**Verdict:** Conformant.

### 3. Doctor / peer plugins

`src/subcommands/doctor.ts` reads the real Claude installed-plugin registry, checks install-path existence on disk, and distinguishes required from recommended. Tests in `src/__tests__/doctor.test.ts` use realistic registry-shaped fixtures rather than stubs. The false-negative class tracked in [#121](https://github.com/audiocontrol-org/deskwork/issues/121) is closed for the `peer-plugins` rule specifically.

**However:** see Finding 7 below — `peer-plugins` is one of six rules `skills/doctor/SKILL.md` and `design.md:231-236` advertise.

**Verdict:** Conformant for `peer-plugins`. Partially conformant for the doctor subcommand as a whole.

### 4. Install: probe-confirm-write, `--dry-run`, `--help`, unknown-flag rejection, `knownVersions` seeding, git-repo precondition

`src/subcommands/install.ts` requires a real git repo, supports `--dry-run` (preview), rejects unknown flags, and seeds `knownVersions` from disk by detecting `docs/<version>/` directories that follow the byVersion shape. `src/__tests__/install.smoke.test.ts` covers all four flag paths against a tmp git repo.

**However:** the SKILL.md's stated probe surface is materially broader than the helper's actual probe. See Finding 8.

**Verdict:** Partially conformant.

### 5. Version retargeting

`src/subcommands/transition.ts` (via `transitions.ts`) supports cross-version moves: `docs/<old>/<stage>/<slug>/` → `docs/<new>/<stage>/<slug>/`, with frontmatter rewritten in all three feature docs (`prd.md`, `workplan.md`, `README.md`). Tests in `src/__tests__/transitions.test.ts:59-91` confirm the move and the frontmatter update. Frontmatter round-trip preserves YAML structure (`frontmatter.ts` uses YAML Document round-trip rather than naive string replace).

**However:** see Finding 9 — the `extend` skill's prose introduces a `--retarget` flag that doesn't exist in the helper.

**Verdict:** Helper conformant; skill prose drift.

### 6. Journal/session override seam

`templates.ts` resolves `<projectRoot>/.dw-lifecycle/templates/<name>.md` overrides with fallback to bundled defaults. The bundled `templates/journal-entry.md` is generic — no DEVELOPMENT-NOTES.md taxonomy, no Course Corrections section, no Quantitative block. `templates.test.ts` covers the override resolve, copy, and refuse-overwrite paths.

**Verdict:** Conformant for the journal slice. The broader feature-doc template portability gap ([#123](https://github.com/audiocontrol-org/deskwork/issues/123)) is correctly identified in the README as deferred.

### 7. `/dw-lifecycle:doctor` rule completeness — non-conformant

The PRD lists six rules at `design.md:231-236`:

```
- missing-config
- peer-plugins
- version-shape-drift
- orphan-feature-doc
- stale-issue
- journal-feature-mismatch
```

`skills/doctor/SKILL.md:19-24` advertises the same six rules.

`src/subcommands/doctor.ts` implements two: `missing-config` (line 100) and `peer-plugins` (lines 109, 119). Verified by exhaustive grep — no `version-shape-drift`, `orphan-feature-doc`, `stale-issue`, or `journal-feature-mismatch` strings appear anywhere in the helper.

This is the same skill/helper drift class the remediation arc was supposed to close. The post-remediation audit treats doctor as closed; it is closed only for the `peer-plugins` rule. The other four rules ship as advertised behavior with no implementation.

**Verdict:** Non-conformant. Either the four missing rules need implementation, or the SKILL.md and `design.md` §4 need to be trimmed to match what `runDoctor()` actually does.

### 8. `/dw-lifecycle:install` probe surface — partially conformant at audit time

`skills/install/SKILL.md` describes a probe-then-confirm flow that includes: branch prefix, journal-file presence, GitHub remote, `worktrees.naming` from repo basename, and "confirm each detected value with the operator."

`probeInstallConfig` in `src/subcommands/install.ts` only inspects `docs/<version>/<status>` shape and seeds `knownVersions`. Branch prefix, journal, remote, and worktree naming are written from `defaultConfig()`. The helper has no interactive confirm path; `--dry-run` is the only preview surface.

This is the same drift class as Finding 7.

**Verdict at audit time:** Partially conformant. This prose drift has since been corrected by trimming the SKILL.md to match the docs-version-shape-only probe the helper provides.

### 9. `extend` skill prose introduced a non-existent flag at audit time

`skills/extend/SKILL.md:22` says: "Optionally record `--retarget <new-version>` to move the feature directory to a different version target."

Line 25 of the same file then shows the actual invocation:

```
dw-lifecycle transition <slug> --from inProgress --to inProgress --from-target <old-version> --target <new-version>
```

The `--retarget` framing has no helper anchor — `transition.ts` accepts `--from-target` / `--target`, not `--retarget`. The shell command shown works. The prose framing doesn't.

**Verdict at audit time:** Skill-prose drift. This has since been corrected by trimming the `--retarget` wording from the skill.

### 10. Path-traversal hardening — non-conformant for `targetVersion` at audit time

`src/slug.ts` exports `validateSlug`, which rejects path-traversal sequences (`..`, `/`, `\`). Tested in `src/__tests__/slug.test.ts`.

`src/docs.ts:13-25` read `opts.targetVersion` directly into `path.join(projectRoot, cfg.docs.root, opts.targetVersion, ...)` with no validation. At audit time there was no `validateTargetVersion` symbol in the codebase.

`setup.ts` then called `mkdirSync(... { recursive: true })` and wrote templates to the resolved path. `--target ../../etc` flowed through to `mkdirSync` outside the docs tree.

`--from-target` on `transition` had the same gap.

The README correctly flagged `targetVersion` validation as a non-blocker at audit time, but understated the consequence: this was path traversal, not just "would still escape the docs tree."

**Verdict at audit time:** Non-conformant. This has since been fixed on the branch by adding symmetric version validation at the CLI boundaries that accept `--target` / `--from-target`.

### 11. Marketplace + bin shim packaging

`plugin.json` and `package.json` lockstep at `0.9.7`. `bin/dw-lifecycle` follows the deskwork plugin convention (workspace-hoist tsx detection in dev; first-run npm install on adopter clones). Marketplace entry registered in `.claude-plugin/marketplace.json`. No build artifacts in tree; `.runtime-cache/` and `node_modules/` correctly gitignored.

**Verdict:** Conformant.

### 12. Project-rule adherence (TypeScript architecture, file-handling, namespacing)

- No `any`, no `as Type`, no `@ts-ignore` in any file read.
- Files all under 500 lines (largest: `setup.ts` at 351).
- No bare `/tmp/<name>` paths in helper or skills; tests use `mkdtempSync` + `tmpdir()`.
- `deskwork.id` is correctly nested under the `deskwork:` namespace per the metadata-namespacing rule. `targetVersion` is a top-level field by PRD design (a managed convention key), not a rule violation.

**Verdict:** Conformant.

## Drift between SKILL.md and helper (the dominant prior failure mode)

| Skill | Helper behavior | Verdict |
|---|---|---|
| `install` | Helper probes only docs version shape; skill claimed to probe branch prefix, journal, remote, worktree naming, and "confirm each detected value" | Audit-time drift, since corrected in skill prose |
| `setup` | Helper matches: PRD-first, `deskwork.id`, optional `--definition` seeding, branch + worktree creation | Conformant |
| `doctor` | Skill listed 6 rules; helper implements 2 (`missing-config`, `peer-plugins`) | Non-conformant on rule completeness; skill prose has since been narrowed |
| `extend` | Skill prose introduced `--retarget <new-version>`; helper exposes `--from-target` / `--target` on `transition` | Audit-time drift, since corrected in skill prose |
| `issues` | Helper matches: extract phases, create parent + per-phase issues, back-fill `<parentIssue>` | Conformant |
| `customize` | Helper matches: copy named template, refuse overwrite | Conformant |
| `define` / `pickup` / `teardown` / `help` / `implement` / `review` / `ship` / `session-start` / `session-end` | Skill-only orchestration; no helper subcommand | Conformant by design |

## Test-coverage reality check

Test files (verified by direct read):

- `cli.test.ts` — dispatcher + help + unknown-subcommand. Real, but blocked in some sandboxes by `tsx` IPC.
- `config.test.ts` — schema validation + defaults + override.
- `doctor.test.ts` — peer detection with realistic registry fixtures (`installed-plugins-both-peers.json`, `installed-plugins-required-only.json`).
- `docs.test.ts` — path resolution byVersion / non-byVersion + stages.
- `frontmatter.test.ts` — round-trip + scalar quoting + key-patching.
- `install.smoke.test.ts` — install + probe + dry-run + unknown-flag + help against tmp git repo.
- `journal.test.ts` — append + idempotency + heading-superstring guard.
- `setup.smoke.test.ts` — full setup including definition import against tmp git repo.
- `slug.test.ts` — accept/reject including `..`, `../etc`, slashes (real path-traversal coverage).
- `templates.test.ts` — override resolve + copy + refuse-overwrite.
- `tracking-github.test.ts` — `gh` CLI invocation shapes (mocked at `node:child_process` boundary).
- `transitions.test.ts` — same-version moves, idempotency, cross-version retarget with frontmatter rewrite.
- `workplan.test.ts` — parser + `markStepDone` + bold-handling + missing-step throws.

**Subcommands without dedicated tests:**

- `subcommands/issues.ts` (`extractPhases` regex, README back-fill, repo detection). The `gh` invocation shape is covered, but the phase-extraction + back-fill orchestration is not.
- `subcommands/customize.ts` argument parsing. The underlying `templates.ts` is covered.
- `subcommands/transition.ts` argument parsing. The underlying `transitions.ts` is covered.
- `subcommands/journal-append.ts`. The underlying `journal.ts` is covered.

These are gaps but follow a pattern: the underlying helper is tested, the CLI thin-wrapper isn't. Acceptable for v0.9.7; would be tightened during a focused QA pass.

## Open follow-ups validation (vs. README)

| README claim (at audit time) | Verified |
|---|---|
| `targetVersion` not validated | True at audit time — and stronger consequence than stated. See Finding 10. |
| `branchExists` only checks local refs | True (`src/subcommands/setup.ts` checks `refs/heads/...` only). |
| `TEMPLATES_DIR` via `import.meta.url` would break under `dist/` | True (`src/subcommands/setup.ts` and `src/templates.ts` both use `fileURLToPath(import.meta.url)`). |
| Journal seam first slice; broader [#123](https://github.com/audiocontrol-org/deskwork/issues/123) deferred | True. |

## Items the README does NOT flag

- `/dw-lifecycle:doctor` ships 2 of 6 advertised PRD rules. The other four remain documented in `design.md` but unimplemented. (Finding 7)
- Dead import `CONFIG_RELATIVE_PATH` in `src/subcommands/install.ts:3`. The plugin's `tsconfig.json` does not enable `noUnusedLocals` or `noUnusedImports`, so this is silent.

## Recommendation

The branch can land as the closeout of the reopened arc. The headline remediation claims (real peer detection, install probing, PRD-first setup with `deskwork.id`, real version retargeting, journal override seam) are genuinely backed by code with realistic test coverage. The remediation arc met its declared bar.

Before tagging the next release, the operator should still decide on the substantive remaining item rather than auto-deferring:

1. **`/dw-lifecycle:doctor` rule completeness or PRD scope correction.** Either implement `version-shape-drift`, `orphan-feature-doc`, `stale-issue`, and `journal-feature-mismatch`, or trim `design.md:231-236` to honestly reflect the two rules actually shipped.

The post-remediation audit's verdict of "substantially comports" is fair. The additional issues this audit identified for Task 48 prose drift and version-target hardening have since been fixed on the branch. The broader doctor-rule scope remains the only meaningful open conformance question raised here. It is not a blocker against landing this branch, but it is a real candidate for the next release cycle if the PRD is meant to stay broader than the shipped helper.

## Trivia

- `src/subcommands/install.ts:3` imported `CONFIG_RELATIVE_PATH` and never used it at audit time. Trivial; this has since been removed.
- `tsconfig.json` does not enable `noUnusedLocals`/`noUnusedImports`. Worth turning on as a separate small commit; would have caught the dead import above and may surface a few more.
