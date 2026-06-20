# Quickstart: Front-Door Completeness — Validation Scenarios

**Feature**: `028-front-door-completeness` | **Phase**: 1 | **Plan**: [plan.md](./plan.md)

Runnable validation scenarios that prove the feature end-to-end, each mapped to a
Success Criterion (SC-001..SC-007). These reference the contracts
(`contracts/*.md`) and data-model (`data-model.md`) rather than duplicating them; no
implementation code here. Commands assume the stack-control installation root
(`plugins/stack-control/`) as cwd unless noted, and `stackctl` on PATH via the
plugin bin shim.

**Prerequisites (all scenarios).**
- The plugin built/run via `tsx` (the in-tree dev path).
- `vitest` available (`npm --workspace …` or the plugin test runner).
- For SC-004/005/007: a writable tmp dir and the ability to set cwd outside any installation.

---

## SC-001 — Every verb + sub-action emits `--help` (exit 0)

**Proves.** Discoverability parity (US1); contracts/command-surface.md C1/C2.

**Steps.**
1. Enumerate the 46 verbs (the command-surface descriptor / `cli.ts` `SUBCOMMANDS` keys).
2. For each verb: `stackctl <verb> --help` → assert exit 0 AND a non-empty usage body (description + flags, not a bare verb echo).
3. For each multi-action verb (`backlog`, `roadmap`, `inbox`, `workflow`, …): for each sub-action, `stackctl <verb> <sub> --help` → assert exit 0 + a flag-listing usage body.

**Expected.** 100% exit 0 with usage (today: only `roadmap`/`govern`). A deprecated
verb (`speckit-guard`, `check-editor-symmetry`) emits help noting its alias, not a gap.

---

## SC-002 — Full lifecycle through the front door, zero hand-edits / zero source reads

**Proves.** US1+US2 together; an adopter completes the lifecycle without a forbidden
hand-edit or a source read to find a flag.

**Steps.** Walk a representative lifecycle slice using ONLY `--help` to discover
flags (no source reads) and ONLY verbs to mutate (no governed-file hand-edits):
capture → list → promote → unpromote → done → archive a backlog item, and
add-edge → move-edge → approve-design a roadmap node. (The mechanical drive is
SC-003.)

**Expected.** Every flag discoverable via `<verb> [sub] --help`; every mutation
through a sanctioned verb; **0** hand-edits of `ROADMAP.md` or a backlog task file.

---

## SC-003 — Mechanical lifecycle drive, 0 forbidden hand-edits

**Proves.** US2 operation set; contracts/backlog-verbs.md + contracts/roadmap-verbs.md.

**Steps (backlog, all via verbs).**
1. `stackctl backlog capture "<title>" --type bug --ref EX-1` → capture (assert dedupe on a repeat `--ref EX-1`; assert a very long title does not `ENAMETOOLONG` — B4).
2. `stackctl backlog list` → the item appears (read-only).
3. `stackctl backlog promote <id> --to spec:specs/NNN-slug --apply` → promotion linkage recorded.
4. `stackctl backlog unpromote <id> --apply` → linkage removed (B3).
5. `stackctl backlog done <id> --reason fixed --apply` → terminal disposition (B1).
6. `stackctl backlog archive <id> --apply` → moved out of the live store, still preserved (B2 — assert the record is still readable).

**Steps (roadmap, all via verbs).**
7. `stackctl roadmap add-edge <child> --field part-of --to <parentA> --apply`, then `stackctl roadmap move-edge <child> --field part-of --from <parentA> --to <parentB> --apply` (reparent).
8. `stackctl roadmap order` → revalidates clean (no cycle/dangling — RM1 invariant).
9. `stackctl roadmap reconcile --unorphan <spec> --apply` → orphan resolved into a node (RM2).
10. `stackctl roadmap approve-design <id> --apply` → `design-approved` marker written, NO file edit (RM3); assert `WorkItem.designApproved` reads true.

**Expected.** Every step exits 0 (or dry-run then `--apply`); **0** forbidden hand-edits.

---

## SC-004 — No false refusals in a no-installation context

**Proves.** US3 teeth never over-refuse; contracts/teeth-recovery.md T1.

**Steps.**
1. `cd` to a tmp dir with NO enclosing stack-control installation.
2. Invoke an adopter backend identity through the decision verb:
   `stackctl mediate-check --surface skill --identity speckit-implement --session s1`
   (or feed `bin/intercept` the equivalent PreToolUse payload).

**Expected.** **Permit (exit 0)** — `findInstallation` resolves `null` → short-circuit
permit (Decision 5). **0 false refusals.** A refusal would imply an installation
exists (so `setup` is satisfiable); here none does, so there is nothing to front.

---

