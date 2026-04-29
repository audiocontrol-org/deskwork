## Development Notes

Session journal for `deskwork`. Each entry records what was tried, what worked, what failed, and course corrections.

---

## 2026-04-29: dw-lifecycle Phases 1–2 in one session

### Feature: dw-lifecycle
### Worktree: deskwork-dw-lifecycle

**Goal:** Start Phase 1 (plugin scaffolding) of the `dw-lifecycle` plugin per the workplan committed at `ab3d4cf`. The user said "continue" mid-flight, so the session ended up landing both Phase 1 (T1–T5 + 1 fix) and Phase 2 (T6–T13 + 1 fix) — plugin skeleton through bin foundation.

**Accomplished:**

- Phase 1: Plugin skeleton (`plugin.json`, `package.json`, `LICENSE`, `README` stub), TS + Vitest config, bin wrapper + cli stub, 15 SKILL.md stubs, marketplace registration. `claude plugin validate plugins/dw-lifecycle` passes (one benign `author` warning).
- Phase 2: Frontmatter helpers (parse / write / update with quote-style preservation via Symbol-attached YAML Document), Zod-based config schema with full-tree defaults, repo + git helpers, `dw-lifecycle install` and `dw-lifecycle doctor` subcommands, smoke test for install.
- 13 commits ahead of `ab3d4cf` on `feature/deskwork-dw-lifecycle`.
- 14 vitest tests pass: frontmatter (5), config (4), install.smoke (1), doctor (4). `npx tsc --noEmit` clean.
- End-to-end smoke: `dw-lifecycle install /tmp/<dir>` writes a default `.dw-lifecycle/config.json` matching the schema; `dw-lifecycle doctor /tmp/<dir>` reports peer-plugin and missing-config findings and exits non-zero on errors.
- Used subagent-driven development throughout: implementer → spec compliance reviewer → code quality reviewer per task. Ran ~24 sub-agent dispatches across 12 tasks.

**Didn't Work (caught in review and fixed):**

- Task 1's `plugin.json` shipped a `metadata.peerPlugins` block per the workplan spec. Code reviewer flagged it; I rejected the concern as "forward-design." Task 5's `claude plugin validate` then failed with "Unrecognized key: metadata." Had to ship a fix commit (`9f23804`) removing the block before Phase 1 was actually shippable. The reviewer was directionally right and I should have validated against the schema rather than trusting the spec verbatim.
- Task 6's first implementation passed all 4 spec tests but had a real bug: `updateFrontmatter` used `{ ...data, ...patch }`, and object spread does NOT copy non-enumerable Symbol-keyed properties. So the YAML Document attached for round-trip preservation was silently dropped, and the output fell back to plain `stringify` — stripping quote styles. The spec test for `updateFrontmatter` only patched unquoted scalars so the bug was invisible. Code reviewer caught it; fix added a 5th regression test that preserves `date: "2026-04-29"` through `updateFrontmatter`, then mutated the Document directly via `doc.set(key, value)` instead of spreading.

**Course Corrections:**

- [PROCESS] Reviewer feedback that contradicts the spec deserves verification, not summary rejection. Twice I dismissed reviewer concerns by citing "the spec says X verbatim" — once on the `metadata.peerPlugins` schema mismatch, once on a spread-vs-Symbol bug. Both were real. Going forward: when a reviewer cites an external constraint (schema validator, runtime behavior, language semantics), run the validator/test before deciding the spec wins.
- [PROCESS] Spec tests can have systematic blind spots. The Task 6 `updateFrontmatter` test mutated only unquoted scalars, missing the failure mode that mattered most for the module's purpose. When reviewing TDD-style spec tests, also ask "what realistic call would NOT exercise this test path?" and add a regression case for it before claiming the implementation is solid.
- [COMPLEXITY] The Task 6 round-trip preservation strategy (Symbol-attached YAML Document) is clever and works, but exports the Symbol type, which makes the implementation choice part of the public API. If real callers don't need Document access, this should be made module-private later. Flagged but not fixed in-session — the cost of refactoring outweighed the benefit while the API has no external callers.

**Quantitative:**

