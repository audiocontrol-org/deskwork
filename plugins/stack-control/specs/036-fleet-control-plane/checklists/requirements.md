# Specification Quality Checklist: Fleet Control Plane

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-16
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.

### Validation notes (iteration 1)

**On "no implementation details".** This spec names some concrete technical choices — server-sent events, HTTP POST, a Unix-socket-versus-TCP question, an object-path layout. These are **not** leaked implementation detail: they are *settled architectural decisions* carried forward verbatim from the approved design record (`design-approved: yes` on the roadmap node), where each was chosen against recorded rejected alternatives. Re-deriving or generalizing them here would discard approved decisions. Vendor identities from the design record (B2, Cloudflare) are deliberately generalized in Success Criteria to "capped durable store" / "content-delivery layer" so the criteria stay technology-agnostic and verifiable without naming a vendor.

**On "scope is clearly bounded".** Bounded by an **operator-driven scoping pass**, never by agent-inserted cuts. Per Constitution Principle II and `.claude/rules/agent-discipline.md` § *Capture mode vs scope mode*, the spec was first written in capture mode — everything known or knowably-implied, no "YAGNI" / "deferred" / "not in v1" language inserted by the agent. The operator then ran the separate scoping pass (2026-07-16), cutting the browser dashboard: *"I don't want to build the dashboard UI in this scope of work — I want to get the plumbing right before trying to slap a frontend on it."* That cut is recorded in the spec's *Scope boundary* section and tracked as the roadmap item `design:feature/fleet-dashboard`, which `depends-on` this feature — so it is recorded, not lost, and the design work is kept rather than stripped. The design record's ~20 open questions remain carried forward in full as **Plan-Time Contracts** (PT-001…PT-014) — deferred to plan time *by design decision*, to be pinned by RED tests, never dropped. Story priorities P1–P6 denote task ordering within ONE delivery, not shippable slices; stated explicitly in the spec because the template's default reading (each story an independent MVP) contradicts the project's no-partial-delivery rule.

**On the plane's API surviving the dashboard cut.** The plane's client API (FR-080…FR-087) stays in scope while the dashboard leaves. This is not a speculative abstraction under Principle II ("abstractions MUST be derived from real, concrete instances — never designed from a single imagined provider") because the feature is **dogfooded as it is built**: the sidecar and plane are run and driven with the same API requests a dashboard would make, in a tight feedback loop (operator decision 2026-07-16). The API therefore has one real consumer flowing through it now, and the dashboard becomes its second later — the order the principle requires. FR-087 and SC-018 make that exercisability a requirement rather than a testing note, so no state can be reachable only through a UI that does not exist yet.

**One requirement changed meaning under the cut, deliberately.** FR-030 previously read "the dashboard MUST derive one summary status for display" (the design record's wording). With the dashboard out of scope that requirement would have been silently orphaned. It is restated as the invariant this feature actually owns: the plane exposes the three axes (connection / liveness / execution) separately and never collapses them; deriving a summary *for display* is a client concern belonging to `design:feature/fleet-dashboard`. The design record's underlying intent — no single enum carries three meanings — is preserved.

**On the design record's one open scope question — resolved 2026-07-16.** The design record left one item to the operator: the scope boundary against the `multi:feature/control-plane-frontend` roadmap item, whose "engine-run surfaces" overlapped this design's dashboard. Operator decision: **that node is removed** (`stackctl roadmap remove-node multi:feature/control-plane-frontend --apply`) — it dated to 2026-06-07, predated this design, and per the operator is "a much weaker idea than what we've designed now." Nothing depended on it. The boundary question therefore dissolves rather than being negotiated: the dashboard (FR-080…FR-086) is unambiguously this feature's, and no requirement here is qualified by that item. This spec carries no [NEEDS CLARIFICATION] markers.

Note for triage (not this spec's scope): removing the node orphaned the **provisional home** of a still-captured `DESIGN-INBOX.md` entry — the read-only "visualize the stores" web app (surfaced 2026-06-08). That idea is genuinely NOT covered by this feature (read-only browsing of roadmap/inbox/specs/audit logs, explicitly no CRUD — not a fleet-run surface), so it survives the removal on its own merits and awaits triage with a dangling home pointer. Two shipped specs (`007-insight-capture`, `010-migrate-scope-discovery`) also deferred UI surfaces to the removed node; those are historical records of decisions made at the time and are deliberately left unedited rather than retroactively rewritten.
