## Feature: studio-bridge

A control channel between the deskwork-studio web UI and the operator's locally-running Claude Code session, so operator commands (skill invocations, git operations, prescribed actions) can be dispatched from a phone or iPad without resorting to a terminal. Implemented as a single-process consolidation: studio gains a loopback-only MCP endpoint alongside its existing HTTP routes, plus a chat panel in the web UI.

**Status:** Exploratory. This feature lives on its own branch (`feature/studio-bridge`) and worktree (`~/work/deskwork-work/studio-bridge/`). Not folded into the deskwork plugins until Phase 8 validates that the bridge works in real use.

### Documents

| File | Purpose |
|---|---|
| [`design.md`](./design.md) | Full architecture, components, data flow, error handling, testing strategy. The brainstorming-converged design spec; read first. |
| [`prd.md`](./prd.md) | Product framing: problem, solution, acceptance criteria, scope, risks, success criteria for the experiment. |
| [`workplan.md`](./workplan.md) | 8-phase implementation breakdown with tasks + acceptance criteria. |

### Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Server-side bridge primitives (queue, persistence, types) | Not started |
| 2 | HTTP routes (`/api/chat/*`) | Not started |
| 3 | MCP server endpoint + loopback guard | Not started |
| 4 | Studio chat panel UI (docked + full-page) | Not started |
| 5 | Affordance routing helper + decision-strip integration | Not started |
| 6 | `/deskwork:listen` skill + SessionStart hook + config schema | Not started |
| 7 | Documentation + adopter wiring (MCP client config example) | Not started |
| 8 | Local end-to-end smoke (validation gate) | Not started |

### Worktree

```
~/work/deskwork-work/studio-bridge/   # feature/studio-bridge branch
```

### Branch lifecycle

- **If Phase 8 succeeds:** integration PR to mainline that folds the bridge into `@deskwork/studio` + `plugins/deskwork-studio` + `plugins/deskwork`, ships in the next deskwork release.
- **If Phase 8 fails:** branch is preserved for reference. Document the failure mode in this README + DEVELOPMENT-NOTES.md. Explore an alternative design (file-watch IPC fallback, or revisit the agent-host model from the brainstorming session).

### Key Links

- Brainstorming session: archived in the conversation that produced [`design.md`](./design.md) (commit `ff6dc1b` originally on `feature/deskwork-plugin`, moved here on branch creation).
- Motivating use case: `writingcontrol.org` editorial collection (creative literary writing on phone/iPad).
- THESIS alignment: see `THESIS.md` at repo root; this design is consistent with all three consequences (see PRD § "Architectural alignment" in [`design.md`](./design.md)).

### Not yet decided

- Whether `/deskwork:stop-listening` ships in v1 or remains deferred (current plan: deferred; cancel via terminal Ctrl-C).
- MCP transport choice details (HTTP streamable vs SSE) — settled in Phase 3.
- Override seam shape for per-collection chat-panel chrome — explicitly deferred per the design.

### Phase 8 outcomes (filled in when reached)

_To be populated after the validation pass._