- Messages from user: ~7 (session-start, "confirm", "continue", "never mind. continue", session-end, plus mid-session marketplace install verification)
- Commits: 13 implementation + 1 docs (this entry) = 14
- Files added/modified: 28 (plugin.json + plugin tree, src/* TS files, src/__tests__/* test files, 15 SKILL.md stubs, marketplace.json, root package-lock.json)
- Tests: 0 → 14 passing
- Sub-agent dispatches: ~24 (implementer × 12, reviewer × ~12)
- Corrections from user: 0 — user delegated heavily; I caught the corrections via my own reviewer dispatches
- Corrections caught by reviewers (mid-session, fixed before commit on next task): 2 substantive (peerPlugins schema, frontmatter spread)

**Insights:**

- Two-stage review (spec compliance, then code quality) caught bugs the spec tests didn't. The spec-only review on Task 6 said ✅ — the code quality reviewer found the spread bug. If I'd skipped the second stage, the bug would have shipped to Phase 5 (when subcommands like `setup` and `transition` start calling `updateFrontmatter` for real).
- Combining spec + code quality review into one prompt for trivial scaffolding tasks (Tasks 1, 4) saved a reviewer dispatch without obvious quality loss. For tasks with real logic (6, 7, 11) the two-stage form was worth the cost.
- "The spec is verbatim" is a heuristic, not a license to ignore reviewer signals. A spec written before contact with reality (the schema validator, the Symbol-spread interaction) embeds assumptions that may be wrong. Reviewer is testing those assumptions.
- The `subagent-driven-development` skill explicitly forbids skipping reviews. I tried to short-circuit on Task 4 (15 stub markdown files) and the skill held me back. The full review caught nothing, but the cost was small and the discipline mattered for the next task that DID have a real bug.

**Open follow-ups (not blockers):**

- Phase 6 README rewrite needs to document the peer-plugin relationship (`requires superpowers`, `recommends feature-dev`) since `metadata.peerPlugins` was dropped from `plugin.json`.
- The `YAML_DOC_SYM` and `FrontmatterData` exports in `frontmatter.ts` leak the round-trip implementation into the public API. Make module-private when no external callers exist (likely never — the symbol is internal-only).

**Next session:**

Phase 3 (T14–T19): Doc tree + workplan I/O. Version-aware path resolution (`docs/<v>/<status>/<slug>/`), markdown-table workplan parser/writer, and `dw-lifecycle setup` subcommand that creates the docs tree and populates PRD/workplan/README from templates.

---

## 2026-04-21: Phases 1–3 in one session

### Feature: deskwork-plugin
### Worktree: deskwork-plugin

**Goal:** Start Phase 1 (plugin skeleton + marketplace registration). The user then pushed through "continue" several times, so the session ended up landing Phases 1, 2, and 3 — skeleton, full adapter layer, and the four lifecycle skills (add, plan, draft, publish).

**Accomplished:**

- Phase 1: `plugins/deskwork/.claude-plugin/plugin.json`, `plugins/deskwork/README.md`, `skills/install/SKILL.md` skeleton, marketplace.json registering the plugin. Plugin validates and loads via `claude --plugin-dir`.
- Phase 2: Adapter layer at `plugins/deskwork/lib/{types,config,paths,frontmatter,calendar,calendar-mutations,scaffold,cli}.ts`. Config schema validates a host project's `.deskwork/config.json`. Calendar parser round-trips the live `audiocontrol.org/docs/editorial-calendar-audiocontrol.md` with no data loss (acceptance criterion verified). Install helper at `bin/deskwork-install.ts` validates config + seeds empty calendars.
- Phase 3: Four lifecycle helpers at `bin/deskwork-{add,plan,draft,publish}.ts` with matching SKILL.md files. Each skill pairs Claude-facing instructions with an argv-parsing bin helper that does the calendar mutation atomically and emits JSON. Blog scaffolder uses the frontmatter module + config (site blogLayout + top-level author).
- 6 commits on `feature/deskwork-plugin`; all ahead of main.
- 100 passing tests (unit + 21 integration tests that spawn the real bin scripts against tmp projects).
- Typecheck clean under TypeScript strict + `exactOptionalPropertyTypes`.
- `claude plugin validate` passes for plugin and marketplace; `claude --plugin-dir` lists all 5 skills (install, add, plan, draft, publish).

**Didn't Work (fixed on first contact with reality):**

- Initial `plugin.json` and `marketplace.json` included a `$schema` key. The Claude plugin validator rejects unknown top-level keys. Removed `$schema`; also moved marketplace `description` under `metadata.description` where the validator expects it.
- First cut of `bin/deskwork-install` used a `#!/usr/bin/env tsx` shebang on an **extensionless** file — tsx refused to treat it as TypeScript and Node choked on the type annotations. Renamed scripts to `deskwork-install.ts` etc. The plugin's `bin/` dir is still added to PATH, so invocation is by full filename.
- Library modules originally used `@/lib/X.ts` imports. That alias works under Vitest (configured in `vitest.config.ts`) and under `tsc` (via `paths` in `tsconfig.json`), but tsx at runtime doesn't resolve it — the `bin/` scripts that import from lib at runtime failed with `Cannot find package '@/lib'`. Switched all lib-internal imports to sibling-relative (`./types.ts`). Tests kept `@/lib/X.ts` for readability since vitest resolves it.
- Round-trip test for the calendar initially failed because `renderCalendar` groups entries by stage order (Ideas → Planned → ... → Published) — my fixture had Published first. Reordered the fixture to canonical stage order; the renderer's ordering is the correct invariant.
- Initial calendar port was 561 lines, over the 500-line file guideline. Split into `calendar.ts` (parse/render/I-O, 408 lines) and `calendar-mutations.ts` (137 lines) along a clean semantic boundary.

**Course Corrections:**

- [DOCUMENTATION] Workplan said "Create .claude-plugin/marketplace.json with **git-subdir** entry for deskwork." The correct pattern for a same-repo plugin is a **relative-path** source under `metadata.pluginRoot: "./plugins"` — `git-subdir` is for pointing at a plugin inside a *different* monorepo. Used relative path and noted the deviation in the workplan rather than following the instruction blindly.
- [COMPLEXITY] Did not split the calendar parser into three files (parse / render / I-O) as I initially considered. The two-file split was enough to satisfy the line-count guideline without inventing abstraction.
- [PROCESS] The `cd` into `plugins/deskwork` for vitest invocation persisted between Bash tool calls and caused a confusing "no such workspace" error later. Got comfortable passing absolute paths instead of relying on cwd.

**Quantitative:**

- Messages: ~7 from user (session-start, "do it", "continue" ×3, "I don't care", session-end)
- Commits: 6 feature commits + this journal commit
- Files created: 27 (lib: 8, bin: 5, test: 9, skills: 5 SKILL.md, plus package.json / tsconfig / vitest config)
- Tests: 0 → 100 passing
- Corrections from user: 0 — user delegated heavily with "continue" and "I don't care"; I flagged scope choices explicitly at each phase boundary and proceeded when approved

**Insights:**

- Running `claude plugin validate` is the fastest feedback loop for schema questions — I was about to WebFetch the docs to disambiguate `$schema` before realizing the validator would reject bad shapes with specific error messages in milliseconds.
- Integration tests that spawn the real `bin/` scripts via `child_process.spawnSync` caught three different classes of bug the unit tests wouldn't have (wrong cwd resolution, JSON output shape, exit codes for user-facing errors vs. bugs). Worth the extra ~7s of test time.
- The `@/` alias vs. runtime tsx tension is a real gotcha for Claude Code plugins that ship executables — documenting this in the workplan so future plugins in the monorepo know upfront.
- Splitting lifecycle work between "adapter in lib/" and "skill helpers in bin/" with a thin shared `cli.ts` kept each helper small (~100 lines) and uniform in shape. The UNIX-style composability claim in the plugin's README isn't just aspirational — the skills legitimately do one thing each.
- Extending the config schema mid-phase (adding `author` and `blogLayout` when the draft helper needed them) was clean because `parseConfig` is the single gatekeeper — add a field, add 4 tests, done.

**Next session:**

Phase 4 (dogfood) is manual validation work the user should drive: install the plugin in `~/work/audiocontrol.org`, run `/deskwork:install` to produce a real config, then add/plan/draft/publish against the live calendar and compare with the old `/editorial-*` skills. No new code until Phase 4 surfaces any gaps.
