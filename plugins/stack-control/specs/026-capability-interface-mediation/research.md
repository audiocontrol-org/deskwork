# Phase 0 Research: Capability-interface mediation

**Feature**: 026-capability-interface-mediation · **Date**: 2026-06-17

Resolves the spec's open questions that are plan-phase-resolvable, and grounds every design choice in real existing instances (Constitution Principle II — Integration-First). Source instances were read live in this repo; the Claude Code hook contract was researched against current docs.

## Grounding instances (real code this design derives from)

| Instance | Location | What it gives us |
|---|---|---|
| 025 US4 refusal map | `src/speckit-wrapper/refusal.ts` | Precise skill-identity membership (`WRAPPED_SKILLS`), `frontDoorsFor()`, `STACKCTL_FRONT_DOOR` marker constant, `evaluateRefusal()` |
| 025 US4 guard verb | `src/subcommands/speckit-guard.ts` | The verb shape the vendor adapters call; exit-code contract (0 permit / 1 refuse / 2 usage); current **env-var** marker check (`process.env[…] === '1'`) |
| Single-source pattern | `src/workflow/house-rules.ts` | ONE declarative block → multiple consumers (`renderHouseRules` + `designGateCriteria`) — the precedent the capability registry mirrors |
| Backstop gate | `src/workflow/gate-eval.ts` (`all-phase-checkpoints-current`) + `src/govern/compose-convergence.ts` | The 025 US1 graduate gate to generalize for Approach C |
| CLI dispatch | `src/cli.ts` (`SUBCOMMANDS` record) | How a new verb registers; strict per-verb flag parsing; exit 0/1/2 |
| Tests | `src/__tests__/<module>/*.test.ts` (vitest) | Test layout; `wrapper-refusal.test.ts` is the direct precedent |

**Key fact from grounding**: `STACKCTL_FRONT_DOOR` exists today as an **env var** that `speckit-guard` reads, and **no front-door skill currently sets it** — setting the marker is net-new. So migrating the marker to a file (D1) touches a marker that has no production writer yet: low blast radius.

## Decisions

### D1 — Front-door marker propagates via a file on disk (resolves spec FR-014 / Open Q1)

- **Decision**: The marker is a file under the installation's state dir, keyed by the hook-visible `session_id`, e.g. `<installation>/.stack-control/state/front-door/<session_id>.json`, whose contents name the capability being driven plus a timestamp/pid for staleness. A capability-interface skill writes it before driving the backend and removes it after; the interceptor reads it.
- **Rationale**: Claude Code hook docs confirm a PreToolUse hook reliably reads files written earlier in the session, but env vars set in one tool invocation are **not** reliably visible to a later hook ("variables modified within a tool's execution are not visible to the next hook unless explicitly exported/persisted"). A file is also vendor-portable (a hook reading a file behaves identically on Claude and Codex). The hook receives `session_id` and `cwd` on stdin, so it can resolve the installation and the session-keyed marker.
- **Migration**: `speckit-guard`'s env-var check moves to read the marker file (single mechanism; the env path is retired or kept only as a defense-in-depth secondary, operator's call at impl).
- **Lifecycle (FR-014a)**: staleness bounded by an embedded timestamp (a marker older than a session is ignored); session-keying prevents cross-session leakage; nested/concurrent front-door entries are capability-scoped entries (a set of active capabilities, not a single boolean) so one teardown cannot clear another's live marker.
- **Alternatives rejected**: (a) **env var** — unreliable cross-invocation propagation, the named feasibility risk; (b) **OS-tmp session file** — works but is not installation-anchored, violating the Constitution installation-anchor invariant and harder to reason about; the installation-anchored, session-keyed file gets both properties.

### D2 — One interceptor, two matchers: `Bash` (CLI surfaces) + `Skill` (skill surfaces) (resolves spec FR-001)

- **Decision**: The Claude adapter is a plugin-shipped PreToolUse hook (`hooks/hooks.json`) registered for **both** the `Bash` and `Skill` tools. On a `Bash` call it inspects `tool_input.command`; on a `Skill` call it inspects the skill name. Both call the same `stackctl` decision verb.
- **Rationale**: The v1 capabilities split across surfaces — `backlog` is a Bash CLI; `spec-definition`/`spec-execution` are `/speckit-*` **skills**. Hook research confirms PreToolUse fires for the `Skill` tool (matchable `"matcher": "Skill"`) AND for `Bash`. So a single interceptor with two matchers covers all three v1 capabilities uniformly — directly implementing the "all fronted-backend calls" rule.
- **Alternatives rejected**: **Approach A shadow-skills** for the `/speckit-*` surface — the design record retained it only "for surfaces the interceptor cannot observe." Research shows the skill surface IS observable via the `Skill` matcher, so shadow-skills (which depend on unproven plugin-shadows-adopter-skill precedence) are **unnecessary** and not adopted. Approach A is formally closed as "no un-observable surface identified at v1" (resolves Open Q4), retained on paper only if the D3 spike falsifies skill-name visibility.

