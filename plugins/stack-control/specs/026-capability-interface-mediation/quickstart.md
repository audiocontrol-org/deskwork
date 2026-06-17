# Quickstart: Capability-interface mediation

**Feature**: 026-capability-interface-mediation. Runnable validation that the complete-mediation invariant holds — raw reach-around refused, sanctioned front-door permitted. Run from the installation root (`plugins/stack-control` in this repo). Maps to spec Success Criteria SC-001…SC-007.

## Prerequisites

- The plugin installed (so the PreToolUse hook is active) — or, for the pure-CLI checks, just a built `stackctl`.
- A stack-control installation (`stackctl setup` has run; `.stack-control/config.yaml` present).

## Scenario A — CLI surface refused raw, permitted through the front door (SC-001/002)

```bash
# 1. Raw reach-around (no marker) → REFUSED
stackctl mediate-check --surface bash --identity backlog --session test-sess --json
#   expect: {"verdict":"refuse","capability":"backlog",...}  exit 1
#   stderr names /stack-control:backlog

# 2. Sanctioned: front-door brackets the drive
TOKEN=$(stackctl front-door enter --capability backlog --session test-sess)
stackctl mediate-check --surface bash --identity backlog --session test-sess --json
#   expect: {"verdict":"permit","capability":"backlog",...}  exit 0
stackctl front-door exit --token "$TOKEN" --session test-sess

# 3. After exit → REFUSED again (marker cleared)
stackctl mediate-check --surface bash --identity backlog --session test-sess
#   expect: exit 1
```

## Scenario B — Skill surface (SC-001) — spec-execution

```bash
stackctl mediate-check --surface skill --identity speckit-implement --session s2
#   expect: refuse → exit 1; stderr names /stack-control:execute
TOKEN=$(stackctl front-door enter --capability spec-execution --session s2)
stackctl mediate-check --surface skill --identity speckit-implement --session s2
#   expect: permit → exit 0
stackctl front-door exit --token "$TOKEN" --session s2
```

## Scenario C — Precise identity matching, no false positives (SC-003)

```bash
# A command that merely mentions a backend name as a path/arg is NOT refused
stackctl mediate-check --surface bash --identity ./scripts/backlog-notes.sh --session s3
#   expect: permit (normalized argv[0] != 'backlog')  exit 0
stackctl mediate-check --surface bash --identity grep --session s3
#   (e.g. `grep backlog file`) expect: permit  exit 0
```

## Scenario D — Registry-entry-only extensibility (SC-004)

Add a temporary capability entry to `src/capability/registry.ts`, rebuild, then:

```bash
stackctl capability list --json    # the new capability appears
stackctl mediate-check --surface bash --identity <new-backend> --session s4
#   expect: refuse — with NO change to interceptor/adapter code
```

## Scenario E — Discovery is the API spec (FR-012)

```bash
stackctl capability list
#   expect: backlog / spec-definition / spec-execution, each with interface,
#   mediated identities, policies — read from the single registry
```

## Scenario F — End-to-end interception under Claude Code (SC-001/002/005)

With the plugin installed in a Claude Code session:

1. Invoke a raw `backlog …` in Bash → the PreToolUse hook denies it with the redirect reason (observe `permissionDecision: deny`).
2. Drive `/stack-control:backlog …` → the front-door skill brackets with `front-door enter/exit`; the same operation completes.
3. Invoke a raw `/speckit-implement` skill → denied (pending the D3 spike confirming the `Skill` `tool_input` field; if the spike falsifies it, this scenario is covered by Scenario G instead).

## Scenario G — Backstop: bypassed work cannot graduate; reconciler flags it (SC-006)

```bash
# Perform a spec-execution effect that skipped the front door, then:
stackctl capability reconcile --json     # flags the un-governed state
# attempt to graduate the work → graduate gate refuses (all-phase-checkpoints-current)
```

## Scenario H — Self-dogfood (SC-007)

In THIS repo, a maintainer's raw `backlog`/`/speckit-*` reach-around hits the same refusal an adopter would — the plugin's installed hook + `stackctl` verbs, no privileged path.

## Notes

- The pure-CLI scenarios (A–E, G) are deterministic and belong in the vitest suite. The in-session scenarios (F, H) are manual/integration checks against an installed plugin.
- Implementation detail (the spike result, the marker file internals) is NOT duplicated here — see `contracts/` and `data-model.md`.
