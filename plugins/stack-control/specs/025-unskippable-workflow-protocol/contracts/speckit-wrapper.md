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

- A direct invocation of any wrapped skill MUST refuse loud at the point of invocation and
  name its sanctioned front door (FR-012).
- The refusal lives in a skill body / CLI verb that travels with `claude plugin install`
  — never a git hook (FR-013, FR-018).
- Branches on skill identity, never vendor identity (Principle III).

## Interception mechanism

- **Chosen**: an injected **precondition block** at the top of each vendored
  `.claude/skills/speckit-*/SKILL.md`, mirroring the 024 compass-precondition shape — the
  block refuses unless a front-door marker indicates the skill was reached via its
  stack-control front door. Re-applied at `speckit` vendor time (documented vendoring
  step); a missing block is caught by the US5 audit.
- **Fallback**: a shadowing skill of the same name that intercepts and redirects.

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
