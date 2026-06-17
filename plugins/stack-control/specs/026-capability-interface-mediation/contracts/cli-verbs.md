# Contract: stackctl CLI verbs (capability mediation)

**Feature**: 026-capability-interface-mediation. All verbs follow the existing dispatch + strict-flag + exit-code conventions (`src/cli.ts`, `speckit-guard.ts`). Exit codes uniformly: **0 = ok/permit · 1 = refuse/business-error · 2 = usage error**. All state-writing verbs honor the installation-anchor invariant (anchor in the nearest-enclosing installation or `--at <dir>`; refuse loudly with no enclosing installation).

## `stackctl mediate-check` — the decision verb (vendor-neutral core)

Generalizes `speckit-guard`. Called by every vendor adapter.

```
stackctl mediate-check --surface <bash|skill> --identity <str> --session <id> [--at <dir>] [--json]
```

- **Inputs**: `--surface` the matcher that fired; `--identity` normalized `argv[0]` (bash) or skill name (skill); `--session` the hook session id; `--at`/cwd resolves the installation + marker file.
- **Behavior**: resolve the registry + the session marker file; apply the pure decision rule (data-model § MediationDecision).
- **Output (`--json`)**: `{ "verdict": "permit"|"refuse", "capability": string|null, "reason": string }`.
- **Exit**: `0` permit · `1` refuse (stderr carries the registry-sourced redirect message naming the interface) · `2` usage (missing/invalid flag — strict parse, no silently-ignored flag).
- **Purity**: read-only (Principle IV); never writes the marker or backend state.

## `stackctl front-door enter` / `front-door exit` — the marker writer

Called by capability-interface skills to bracket a sanctioned backend drive.

```
stackctl front-door enter --capability <id> --session <id> [--at <dir>]   # → stdout: <token>
stackctl front-door exit  --token <token> --session <id> [--at <dir>]
```

- **enter**: push an `ActiveEntry{capability, token, writtenAt}` to `<installation>/.stack-control/state/front-door/<session>.json`; print the `token`. Idempotent-safe (creates the file/dir).
- **exit**: remove the entry whose `token` matches; never clears another entry (FR-014a). Missing token → no-op success (teardown must be safe after a crash).
- **Exit**: `0` ok · `2` usage. Writes are atomic (temp-write + rename), mirroring existing checkpoint I/O.
- **Staleness**: readers prune entries older than the max session age; `enter` may opportunistically prune.

## `stackctl capability list` — agent-facing discovery (the API spec)

```
stackctl capability list [--json]
```

- **Output**: each capability's `id`, `interface`, mediated `backendIdentities`, `policies`, `redirect` — read from the single registry (FR-012). `--json` for adapters; human table by default.
- **Exit**: `0`.

## `stackctl capability reconcile` — the Approach C backstop reconciler

```
stackctl capability reconcile [--at <dir>] [--json]
```

- **Behavior**: flag backend state present without a corresponding governance/graduation record for its capability (un-governed bypass residue). Reuses per-phase checkpoint status for `spec-execution`; report-only.
- **Output**: list of `{capability, evidence, status}`; `--json` machine form.
- **Exit**: `0` (report-only; never mutates). A future `--fix`/gate mode is out of v1 scope unless the operator adds it.

## Strictness / fail-loud (Principle V)

- Unknown flag → exit 2 with usage (no silent ignore — the `AUDIT-20260605-09` pattern).
- No registry entry for an identity is **not** an error — it means "not a fronted backend" → permit. (Correct behavior, not a fallback.)
- A malformed registry or unreadable marker file → fail loud (exit 1/2 as appropriate), never silent-permit a known backend identity.