## SC-005 — Corrupt marker recovered through one sanctioned verb

**Proves.** US3 recovery; contracts/teeth-recovery.md T3.

**Steps.**
1. In an installation, `stackctl front-door enter --capability spec-execution --session s2` (writes a marker).
2. Corrupt the marker file (`.stack-control/state/front-door/s2.json`) so its JSON/shape is invalid (the wedged state — `readMarker` would throw).
3. `stackctl front-door mediate-list --session s2` → reports `corrupt (unparseable)` (tolerant read; does not throw).
4. `stackctl front-door mediate-recover --session s2` (or `front-door reset --session s2`) → clears the marker.

**Expected.** Step 4 exits 0 and the session is unblocked; a subsequent sanctioned
drive is no longer wedged. **Recovery in a single verb invocation, no YAML hand-edit.**

---

## SC-006 — `check-front-door` clean=0, RED on each injected gap

**Proves.** US4 guardrail; contracts/check-front-door.md C1/C2/C3.

**Steps.**
1. On the complete surface: `stackctl check-front-door` → **exit 0** (all four assertions pass for every registered operation).
2. Inject each regression case and assert non-zero naming the gap:
   - **Deleted skill:** remove a `skills/<name>/SKILL.md` a registered op requires → exit ≠ 0 naming the missing skill (C2a).
   - **Broken `--help`:** make a verb's `--help` exit non-zero / emit no usage → exit ≠ 0 naming the verb (C2b).
   - **Unfronted mutating verb:** add a new mutating verb with no skill + no mediation registration → exit ≠ 0 naming it (C2c/C2d).

**Expected.** Clean run exits 0; each injected gap exits non-zero with the specific
gap named (each proven by a RED test, FR-033).

---

## SC-007 — Interceptor provably loaded and firing

**Proves.** US4 teeth never silently inert; contracts/teeth-recovery.md T7.

**Steps.**
1. Run `scripts/smoke-interceptor-loaded.sh` (local; not CI):
   - Assert `hooks/hooks.json` declares the `PreToolUse` `Bash` + `Skill` matchers → `${CLAUDE_PLUGIN_ROOT}/bin/intercept`, and the plugin manifest auto-discovers it (registration).
   - Feed `bin/intercept` a synthetic PreToolUse payload for a fronted backend with no marker → assert it emits the `deny` `hookSpecificOutput` (firing); feed a non-backend payload → assert permit.

**Expected.** Smoke exits 0 only when both registration AND firing hold. A
present-but-misrouted hook fails the firing assertion.

---

## Coverage map

| SC | Scenario | Contracts |
|---|---|---|
| SC-001 | every verb + sub-action `--help` exit 0 | command-surface C1/C2 |
| SC-002 | lifecycle, 0 hand-edits / 0 source reads | command-surface, backlog-verbs, roadmap-verbs |
| SC-003 | mechanical capture→…→archive + reparent + approve-design | backlog-verbs, roadmap-verbs |
| SC-004 | no-installation: 0 false refusals | teeth-recovery T1 |
| SC-005 | corrupt marker recovered in one verb | teeth-recovery T3 |
| SC-006 | check-front-door clean=0; RED on 3 gaps | check-front-door C1/C2/C3 |
| SC-007 | interceptor loaded + firing smoke | teeth-recovery T7 |

---

## Validation results (Phase 7, T119)

Verified 2026-06-20 on `feature/stack-control`:

- **SC-001** — `help-full-surface.test.ts` GREEN: every live verb + sub-action emits `--help` exit 0 with a usage body; `check-front-door` C2b passes for all 62 fronted operations.
- **SC-002 / SC-003** — lifecycle drives through the verbs (backlog capture→done→archive, unpromote; roadmap edge mutations + approve-design + reconcile --unorphan) with 0 forbidden hand-edits; covered by the backlog/roadmap subcommand + terminal-closure suites.
- **SC-004** — `mediate-check-no-installation-permit.test.ts` GREEN: no false refusals with no installation.
- **SC-005** — `marker-recovery-primitives.test.ts` + `front-door-recovery.test.ts` GREEN: a corrupt marker recovers through one `front-door mediate-recover` invocation.
- **SC-006** — `stackctl check-front-door` exits 0 on the complete surface (62 ops, all four assertions); `check-front-door-regression-cases.test.ts` proves it goes RED on each injected gap (deleted skill, broken --help, unfronted mutating verb).
- **SC-007** — `scripts/smoke-interceptor-loaded.sh` PASS: the PreToolUse hook is registered (plugin.json → hooks/hooks.json) and fires deny on a fronted-no-marker payload, permit on a non-backend payload.

`scripts/smoke-front-door.sh` → PASS (exit 0). Full suite: 2273 tests GREEN. No gaps found.
