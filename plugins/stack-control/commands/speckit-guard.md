---
description: "Refuse a direct backend speckit invocation and redirect to the sanctioned stack-control front door (025 US4, cross-vendor)"
---

A direct invocation of a backend Spec Kit skill (`/speckit-specify`, `/speckit-plan`,
`/speckit-tasks`, `/speckit-implement`) is **not** the sanctioned path. Run the portable
guard to get the correct redirect:

```bash
stackctl speckit-guard <skill-name>
```

- Exit `1` (refused) → it names the sanctioned front door: authoring
  (`specify`/`plan`/`tasks`) → `/stack-control:define` or `/stack-control:extend`;
  `implement` → `/stack-control:execute`. Use that front door instead — it drives the
  backend in order, holds the gates, and runs per-phase governance.
- Exit `0` → reached via its front door (the `STACKCTL_FRONT_DOOR` marker is set) or not a
  wrapped skill — permitted.

Invoke the CLI as bare `stackctl` (on `PATH` in a plugin install), never the source-repo
`plugins/stack-control/bin/stackctl` form (GitHub #480).

> **Scope (025, operator decision 2026-06-16):** the refusal lives in `stackctl` + this
> cross-vendor adapter; it does NOT patch the adopter's own backend speckit skills (those
> are the adopter's Spec Kit, not plugin-controlled) and uses no Claude-only `.claude/skills`
> path. The real defense-in-depth is the **US1 per-phase graduate gate** — an evaded raw
> backend path cannot graduate without per-phase checkpoints (FR-014). A cross-vendor
> point-of-invocation interception of a *raw* call is the filed follow-on
> `design:gap/speckit-bypass-point-of-invocation-refusal`.
