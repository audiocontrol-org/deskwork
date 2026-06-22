---
slug: chunked-end-govern
targetVersion: ""
---

# Audit log — chunked-end-govern

## 2026-06-22 — audit-barrage lift (end-govern-after_implement)

### AUDIT-20260622-01 — No validation that `runDir` is non-empty on zero-exit barrage

Finding-ID: AUDIT-20260622-01
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=high, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-runtime.ts — barrage result handling in `auditChunk`, lines ~166–185 in the new file

After `spawnText` returns exit 0 for `audit-barrage`, the code immediately assigns:

```typescript
const runDir = barrage.stdout.trim();
cfg.stderr(`govern: chunk ${chunkId} barrage run-dir = ${runDir}\n`);
reportFleetStatus(runDir, cfg.stderr);
const degraded = chunkFleetDegraded(runDir);
const rich = await extractBarrageFindings({ runDir, warn: ... });
```

There is no guard checking that `runDir` is non-empty. If the binary exits 0 without printing a path (e.g. a version mismatch that made `--output-run-dir` a no-op, a shell-level stdout redirect, or a partially-written pipe), `runDir` is `''`. The chain then proceeds: `chunkFleetDegraded('')` calls `existsSync(join('', 'INDEX.md'))` which resolves to the CWD's `INDEX.md` — likely absent, so it returns `false`, silently reporting the fleet as non-degraded. `extractBarrageFindings({ runDir: '' })` will subsequently fail with a confusing low-level filesystem error rather than a clear FATAL with an actionable message.

The blast radius is that a misconfigured or mismatched barrage binary produces a silent "no findings, fleet healthy" outcome for that chunk, allowing a run that never actually audited anything to be counted as clean. The fix is a `if (!runDir) throw new GovernProtocolError(...)` immediately after the exit-0 check, before the chain runs.

---

### AUDIT-20260622-02 — `scopeDiff` in the pipeline runtime drops all payload exclude paths

Finding-ID: AUDIT-20260622-02
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/govern/end-govern-runtime.ts:~178–182 (new file, `deps.scopeDiff`) cross-referenced with src/subcommands/govern.ts:~860–920 (the `makeEndGovernRuntime` call site)

In the old chunked-partition path (now deleted from `govern.ts`), the chunk scopes were built starting from `payloadPathScope` — derived from `resolveGovernExcludePaths(installation)` — ensuring that spec artifacts, contract files, and other non-implementation paths were excluded from the audited diff. `chunkScopes` inherited those exclusions.

In the new path, `buildImplementVars` is still called with `excludeRoots` and `excludePaths`:

```typescript
const { vars } = buildImplementVars(
  repoRoot, slug, flags.diffBase, flags.checkpoint,
  undefined, featureRoot, excludeRoots, excludePaths,
);
const { diff: _discardedWholeDiff, workplan_summary: planContext, ...varsBase } = vars;
```

The scoped `diff` is immediately discarded. The pipeline's `deps.scopeDiff` is then wired to:

```typescript
scopeDiff: (installationRoot, base, head) => scopeCommittedDiff(installationRoot, base, head),
```

`scopeCommittedDiff` takes no exclusion arguments and returns all changed files. Every file in the committed range — including spec documents, contract markdown, quickstart files, and anything else `resolveGovernExcludePaths` was meant to filter — now flows into the partition and is presented to the barrage as auditable implementation surface. The `specs/018-repo-release-surface/` tree that appears in this very diff is a concrete example: it would be included in a govern run's audit payload, producing findings from non-implementation spec prose that the old behavior correctly excluded.

The fix is to thread an exclude-paths argument through `EndGovernRuntimeConfig` and apply it when calling `scopeCommittedDiff` inside `auditChunk`.

---

### AUDIT-20260622-03 — `liftEndGovernFindingsOnce` throw is uncaught — process crashes after graduation record is committed

Finding-ID: AUDIT-20260622-03
Status:     open
Severity:   high
Per-lane:   claude=high
Decision:   adjudicated (gate-counted high) — blast-radius=unstated, reachability=unstated, fix-debt=no; no down-calibration signal — high retained.
Surface:    src/subcommands/govern.ts — the `liftEndGovernFindingsOnce` call, lines ~945–955 in the modified file

The implement-mode fast-exit block has this sequence:

```typescript
// 1. Write convergence record — wrapped in try/catch → exits 2 on failure.
try {
  writeWholeFeatureConvergenceRecord(repoRoot, record);
} catch (err) { /* FATAL + exit(2) */ }

// 2. Lift ONCE — NO try/catch.
await liftEndGovernFindingsOnce({ installationRoot: repoRoot, slug, ... });

// 3. Outcome check → exit(1) or exit(0).
```

If `liftEndGovernFindingsOnce` throws — which it does when `resolveFeatureRoot` returns `root === undefined`, or when `atomicWriteFile` fails — the error propagates to `runGovern`'s outer handler as an unhandled rejection. The operator sees a raw stack trace. More critically, the graduation state is now inconsistent: step 1 has already written the whole-feature convergence record (which the `governing → shipped` gate reads), but the audit log has received no lift section. If `record.outcome === 'converged'`, the gate will subsequently treat the feature as graduated on the next `govern --mode implement` invocation, even though the findings from this run were never recorded.

The fix mirrors the convergence-record write pattern: wrap `liftEndGovernFindingsOnce` in a try/catch that emits a FATAL to stderr and calls `process.exit(2)`. Whether the convergence record should also be reverted on lift failure is a design question (given it's the gate's source of truth), but at minimum the failure must surface cleanly rather than as an unhandled exception.

---

### AUDIT-20260622-04 — Audit metadata can describe a different diff than the chunks actually audited

Finding-ID: AUDIT-20260622-04
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    src/subcommands/govern.ts:869-887

`base` is resolved at line 869 from `flags.diffBase`, `GOVERN_DIFF_BASE`, or `HEAD~1`, and that value is passed into `runEndGovern` at lines 903-906. But `buildImplementVars` is called with `flags.diffBase` at line 878, so when the base comes from the env var or default, the prompt metadata in `varsBase` can be built from a different base than the chunked diff actually audited.

Blast radius is high because an unattended reviewer can receive commit subjects / audit framing for one range while the pipeline audits another range. The governed record may converge over the right bytes, but the cross-model audit prompt can carry misleading context. A reasonable fix is to pass the resolved `base` into `buildImplementVars`.