### D3 — The `Skill` `tool_input` field name is undocumented → a throwaway Phase-0 spike confirms it (Principle I)

- **Decision**: The exact field in the `Skill` tool's `tool_input` that carries the skill name is **not documented**. The first implementation step is a **throwaway spike**: a minimal PreToolUse hook matching `Skill` that logs its stdin payload, triggered by invoking a skill, to capture the real field shape. Per Constitution Principle I, the spike is discarded and the interceptor is rebuilt test-first against the confirmed shape.
- **Rationale**: This is the one residual feasibility unknown for D2. It is a shape-discovery question (empirical), not a design fork — so it is a spike, not an operator decision. Claude Code permission syntax already exposes `Skill(name *)` filters, strong evidence the name is available; the spike confirms the exact JSON path the hook receives.
- **Risk if falsified**: if the skill name is genuinely not in the payload, the skill surfaces become un-observable and D2 falls back to Approach A (shadow-skills) or Approach C (backstop-only) for `spec-*`. This is the contingency that keeps Approach A on paper. The spike de-risks this before any interceptor code is written.

#### D3 spike result (T002 — 2026-06-18)

**Docs-derived (NOT yet live-verified — the live gate is a T015/T018 acceptance check): the skill name IS in the PreToolUse payload.**

> Provenance: every claim below is from the official Claude Code hooks documentation, NOT an empirical capture (the live probe was harness-blocked, see Method). Treat the field shape and matcher behavior as a **docs-derived assumption** until the T015/T018 live-firing check confirms it; do not build a downstream branch that assumes more than docs establish.

