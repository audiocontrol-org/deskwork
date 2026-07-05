---
slug: 034-governance-code-scope
targetVersion: ""
---

# Audit log — 034-governance-code-scope

## 2026-07-05 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260705-01 — Over-broad custom code scope can silently graduate unaudited code

Finding-ID: AUDIT-20260705-01
Status:     fixed
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/govern/end-govern-runtime.ts:267-279; src/govern/end-govern-pipeline.ts:126-153
Resolution: Fixed TDD-first (T023 RED `33795617`, T024 fix `35a003b1`). `summarizeCodeScope` now
            returns `emptiedByDocumentationOnly` (= emptiedScope AND every removed file satisfies the
            built-in `isDefaultDocumentationFile` classification); the seam sets `emptiedByCodeScope`
            and emits the "nothing to govern" success ONLY on that stronger signal. A custom exclude
            that empties the scope by removing non-documentation code no longer sets the flag → the
            pipeline hits the existing empty-scope FATAL and refuses to graduate unaudited code.

`end-govern-runtime` marks any active code-scope policy that reduces a non-empty diff to zero files as `emptiedByCodeScope`, and `runEndGovern` treats that flag as a successful "nothing to govern" convergence record. That is correct for the intended docs-only case, but the mechanism does not prove the removed files were documentation. With operator overrides, `code_scope.exclude: ["src/**"]` or `["**/*"]` will remove real code, set `emptiedByCodeScope: true`, and graduate with `outcome: 'converged'` without firing a barrage.

The blast radius is high because this bypasses the existing empty-scope safety guard for exactly the class it previously named: an over-broad exclusion filter. A reasonable fix is to make the success path require a stronger signal, for example "all removed files are documentation under the built-in documentation classification", and keep arbitrary custom-policy empty scopes fatal unless they can be proven docs-only.
