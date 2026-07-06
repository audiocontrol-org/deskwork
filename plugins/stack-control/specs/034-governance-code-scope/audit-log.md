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

## 2026-07-05 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260705-02 — package-lock was not updated for the new dependency

Finding-ID: AUDIT-20260705-02
Status:     false
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    package.json:20-27 and package-lock.json:11-27
Resolution: FALSE POSITIVE (single-model codex; claude parsed no findings). The finding assumes a
            single-package repo whose deps live in the lockfile root `packages[""]`. This is an
            npm-workspaces MONOREPO: `picomatch` is a dependency of the WORKSPACE package
            `plugins/stack-control`, and the lockfile's `packages["plugins/stack-control"]` entry
            CORRECTLY lists `picomatch ^2.3.2` (dependencies) and `@types/picomatch ^2.3.3`
            (devDependencies). The root `packages[""]` correctly omits them — they are not root deps.
            Deterministic arbiter: `npm ci --dry-run` SUCCEEDS with no lockfile/package.json mismatch
            (npm ci hard-fails on a mismatch; it did not). Nothing to regenerate. Dispositioned via
            operator-confirmed GOVERN_OVERRIDE.

`package.json` now declares `picomatch` and `@types/picomatch`, but the root package entry in `package-lock.json` still lists neither dependency. The lockfile only has `picomatch` as an existing transitive package, not as a root dependency. A clean `npm ci` expects the lockfile root dependency set to match `package.json`, so this can break CI or a fresh install before the new `src/govern/code-scope.ts` import can be used.

The reasonable fix is to regenerate and commit `package-lock.json` from the updated `package.json` so the root `packages[""].dependencies` includes `picomatch` and `packages[""].devDependencies` includes `@types/picomatch`.