- **Field**: `tool_input.skill_name` (exact) carries the skill name; `tool_input.skill_arguments` carries the args. Top-level payload fields: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`. So the interceptor resolves the installation from `cwd`, the session from `session_id`, and the invoked identity from `tool_input.skill_name`.
- **Deny contract**: a PreToolUse hook denies by printing `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "<msg>"}}` to stdout and exiting 0. The documented `permissionDecision` values are `allow|deny|ask` (T015's adapter emits only `deny` — the one value certainly valid; do NOT wire any other branch without re-confirming the live enum against https://code.claude.com/docs/en/hooks.md). T015's adapter maps a `mediate-check` refuse → this shape with the registry-sourced redirect as the reason.
- **Refinement to D2 (matcher mechanism)**: a generic `"matcher": "Skill"` does **not** match skill invocations — the Skill matcher matches by the specific skill name (exact or regex). So T015 registers the Skill matcher as an enumeration/regex over the registry's skill identity set (e.g. `^speckit-(specify|clarify|plan|checklist|tasks|analyze|implement)$`), not a catch-all. This is *more* precise (the hook only fires on fronted backend skills, so no skill-surface pre-filter is needed) and leaves the decision core unchanged. D2's load-bearing conclusion (skill surface observable → no shadow-skills) holds; only the `hooks.json` matcher syntax is refined.
  - **FR-011 single-source guard (audit claude-04)**: the `hooks.json` Skill matcher MUST be **generated/derived from `CAPABILITY_REGISTRY`'s skill identity set**, NOT hand-maintained as a parallel list. A hand-copied regex would drift: adding a skill backend to the registry would silently leave the hook unable to observe it (mediation off for that skill) while the registry consistency test still passes. T015 therefore generates the matcher from the registry (a build/generation step or a startup-derived matcher), so "add a backend = one registry entry" (FR-011) holds for skill backends too — the hook can never refuse a set different from what discovery lists. (The Bash matcher stays the static `"Bash"` tool-name; only identity resolution is registry-driven there.)
  - **T015 acceptance check (audit claude-05) — the divergent claim gets a gate**: the matcher refinement is the one D3 conclusion that diverges from D2 and is confirmed only by docs (the live capture was harness-blocked). So T015/T018 MUST carry an explicit acceptance check — *the registered hook actually fires and DENIES on a real fronted-skill invocation* (e.g. a raw `speckit-implement` is blocked end-to-end in a live session) — not just prose. If the docs reading is wrong, the generated matcher would silently never fire (mediation off for every fronted skill) while every unit test still passes; this live gate is what catches that.
- **Method + honest boundary**: confirmed against the official Claude Code hooks documentation (https://code.claude.com/docs/en/hooks.md). The empirical live-hook capture (register a probe hook, invoke a skill, read the stdin payload) was **blocked by the harness's self-modification guard** (writing a PreToolUse hook into the agent's own `settings.local.json` is refused without operator consent). The matcher behavior — the one finding that diverges from D2 — gets live confirmation at T015/T018 integration against the real interceptor, where the registered hook actually fires. No throwaway probe survived (none could be registered); nothing to delete.

### D4 — Identity matching: normalized `argv[0]` for CLIs; exact skill-name membership for skills (resolves spec FR-005 / Open Q6)

- **Decision**: For `Bash`, resolve `tool_input.command`'s `argv[0]` to a normalized executable identity (tokenize → first word → basename → strip known wrappers like `env`/`sudo` → PATH/alias-agnostic name) and test membership in the registry's CLI identity set; occurrences of a backend's name in paths/args/comments do not match. For `Skill`, test exact membership of the skill name in the registry's skill identity set.
- **Rationale**: Mirrors the existing `isWrappedSkill()` precise-membership approach (no substring); `argv[0]` normalization is the standard robust answer for the CLI surface. Reuses the codebase's established precision discipline.
- **Alternatives rejected**: literal first-token match (false positives on wrappers/aliases); per-backend regex authored in the registry (pushes correctness onto registry authors; only adopt if a backend needs it).

### D5 — Capability registry: one declarative TS module, three consumers (resolves spec FR-009/010/011/012)

- **Decision**: A single declarative source `src/capability/registry.ts` (mirroring `house-rules.ts`). Each entry: `{ id, interface (front-door skill), backendIdentities: { skills: string[], cliArgv0: string[] }, policies, redirect }`. Consumers: (1) the decision verb, (2) redirect-message rendering, (3) agent-facing discovery. It generalizes `refusal.ts`'s `WRAPPED_SKILLS` + `frontDoorsFor()` into data.
- **v1 entries** (resolves spec FR-017 / Open Q3):
  - `backlog` → interface `/stack-control:backlog`; backend `{ cliArgv0: ['backlog'] }`.
  - `spec-definition` → interface `/stack-control:define`, `/stack-control:extend`; backend `{ skills: ['speckit-specify','speckit-clarify','speckit-plan','speckit-checklist','speckit-tasks','speckit-analyze'] }`.
  - `spec-execution` → interface `/stack-control:execute`; backend `{ skills: ['speckit-implement'] }`.
  - scope-discovery / audit-barrage / roadmap are **excluded** at v1 (operator tools); addable later as entries with zero interceptor code change.
- **Rationale**: single-source = the interceptor can never refuse something discovery didn't list, and vice-versa (the house-rules non-drift property). Adding a backend = a registry entry (FR-011).

### D6 — Backstop (Approach C): generalize the per-phase graduate gate + add a reconciler (resolves spec FR-015/016)

- **Decision**: Reuse the `all-phase-checkpoints-current` gate (already enforces "speckit-implement work that wasn't governed can't graduate") and generalize the concept per capability; add a `stackctl` reconciler verb that flags un-governed backend state for operator attention.
- **Rationale**: defense-in-depth for the D3-falsified contingency and for any vendor (Codex) whose hook can't observe a surface. Reuses `gate-eval.ts` / `compose-convergence.ts` rather than inventing a new gate.

### D7 — Decision logic in one `stackctl` verb both adapters call (resolves spec FR-006/007/008)

- **Decision**: Generalize `speckit-guard` into a capability-mediation decision verb (working name `mediate-check`) that takes the intercepted surface (tool kind + identity) and the resolved installation/session, consults the registry + the marker file, and returns permit/refuse/usage via exit 0/1/2 with a registry-sourced redirect message. The Claude adapter (`hooks/hooks.json` → a `tsx` script) maps the verb result to PreToolUse `permissionDecision: "deny"` + `permissionDecisionReason`; the Codex adapter calls the same verb.
- **Rationale**: keeps all decision logic vendor-neutral in `stackctl` (Principle III); the adapters are thin. Exit-code contract inherited from `speckit-guard`.
- **Latency constraint**: the hook fires on every `Bash`/`Skill` call, so the adapter does a cheap local pre-filter (identity obviously not in any registry set → permit without spawning) and only invokes the verb on a plausible match. Captured as a non-functional constraint in plan Technical Context.

### D8 — Codex parity is Bash-only at v1 (spec Open Q2 — remains OPEN/sequenced, not resolved here)

- **Finding**: Codex's PreToolUse equivalent intercepts **Bash only** (no Skill/Write/Edit coverage) and has a less-defined block schema. So on Codex, v1 can intercept the `backlog` CLI capability but not the `/speckit-*` skill surfaces; those rely on the D6 backstop under Codex.
- **Disposition**: matches the spec's sequencing (US4 = cross-vendor, after the Claude path proves the model). Remains an OPEN research item for the Codex adapter's implementation; the portable core (one `stackctl` verb) is built now so the Codex adapter is thin when added.

## Open questions carried forward (not plan-resolvable)

- **Open Q2 (Codex mechanism)** — sequenced to the US4 Codex-adapter work (D8); needs Codex hook research at that point.
- **Open Q5 (provider/plan-source port)** — deferred per the succession rule; unchanged by this feature. When un-deferred, the provider port becomes another capability adapter under this umbrella.

## Inputs to Phase 1

Entities for `data-model.md`: Capability, CapabilityRegistry entry, BackendIdentity set, FrontDoorMarker (file), MediationDecision, InterceptedInvocation. Contracts for `contracts/`: the `mediate-check` verb CLI contract, the marker writer/clearer verb contract, the reconciler verb contract, the PreToolUse hook I/O mapping, and the registry schema. Quickstart: the end-to-end refuse/permit walkthrough an operator can run.
