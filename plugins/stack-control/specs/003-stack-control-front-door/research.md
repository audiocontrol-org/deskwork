# Phase 0 Research: stack-control front door

All decisions below are derived from the **actual** repository (read during planning), not from an imagined design. Where a question is genuinely unresolved at the program level, it is flagged **CONFIRM IN /speckit-clarify** rather than silently cut (Principle II — capture, don't scope-cut).

---

## R1 — Plugin layout: fat in-tree plugin vs thin shell over `packages/`

**Decision**: Fat plugin under `plugins/stack-control/` with TypeScript shipping **in-tree** (`src/cli.ts` run via `tsx`), mirroring `plugins/dw-lifecycle/`.

**Rationale**: The repo has two live patterns. `deskwork` / `deskwork-studio` are *thin shells* whose `bin/` first-run-installs a published `@deskwork/<pkg>` from npm; their logic lives in `packages/{core,cli,studio}`. `dw-lifecycle` is a *fat plugin*: its logic ships in-tree at `plugins/dw-lifecycle/src/*.ts`, the `bin/dw-lifecycle` shim runs it through `tsx` (npm-installing only the runtime deps `tsx + yaml + zod + ajv + ajv-formats + jscpd`), and its `package.json` is the private workspace package `@deskwork/plugin-dw-lifecycle`. stack-control is the *successor to dw-lifecycle* and shares its skills-over-CLI lifecycle shape, so mirroring dw-lifecycle (not deskwork-studio) gives parity during the absorb-then-retire migration and avoids publishing a separate npm package before the surface stabilizes.

**No npm publish (operator-confirmed 2026-06-05)**: stack-control is NOT published to npm. The only good reasons to publish are (a) offering a reusable *library* third parties `npm i`, or (b) needing a compiled/minified artifact for size / cold-start (e.g. a built web server — `deskwork-studio`'s case). stack-control is neither — it's a dev-tool plugin distributed through the Claude marketplace (git-subdir clone) and run via `tsx`, exactly like `dw-lifecycle`. Publishing would only add release machinery and "packaging is UX" failure modes (404s, version skew, OIDC) for zero benefit. Operator: *"Is there ever a good reason to publish anything to npm?"* — for this plugin, no. This reinforces the fat decision.

**Alternatives considered**:
- *Thin shell over a new `packages/stack-control`*: rejected — forces an npm publish + lockstep version coupling before the front door has proven its shape (violates Principle II), and multiplies migration friction: features 3/4/5 move dw-lifecycle's in-tree code in, which would mean re-packaging on every migration if stack-control were thin.
- *Subdirectory inside `plugins/dw-lifecycle`*: rejected — violates the isolation invariant and the succession rule (stack-control is its own plugin, even though it shares the repo's lockstep version per R4).

---

## R2 — Governance extension rehome: move vs fork

**Decision**: **Physical move** (`git mv`) of `plugins/dw-lifecycle/spec-kit/deskwork-governance/` → `plugins/stack-control/spec-kit/deskwork-governance/`. Update the two references that point at the old path: `scripts/smoke-governance-after-implement.sh` (the `GOVERN=` path) and the `.specify/extensions/deskwork-governance` installed copy (re-installed from the new source).

**Rationale**: Succession rule: "code migrating out of dw-lifecycle moves; it is not forked." The extension is a Spec Kit extension that *calls* `dw-lifecycle` (via `govern.sh` shelling to `dw-lifecycle audit-barrage*` on PATH) — it is **not** part of dw-lifecycle's own runtime. Moving its source tree therefore does not change any `dw-lifecycle` code path (isolation invariant holds — verified by R5). The `extension.yml` `requires.tools: [dw-lifecycle, git]` declaration stays correct: governance still depends on the `dw-lifecycle` CLI for audit-barrage until that capability migrates (a later feature — the cross-plugin seam is intentional and one-way).

**Alternatives considered**:
- *Copy/fork into stack-control, leave the original in dw-lifecycle*: rejected — two divergent copies is exactly the drift the succession rule forbids; also leaves dead governance source in dw-lifecycle.
- *Move the audit-barrage verbs too, now*: rejected — out of scope (audit-barrage migration is a later feature); would enlarge the blast radius and risk the isolation invariant.

---

## R3 — `stackctl` CLI surface for the thin front door

**Decision**: `stackctl` carries only the **deterministic** work the skills delegate to; the agent-work stays in the in-session skills (mirrors dw-lifecycle's skills-over-CLI split). Minimum verb surface for Feature 1:
- `stackctl execute-check --spec <dir>` — validate a Spec Kit spec is in a **runnable** state (spec.md + plan.md + tasks.md present / whatever native `/speckit-implement` requires); exit non-zero with a descriptive error naming what's missing (FR-008). The `execute` skill calls this *before* driving `/speckit-implement`.
- `stackctl spec-check --spec <dir>` — report a spec's authoring state (which Spec Kit artifacts exist), so the `define` / `extend` skills can advance it. (Authoring itself = the operator + in-session agent editing the spec via native Spec Kit; `stackctl` reports state, does not author prose.)
- `stackctl version` / dispatcher scaffolding — mirrors `dw-lifecycle`'s `cli.ts`.

The exact verb names + flags are pinned in [`contracts/stackctl-cli.md`](./contracts/stackctl-cli.md) and are the unit-under-test (RED-first).

**Rationale**: Keeps the front door thin (spec's "minimal scaffolding"). The deterministic checks are exactly the fail-loud gates Principle V demands; putting them in `stackctl` makes them testable in vitest without the agent in the loop.

**Resolved (operator deferred to agent, 2026-06-05 — "I don't know how to answer")**: take the **smallest surface**. Feature 1 adds NO `stackctl` verb beyond the two checks + `version`. Spec *creation/editing* is delegated to native Spec Kit (`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`) driven by the in-session `define` / `extend` skills' agent; `stackctl` only *reads/checks* state. Rationale: this is the minimum that satisfies US1 (execute-check gates native execution) + US2 (spec-check reports state, agent drives native authoring). Widening is cheap and additive if a concrete need appears later — choosing minimal now avoids speculative surface (Principle II).

---

## R4 — Version line + marketplace registration (RESOLVED: shared lockstep)

**Decision (operator, 2026-06-05)**: stack-control **shares the repository's single lockstep version** with every other plugin — it does NOT get its own version line. On standup it joins the repo at the current version (`0.37.0`), is swept by `scripts/bump-version.ts` along with `deskwork` / `deskwork-studio` / `dw-lifecycle`, and is registered in `.claude-plugin/marketplace.json` at that same version. `plugin.json#version` == `package.json#version` == repo version, bumped together.

**Rationale (operator)**: "I want all of the plugins in this repository to share the same version — independent versions are much harder to deal with. Also, the Claude marketplace update operation is monolithic." A single version across the monorepo keeps `marketplace.json` coherent (one `version` + per-plugin `ref` tag), keeps `bump-version.ts` a single atomic sweep, and matches how Claude Code updates the marketplace (all-at-once).

**Supersedes**: the earlier "own version line, separate from dw-lifecycle" framing (constitution v1.1.0 preamble, succession rule §1, spec FR-001/US3). Those are corrected in the same change as this decision (constitution → v1.1.1; succession rule §1; spec FR-001, US3, Key Entities). No release-machinery change is needed — stack-control simply joins the existing lockstep sweep.

**Alternatives considered**:
- *Own version line starting `0.1.0`*: rejected by the operator — independent versions are harder to manage and fight the monolithic marketplace update.

**Note on the isolation invariant**: sharing a version does NOT violate isolation (FR-002/SC-003). A version number is a manifest field, not behavior; dw-lifecycle is already swept to `0.37.0` today, and stack-control joining the same sweep changes no dw-lifecycle code path.

---

## R5 — Isolation invariant: how the standup avoids regressing dw-lifecycle

**Decision**: The standup touches `dw-lifecycle` in exactly one way — **removing** the governance extension source tree from `plugins/dw-lifecycle/spec-kit/` (R2). Nothing in `plugins/dw-lifecycle/src/`, `bin/`, `commands/`, `skills/`, `templates/`, or `package.json` changes. The isolation invariant is **verified**, not assumed: the rehome smoke (`scripts/smoke-governance-after-implement.sh`, repointed) still proves governance fires end-to-end, and a `dw-lifecycle` surface (its existing vitest suite + a representative CLI verb) is exercised post-move to confirm unchanged behavior (SC-003).

**Rationale**: govern.sh depends on `dw-lifecycle` *outbound* (calls its CLI); `dw-lifecycle` has **no inbound dependency** on the governance extension (nothing in dw-lifecycle's src imports or references `spec-kit/deskwork-governance`). Confirmed by planning-time grep: the only references to the governance path are the smoke script and the `.specify/` installed copy. Therefore moving the extension out cannot alter any dw-lifecycle code path.

**Verification task** (lands in tasks.md): grep `plugins/dw-lifecycle/{src,bin,commands,skills}` for any reference to `deskwork-governance` / `spec-kit/` → expect **zero** (proves no inbound coupling); run `npm --workspace @deskwork/plugin-dw-lifecycle test` before and after the move → expect identical pass.

---

## R6 — Execution mechanism: in-session skill drives native `/speckit-implement`

**Decision**: The `execute` skill (FR-006/FR-007) is a Claude Code skill invoked in-session as `/stack-control:execute`. Its body: (1) call `stackctl execute-check --spec <dir>` (fail loud if not runnable), (2) drive native `/speckit-implement` **via the in-session agent** over the spec, (3) the existing `after_implement` hook fires governance automatically — no extra wiring in the skill. No headless shell-out to invoke the agent (the durability constraint, Principle IX's motivation; Edge Case "native execution cannot be invoked headlessly" is resolved exactly here).

**Rationale**: Slice 001 established `/speckit-implement` is an agent-invoked Claude skill, not a script-callable binary. Running the execute touch point *as an in-session skill* means the agent is already present to invoke it — no headless dependency, no context-switch. This is the keystone decision from the 2026-06-05 session (recorded in DEVELOPMENT-NOTES + the spec).

**Alternatives considered**:
- *Headless `stackctl execute` that shells out to a batch CLI to run the agent*: rejected — reintroduces the exact batch/headless-CLI fragility the constitution (Principle IX) and the operator flagged; also a vendor may sunset batch mode.

---

## R7 — Front-door verb naming (operator, 2026-06-05)

**Decision**: the three front-door verbs are **`define`** / **`extend`** / **`execute`**. The vaguer **`curate`** is retired. `execute` is kept. The spec-authoring touch point (FR-005) is realized as two verbs borrowed verbatim from dw-lifecycle's lifecycle vocabulary:
- **`define`** — author a NEW Spec Kit spec for a new feature (drive native `/speckit-specify`).
- **`extend`** — refine the EXISTING spec in place (`/speckit-clarify`, re-plan, re-tasks; reuse the current spec dir).

Both are **spec-authoring verbs only** — infra creation (worktree / docs) is a separate concern, NOT folded in, exactly mirroring dw-lifecycle where `define` ≠ `setup`.

**Rationale (operator)**: "`curate` is a little vague." `define`/`extend` carry precise, already-internalized meaning (new-feature vs in-place, with the new-worktree-vs-reuse-infra connotation) and make the succession legible — **stack-control speaks dw-lifecycle's lifecycle verbs over a Spec Kit substrate**. When dw-lifecycle retires, the verbs carry over unchanged. `execute` is kept because it is the stable, backend-agnostic verb that survives Feature 2: Feature 1 wires it native-only; Feature 2 selects native-vs-parallel backends *beneath* the same verb (Principle IX), so no rename is forced later.

**Knock-on**: the `stackctl` read verb `curate-check` → **`spec-check`** (serves both `define` and `extend`); `execute-check` unchanged.

**Alternatives considered**: keep `curate` (rejected — vague); `author`/`run` (viable but `define`/`extend` reuse existing muscle memory and the new-vs-existing infra split, which a single `author` loses).

---

## Consolidated unknowns status

| Spec NEEDS-CLARIFICATION / open fork | Status |
|---|---|
| Frontend shape (TUI vs web vs skills) | **Resolved** in spec (FR-007: in-session Claude Code skills over `stackctl`). |
| Curation scope | **Resolved** in spec (FR-005: full edit/iterate/review). |
| Native-execution mechanism | **Resolved** (R6: in-session skill drives `/speckit-implement`). |
| `stackctl` minimal verb surface | **Resolved** (R3: two check verbs + `version`; spec authoring delegated to native Spec Kit — operator deferred to agent 2026-06-05). |
| Version line | **Resolved** (R4: shared repo lockstep version — operator 2026-06-05; no own line). |

**All unknowns resolved** (the two previously-open items were settled by the operator on 2026-06-05: shared lockstep version; minimal `stackctl` surface). No blocking unknowns remain for design or tasks.
