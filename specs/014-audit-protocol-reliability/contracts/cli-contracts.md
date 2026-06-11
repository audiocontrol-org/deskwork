# CLI Contract Deltas — Audit-Protocol Reliability (specs/014)

All deltas are **additive**: no existing exit code changes meaning, no existing flag changes behavior (FR-014). Stderr is the loudness channel; stdout/JSON shapes are unchanged unless listed.

## `stackctl audit-barrage` (US1)

**New flag**: `--require-models <n>` — minimum *emitting* models (`stdoutBytes > 0`). Effective floor is `min(n, CONFIGURED fleet size)` — the loaded config's battery, never the `--models` / `GOVERN_MODELS` subset actually run, so subset selection does not lower the floor (AUDIT-20260611-03). A shortfall fails loudly naming expected vs actual and the cause: each non-emitting model, and/or — when the selected subset is itself below the effective floor — that selection (not model health) caused the shortfall. Default (manual runs): no floor.

**New stderr output** (when any configured model emitted zero bytes):

```
audit-barrage: WARNING — model '<name>' produced no output (<timed out after Ns | exited <code>>)
audit-barrage: WARNING — only 1 model emitted findings this round; cross-model agreement (the HIGH-confidence signal) is unavailable
```

**Summary line**: the partial case additionally names the degraded model(s); the fully-healthy case is unchanged (no degradation text).

**Exit codes**: unchanged — 0 partial-or-full fleet, 1 OUTAGE (zero covering). With a floor requested: shortfall → non-zero, message names the floor. Run JSON unchanged (already ground truth).

## govern-driven barrage (US1)

Govern invokes the barrage with floor 2 by default (protocol runs exist for the agreement signal). Override: govern-level flag passes through (lenient opt-out or stricter opt-in). A floor failure surfaces through govern's existing fatal path with the same named-shortfall message.

## Barrage config loading (US2 — fires in every verb that loads barrage config)

**New stderr notice** whenever `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml` exists:

```
audit-barrage: WARNING — legacy dw-lifecycle config present and IGNORED: <legacy-path>
audit-barrage: reading <active: .stack-control/audit-barrage-config.yaml | built-in defaults>
audit-barrage: migrate with: mv <legacy-path> .stack-control/audit-barrage-config.yaml (then review)
```

Fires in all combinations (legacy-only, legacy+active). Never changes which config wins; never fires when no legacy file exists.

## `stackctl audit-barrage-lift` (US3)

No flag/exit changes. Behavioral contract: one audit-log entry per distinct root-cause mechanism; `(… ; cross-model)` annotation only on same-root-cause multi-model merges. Surface-only agreement produces separate entries.

## `stackctl slush-findings` (US4)

No flag changes. Strengthened contract: dry-run "would migrate N" ⇒ apply migrates exactly N on an unchanged audit-log; any flip that cannot be applied fails the verb loudly naming the finding ID (non-zero exit — never exit 0 with a shortfall). Audit-log changed between dry-run and apply ⇒ loud staleness failure. AUDIT-20260611-02: a decided flip whose backlink ref already exists (same canonical AUDIT-id migrated earlier from another section/run) is rewritten to `Status: migrated-to-backlog <existing-task-id>` — never left open — with no new item created; the APPLIED stdout line surfaces the count + mapping (`(M already present: AUDIT-X→TASK-Y, …)`), so dry-run N ≡ migrated + already-present N.

## `stackctl govern --mode implement` (US5)

No flag changes. Payload contract: the feature's own audit-log/governance bookkeeping is absent from the audited diff and untracked fold; the untracked fold excludes other features' roots and the feature's audit-log — the feature's own files and non-feature files (e.g. new source modules) fold in (AUDIT-20260611-01: the prior "only files under the feature under audit" inclusion scoping silently dropped untracked source files); each other-feature drop is announced on stderr and recorded in the payload's `skippedOtherFeature` ledger; the labeled `audit_log_excerpt` context block is the only audit-log content. AUDIT-20260611-04: implement mode REFUSES to run on an unresolvable feature root — stderr FATAL naming the slug + both probed layouts (speckit + legacy-docs), exit 2, before any payload ships — instead of silently reverting to the pre-014 self-referential repo-wide payload.

AUDIT-20260611-08 (widening FR-007's exclusion from exactly one file to the promised governance-bookkeeping surface): the COMMITTED-diff arm's pathspec exclusions additionally cover (a) the governance backlog task store — per-round backlog bookkeeping commits land inside the diff range the same way lift commits do, and the store lives at the plugin root, outside the feature root's pathspec; govern (the caller) threads the store path into the assembler's additive `excludePaths` arg from the backlog-root seam (`STACKCTL_BACKLOG_DIR`-aware; outside any installation the skip is announced on stderr, never silent — the assembler hardcodes no store path) — and (b) every OTHER feature root's `audit-log.md`, closing the sibling-lift-commits-sharing-a-diff-range channel. Decision recorded: only each sibling root's `audit-log.md` is excluded from the committed arm — a sibling's other committed file changes remain legitimate diff content; the untracked fold continues to exclude other-feature roots wholesale (warned + ledgered, unchanged). The fold applies the same `excludePaths` exclusion silently-by-design (governance plumbing, mirroring the feature's own audit-log exclusion); `skippedOtherFeature` semantics are unchanged.

## `stackctl scope-widen` (US6 + US7)

**US6 new stderr** on missing scope-discovery state:

```
scope-widen: scope-discovery state absent — seeding .stack-control/scope-discovery/ (first use)
```

then the widen proceeds (exit 0 for the previously-aborting case). Genuinely unsatisfiable post-seed clone requests keep the existing loud remediation (non-zero).

**US7**: widen-run EVIDENCE dirs land under the resolved feature root (specs layout included); no `docs/` tree is recreated. Same resolution change for `scope-inventory`, `scope-export`, the two CLIs' default `--prd-path`/`--manifest`, and the provenance doctor rule. Legacy-layout resolution byte-compatible.

## `stackctl backlog …` (US8)

- `backlog list`: malformed task file ⇒ stderr `backlog: WARNING — skipping malformed task file: <path> (<parse error summary>)`, healthy items still listed, exit 0.
- `backlog … ` paths using `exists` / import idempotency: malformed file ⇒ existing `BacklogError` channel, message names the file + remediation, exit 2 (existing mapping at `backlog.ts:304–306`). AUDIT-20260611-06: a POSITIVE idempotency answer is decidable with malformed files present — when the ref is found among healthy items, `exists` returns true; the loud failure fires only when the answer would otherwise be "absent".
- Never: an unhandled stack trace with exit 1.
