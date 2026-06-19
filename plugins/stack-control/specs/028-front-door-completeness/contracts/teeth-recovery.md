# Contract: Teeth Recovery & Legitimate-Op Handling

**Feature**: `028-front-door-completeness` | **Phase**: 1 | Satisfies FR-020/021/022/023/024/025/026/050/035; SC-004/005/007.

Hardens the 026 teeth so they never over-refuse or wedge a session. Touches
`src/capability/mediate.ts`, `src/capability/marker.ts`, `src/capability/intercept.ts`,
`src/subcommands/mediate-check.ts`, `src/subcommands/front-door.ts`,
`src/subcommands/speckit-guard.ts`, and `hooks/hooks.json`. The 026 invariants
(session-keyed, nesting-safe markers; lock-serialized writes; per-phase graduate
gate as the load-bearing guarantee) are preserved, not reopened.

---

## T1 — Installation-scoped mediation (FR-020, SC-004)

**Contract.** Mediation fires ONLY inside a stack-control installation. With no
enclosing installation (`findInstallation(cwd)` → `null`), the interceptor and
`mediate-check` **permit** an adopter's own backend call — never refuse.

**Behavior.** A `null` installation short-circuits to permit BEFORE `decideMediation`
runs (Decision 5) — not by relying on an empty active set (which means "installation
exists, nothing bracketed" → a refusal, the wrong verdict). A refusal therefore
implies an installation exists, making the `stackctl setup` redirect always
satisfiable (never a dead end, FR-020 / TASK-201).

**Outputs.** `mediate-check`: exit 0 (permit) with no installation. Interceptor:
permit `hookSpecificOutput` (no deny). **SC-004: 0 false refusals in a no-installation context.**

**Satisfies.** FR-020.

---

## T2 — Read-only exemption (FR-050)

**Contract.** Read-only query verbs are mediation-exempt: the interceptor gates only
mutation/state-bearing ops. The mediation class (data-model §1, FR-050) drives this —
a `read-only` op is never refused, even inside an installation with no marker.

**Satisfies.** FR-050.

---

## T3 — `front-door reset` / `mediate-recover` / `mediate-list` (FR-021/022, SC-005)

**Signatures (extend `src/subcommands/front-door.ts`).**
- `stackctl front-door mediate-list --session <id> [--at <dir>]` — list markers for a session.
- `stackctl front-door mediate-recover --session <id> [--at <dir>]` (alias `front-door reset --session <id>`) — clear the session's markers.

**`mediate-list` (read-only).**
- Success: prints each active entry (capability, token, writtenAt, fresh/stale), or `(no marker)`. A corrupt/unparseable marker is reported as `corrupt (unparseable)` rather than throwing. **Exit 0.**
- Backed by `marker.ts` `listMarker` (tolerant read; never throws on corruption — data-model §3).

**`mediate-recover` / `reset` (mutating).**
- Success: lists then clears the session's marker file (atomic delete by path — does NOT route through `readMarker`, so a corrupt file the read path rejects is still recoverable). Prints `front-door mediate-recover: cleared marker for session <id>`. **Exit 0.**
- Backed by `marker.ts` `clearMarker`.

**Error.** Missing/unsafe `--session` → exit 2 (`isSafeSession` / `assertSafeSession`).
With no installation, `mediate-recover` is a safe no-op success (nothing to anchor).

**Invariant.** A session is NEVER unrecoverable through the interface (FR-021). A
corrupt marker is recoverable in one command, no YAML hand-edit. **SC-005: recovery
in a single sanctioned verb invocation.**

**Satisfies.** FR-021, FR-022.

---

## T4 — Session-binding + cwd/session-id linchpin reconciliation (FR-023)

**Contract.** Marker contents are bound to the requested session (`marker.ts`
`readMarker` throws on a file-internal `sessionId` mismatch — TASK-218, already
shipped). The cwd linchpin (TASK-164/203): both `front-door enter` and the mediation
check resolve the installation root via `findInstallation`, and the marker is keyed
by (installation-root, session-id) — NOT raw cwd. So a cwd that drifts *within the
same installation* resolves the same marker; a sanctioned drive immediately after a
successful `enter` is not silently refused (US3 scenario 4).

**Outputs.** A drive within the installation right after `enter` → permit. A drive
whose cwd has left the installation → no installation resolved → permit (T1), never a
silent refusal.

**Satisfies.** FR-023 (cross-refs TASK-164, TASK-203, TASK-218).

---

## T5 — `speckit-guard` file-marker reconcile (FR-024)

**Contract.** The deprecated `speckit-guard` (`src/subcommands/speckit-guard.ts`)
MUST read the 026 file marker (via `activeCapabilities` / the marker module), NOT the
legacy `STACKCTL_FRONT_DOOR` env var — so its decision matches the interceptor (a
context established via `front-door enter` is seen by both). Its widened refusal set
(now the seven speckit skills, per the registry-derived mapping) is audited and
justified or narrowed.

**Outputs.** A `speckit-guard` call after a file-marker `enter` → permit (exit 0),
matching the interceptor — resolving the TASK-165 divergence the verb's header
documents. Exit contract (0 permit / 1 refuse / 2 usage) unchanged.

**Satisfies.** FR-024 (TASK-165).

---

## T6 — Fail-open signal + staleness + cold-start (FR-025/026)

**Contract.**
- **Fail-open signalled (FR-025/TASK-193).** When the interceptor cannot reach `stackctl` (crash/spawn failure), `bin/intercept` permits (best-effort, 026 FR-014) but writes a VISIBLE skip notice — never a silent permit. The load-bearing guarantee remains the per-phase graduate gate.
- **Staleness must not prune an active drive (FR-025/TASK-197).** `STALE_AGE_MS` (12h) stays; a regression test asserts an `enter`-bracketed drive within the bound is never pruned mid-drive (`isFresh` already preserves this).
- **Cold-start (FR-025/TASK-191).** The cheap pre-filter (`intercept.ts` matches identity FIRST, no marker I/O; a non-backend permits without reading disk) is the bound — a test asserts a non-backend call resolves with zero marker reads. No per-invocation `stackctl` spawn for the common non-backend case.
- **Marker examples authorize (FR-026).** Marker examples in shipped SKILL.md blocks MUST actually authorize the wrapped backend call they illustrate — a test feeds the documented example marker to the decision core and asserts permit.

**Satisfies.** FR-025, FR-026.

---

## T7 — Interceptor-loaded smoke (FR-035, SC-007)

**Contract.** A smoke (`scripts/smoke-interceptor-loaded.sh` + a vitest assertion)
proves the teeth are loaded and firing:
1. **Registration.** `hooks/hooks.json` declares a `PreToolUse` matcher for both `Bash` and `Skill` → `${CLAUDE_PLUGIN_ROOT}/bin/intercept` (confirmed present), and the plugin manifest auto-discovers it on install.
2. **Firing.** Feeding `bin/intercept` a synthetic PreToolUse payload for a fronted backend with NO marker emits the `deny` `hookSpecificOutput` (`intercept.ts` `denyOutput` shape); a non-backend payload permits.

**Outputs.** Smoke exits 0 only when both registration + firing hold. **SC-007: the
interceptor is provably loaded and firing.**

**Satisfies.** FR-035 (US4 scenario 5).

---

## Exit-code summary

| Outcome | Exit |
|---|---|
| `mediate-check` permit / `mediate-list` / `mediate-recover` success | 0 |
| `mediate-check` refuse (fronted, in-installation, unmarked, mutating) | 1 |
| Usage (missing/unsafe `--session`, unexpected flag) | 2 |
| `speckit-guard`: permit 0 / refuse 1 / usage 2 (unchanged) | 0/1/2 |
