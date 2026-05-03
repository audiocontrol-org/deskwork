# dw-lifecycle Post-Remediation Audit

**Date:** 2026-05-03  
**Audited feature:** `dw-lifecycle`  
**Audited against:** `design.md`, the shipped `plugins/dw-lifecycle` implementation, and the reopened follow-up arc in `workplan.md`

## Executive summary

`dw-lifecycle` now **substantially comports** with its PRD/design for the reopened remediation arc.

The major design-alignment gaps called out in the earlier 2026-05-03 audit have been closed:

1. peer-plugin detection is now real,
2. install behavior now probes and previews instead of blindly writing defaults,
3. setup is now PRD-first and writes `deskwork.id`,
4. version retargeting is implemented as a real cross-version move,
5. published session defaults now have an explicit override seam instead of being unavoidably deskwork-coupled.

This reopened arc can return to feature-complete state. The remaining issues are narrower hardening or portability follow-up items, not blockers against the feature's stated remediation goal.

## Audit method

Reviewed:

- [design.md](./design.md)
- [README.md](./README.md)
- [workplan.md](./workplan.md)
- `plugins/dw-lifecycle/src/**/*.ts`
- `plugins/dw-lifecycle/skills/*/SKILL.md`
- `plugins/dw-lifecycle/src/__tests__/*.test.ts`

Also ran:

```bash
npm test --workspace plugins/dw-lifecycle
```

Current result in this environment:

- 12 test files passed
- 1 test file failed
- 74 tests passed
- 5 tests failed

All remaining failures are in `src/__tests__/cli.test.ts`, and all five are caused by `tsx` failing to create its IPC pipe in this sandbox (`listen EPERM ... /tsx-501/*.pipe`). The remediation work covered by Tasks 47-51 is otherwise represented by passing unit and smoke coverage.

## Gap closure against the prior audit

### 1. Peer-plugin detection

**Prior finding:** `doctor` hardcoded peer absence and could not enforce the required/recommended contract.

**Current state:** closed.

- `src/subcommands/doctor.ts` now reads the real Claude installed-plugin registry and checks install-path existence.
- `src/__tests__/doctor.test.ts` covers required-only and both-peer cases using registry-shaped fixtures.

This closes the false-negative class tracked in [#121](https://github.com/audiocontrol-org/deskwork/issues/121).

### 2. Install/bootstrap fidelity

**Prior finding:** `install` always wrote `defaultConfig()` and diverged from the documented probe-confirm-write flow.

**Current state:** closed.

- `src/subcommands/install.ts` now requires a real git repo, probes host doc-version shape, seeds `knownVersions`, supports `--dry-run`, and rejects unknown flags.
- `skills/install/SKILL.md` now matches the helper behavior instead of promising a stronger flow than the code provides.

The portability story at install time is now materially closer to the design.

### 3. PRD-first setup and `deskwork.id`

**Prior finding:** setup treated the workplan as the definition sink and never wrote a PRD UUID.

**Current state:** closed.

- `src/subcommands/setup.ts` now writes `deskwork.id` into PRD frontmatter.
- Feature-definition imports now seed `prd.md` first, with `workplan.md` generated as a derivative artifact.
- `src/__tests__/setup.smoke.test.ts` verifies both the UUID and PRD-first behavior.

This aligns the implementation with the designed document hierarchy.

### 4. Real version retargeting

**Prior finding:** the skill surface claimed cross-version retargeting that the helper layer did not actually implement.

**Current state:** closed.

- `src/transitions.ts` now supports real source-to-destination version retargeting.
- `src/subcommands/transition.ts` accepts `--from-target`.
- Retarget moves also update `targetVersion` frontmatter in the moved feature docs.

The skill surface and helper layer now match on this capability.

### 5. Deskwork-coupled defaults

**Prior finding:** session-start/session-end defaults were too strongly deskwork-shaped for the portability claim.

**Current state:** partially closed, to the extent scoped by the reopened arc.

- The plugin now ships a generic `templates/journal-entry.md`.
- Projects can override it via `.dw-lifecycle/templates/journal-entry.md`.
- The session skills and docs now route through that explicit override seam.

This does not solve broader feature-doc layout portability, but it does remove the most immediate "published default is unavoidably deskwork-specific" problem. The broader template/layout work remains appropriately deferred under [#123](https://github.com/audiocontrol-org/deskwork/issues/123).

## Residual risks and follow-ups

These remain real, but they are narrower than the reopened remediation arc:

1. `targetVersion` is still not validated at the CLI boundary the way `slug` is.
2. `branchExists` still checks local refs only; a remote-only collision can still slip through.
3. `TEMPLATES_DIR` resolution currently assumes the tsx runtime layout and would need adjustment if a `dist/` build becomes authoritative.
4. Full-suite green status is still blocked in this sandbox by `tsx` IPC behavior in `cli.test.ts`.
5. Broader feature-doc template/file-layout portability is still deferred under [#123](https://github.com/audiocontrol-org/deskwork/issues/123).

## Conclusion

The reopened arc has achieved its intended outcome: `dw-lifecycle` is no longer a PRD-divergent prototype on the audited points that mattered most.

Recommendation: mark Phase 7, Phase 8, and Phase 9 complete; return the feature to `003-COMPLETE` on the next closeout pass; keep [#123](https://github.com/audiocontrol-org/deskwork/issues/123) as backlog rather than holding this feature open for it.
