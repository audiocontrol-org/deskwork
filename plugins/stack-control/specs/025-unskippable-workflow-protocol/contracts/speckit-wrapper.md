# Contract: Speckit wrapper + no-shortcuts invariant (US4 / US5)

Covers FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018.

## Wrapped backend skills + redirect map (US4)

| Direct invocation (refused) | Sanctioned front door (redirect) |
|---|---|
| `/speckit-specify` | `/stack-control:define` (or `:extend`) |
| `/speckit-plan` | `/stack-control:define` (or `:extend`) |
| `/speckit-tasks` | `/stack-control:define` (or `:extend`) |
| `/speckit-implement` | `/stack-control:execute` |

## Refusal behavior

- stack-control MUST map a direct invocation of any wrapped skill to its sanctioned front
  door and emit a loud redirect (FR-012).
- The refusal/redirect lives in a portable `stackctl` verb + the plugin's cross-vendor
  command/skill adapters that travel with `claude plugin install` and surface identically
  under Codex — never a git hook, never a Claude-only `.claude/skills/` patch (FR-013, FR-018).
- Branches on skill identity, never vendor identity (Principle III).

## Interception mechanism (CORRECTED 2026-06-16 — operator decision)

The original "inject a precondition block into each vendored `.claude/skills/speckit-*/SKILL.md`"
mechanism is **invalid**: the backend speckit skills are the **adopter's own Spec Kit**
install (not shipped/controlled by this plugin — GitHub #480), and `.claude/skills/` is a
**Claude-only** path (the plugin is cross-vendor — specs/017-portability Decision 1: `stackctl`
authoritative, hosts thin adapters).

- **Chosen (025 scope)**: the refusal/redirect is a **portable `stackctl` verb** (a pure
  skill-identity → front-door map in `src/speckit-wrapper/refusal.ts`) exposed through the
  plugin's own cross-vendor `commands/*.md` (and `skills/*/SKILL.md`) adapters. The plugin
  patches nothing it does not ship. The **US1 per-phase graduate gate is the real teeth**
  (defense-in-depth): a raw backend-speckit path cannot graduate without per-phase checkpoints,
  on any host.
- **Follow-on (filed, NOT 025 scope)**: a cross-vendor **point-of-invocation** interception of
  a *raw* backend call (shadowing adapters that refuse before any work runs, on every host) is
  the roadmap item `design:gap/speckit-bypass-point-of-invocation-refusal`, to be re-specced via
  `/stack-control:design`.

## Defense-in-depth (FR-014) + honest boundary (FR-017)

- Even if the wrapper is evaded (e.g. running the raw vendored script), the per-phase
  graduate gate (`contracts/graduate-gate.md`) means the feature **cannot graduate**
  without per-phase checkpoints.
- The mechanism binds an agent following the skills. It does NOT claim to stop a
  deliberate human bypass via raw `git`/`gh`/`speckit` (mirrors 024 FR-014).

## No-shortcuts invariant (US5)

- Every stack-control `skills/*/SKILL.md` body MUST contain zero skip/defer/shortcut
  affordances (FR-015). Operator-facing branches are operator-initiated scope decisions
  only; any protocol override is a recorded operator override, never an agent-presented
  menu item (FR-016).
- **Audit**: a doctor-style phrase audit over skill bodies (the enforceable surface — the
  prompt text cannot be runtime-gated) so a regression is caught.

## Test obligations (RED-first)

- T: direct `/speckit-implement` → refused, redirects to `/stack-control:execute` (SC-004).
- T: direct `/speckit-specify`|`/speckit-plan`|`/speckit-tasks` → refused, redirects to
  define/extend (SC-004).
- T: front-door invocation (via execute / define) → NOT refused (no false positive).
- T: evaded raw implement → cannot graduate (FR-014; cross-refs graduate-gate tests).
- T: skill-body audit finds zero skip/defer/shortcut affordances across all stack-control
  skills (SC-005).
