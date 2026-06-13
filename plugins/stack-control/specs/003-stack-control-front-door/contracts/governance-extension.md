# Contract: Governance extension (rehomed)

The founding `deskwork-governance` Spec Kit extension, physically moved from `plugins/dw-lifecycle/spec-kit/` into `plugins/stack-control/spec-kit/`. Its behavioral contract is **unchanged** by the move — this contract exists to pin "unchanged" so the rehome is verifiable.

## Identity (preserved across the move)

- **Extension id**: `deskwork-governance` (unchanged — preserves the `.specify/extensions.yml` registration and the `after_implement` wiring).
- **Command**: `speckit.deskwork-governance.govern` → slash `/speckit-deskwork-governance-govern`.
- **Hook**: `hooks.after_implement`, `optional: false` — fires automatically after native `/speckit-implement`, no manual invocation (SC-002).
- **requires.tools**: `dw-lifecycle` (required), `git` (required) — the outbound cross-plugin seam stays; audit-barrage still lives in dw-lifecycle until a later migration feature.

## Behavior (preserved)

`govern.sh` (the deterministic orchestration):
1. Derive feature slug from `feature/<slug>` branch (or `GOVERN_FEATURE_SLUG` override); fail loud on an empty/underivable slug.
2. Gather the implemented-work context: `git diff <base>`, commit subjects, audit-log excerpt.
3. `dw-lifecycle audit-barrage-render` → `dw-lifecycle audit-barrage --output-run-dir` → `dw-lifecycle audit-barrage-lift --apply`.
4. Fail loud if `dw-lifecycle` (or `jq`) is absent — **no silent skip** (Principle V).

## Invariants asserted by the rehome (test-enforced)

| Invariant | Assertion | Maps to |
|---|---|---|
| **Provider neutrality** | grep over `govern.sh` + command body returns **zero** authoring/execution tool-name matches | SC-004, Principle III, VR-3 |
| **Fires automatically** | `.specify/extensions.yml#hooks.after_implement` names the govern command after re-install; quickstart's `/speckit-implement` run fires it with 0 manual invocations | SC-002 |
| **Cross-plugin seam intact** | `govern.sh` still reaches `dw-lifecycle audit-barrage*`; absence fails loud | Edge "governance dependency at rehome" |
| **End-to-end still green** | `scripts/smoke-governance-after-implement.sh` (GOVERN path repointed to `plugins/stack-control/...`) passes: new run-dir, ≥2 model lanes, findings lifted to `audit-log.md` | US1 scenario 2 |
| **No dw-lifecycle inbound coupling** | grep `plugins/dw-lifecycle/{src,bin,commands,skills}` for `deskwork-governance` / `spec-kit/` → zero | VR-2, isolation invariant (R5) |

## Move mechanics (what changes — surgical)

1. `git mv plugins/dw-lifecycle/spec-kit/deskwork-governance plugins/stack-control/spec-kit/deskwork-governance` (preserves history).
2. Repoint `scripts/smoke-governance-after-implement.sh`: `GOVERN="plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh"`.
3. Re-install the extension into `.specify/extensions/deskwork-governance` from the new source (`specify extension add … --dev --force`), so `.specify/extensions.yml` continues to register it.
4. Update the slice-001 completion note / any doc that cites the old source path (informational; does not change behavior).

Nothing in `plugins/dw-lifecycle/`'s own runtime is touched (R5 confirmed no inbound dependency).
