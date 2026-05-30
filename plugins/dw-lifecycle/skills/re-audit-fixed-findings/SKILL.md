---
name: re-audit-fixed-findings
description: "Post-release verification — fire audit-barrage against the feature, cross-reference new findings against fixed-<sha> entries, propose verified-<date> for those that no longer surface; flag re-surfacing fixes as did-not-actually-fix"
---

# /dw-lifecycle:re-audit-fixed-findings

Phase 13 Task 4 Step 3 — closes the closure-side automation triad with `/dw-lifecycle:apply-audit-flips` (auto-flip `open → fixed-<sha>`) and `/dw-lifecycle:close-shipped-audit-findings` (release-range `fixed-<sha> → verified-<date>`).

This skill runs post-release verification: it fires a fresh `audit-barrage` against the feature, cross-references the new run's findings against the audit-log's `fixed-<sha>` entries, and surfaces three buckets:

- **Not surfaced** — the new barrage didn't re-raise the finding. The fix held. Candidate for `verified-<date>` flip.
- **Still surfaced** — the new barrage re-raised the finding's heading or Surface path. The fix did NOT actually fix; the entry stays `fixed-<sha>` and the operator triages why.
- **Unmatchable** — the entry has no Surface field and no heading substring long enough to cross-reference. Operator classifies by hand.

The CLI verb's default mode is dry-run. `--apply` writes verified-`<date>` flips for the not-surfaced bucket only. Re-surfaced and unmatchable entries are NEVER auto-mutated.

## Steps

1. Confirm the feature slug and target audit-log.

2. Fire a fresh audit-barrage:

   ```bash
   dw-lifecycle audit-barrage --feature <slug> [--prompt-file <path>]
   ```

   The run materializes under `.dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<slug>/`.

3. Point this skill's verb at the new run directory:

   ```bash
   dw-lifecycle re-audit-fixed-findings \
       --feature <slug> \
       --run-dir .dw-lifecycle/scope-discovery/audit-runs/<timestamp>-<slug>
   ```

   Reads:
   - Every `*.md` file in the run-dir (per-model outputs).
   - The feature's audit-log entries with `Status: fixed-<sha>`.

   Outputs (dry-run):
   - Per-entry classification + recommended action.
   - One-line summary on stderr: `not-surfaced=N; still-surfaced=N; unmatchable=N`.

4. Operator review:
   - Walk the **still-surfaced** list. Each re-surfacing means the prior fix didn't hold. Options: (a) re-open by hand (Status `open` again + new finding evidence appended to body); (b) accept and append a new run-id to the entry body so the audit trail records both audit cycles.
   - Walk the **unmatchable** list. Operator decides classification by hand.

5. After triage, re-run with `--apply` to write `verified-<date>` flips for the not-surfaced bucket:

   ```bash
   dw-lifecycle re-audit-fixed-findings \
       --feature <slug> \
       --run-dir <path> \
       --apply
   ```

## Flags

| Flag | Purpose |
|---|---|
| `--feature <slug>` | Required. Resolves the audit-log via the version-walked feature-root lookup. |
| `--run-dir <path>` | Required. Path to the audit-barrage run directory whose outputs cross-reference. |
| `--date <YYYY-MM-DD>` | Verified-date suffix; default today (UTC). |
| `--apply` | Writes `verified-<date>` flips for the not-surfaced bucket. Default dry-run. |
| `--repo-root <path>` | Project root override. |

## Cross-reference matching

The matcher uses two heuristics on the concatenated per-model output:

1. **Heading match.** Strip the `AUDIT-<id> — ` prefix from the entry's heading and substring-search the result (case-insensitive) against the new run text. Headings shorter than 12 characters after stripping fall through to surface matching to avoid generic single-word matches.

2. **Surface match.** When the entry carries a `Surface:` field, extract path-shaped tokens (anything with `/` or ending in a recognized source extension) and substring-search each against the new run text.

Either rule firing classifies the entry as still-surfaced. Neither firing AND the entry having no usable heading or surface tokens classifies as unmatchable; otherwise not-surfaced.

The heuristics are intentionally loose; the operator's verification step is the source of truth, not the verb's output.

## Composition with the closure triad

| Verb | Status transition | When |
|---|---|---|
| `apply-audit-flips` | `open → fixed-<sha>` | After each `Closes AUDIT-<id>` commit. |
| `close-shipped-audit-findings` | `fixed-<sha> → verified-<date>` (by release-range SHA membership) | After tagging a release. Use when the release shipped via a tag boundary. |
| `re-audit-fixed-findings` | `fixed-<sha> → verified-<date>` (by re-audit non-surfacing) | After tagging a release. Use when the operator wants empirical re-audit evidence, not just SHA-in-range. |

`close-shipped-audit-findings` and `re-audit-fixed-findings` are complementary: the former is a fast SHA-membership check; the latter is the cross-model evidence-based check. Operators can run both — verifying with both increases confidence.

## Error handling

- **Audit-log missing.** Exit 2 with the resolved path in the error.
- **Run-dir missing or contains no `*.md` outputs.** Exit 2.
- **Audit-barrage not yet fired.** This skill assumes a recent audit-barrage run-dir exists; if not, fire it first via `/dw-lifecycle:audit-barrage`.
- **Entry has neither heading nor Surface.** Classifies as unmatchable; reported but never auto-mutated.

## Cross-references

- `/dw-lifecycle:audit-barrage` SKILL.md — for the prerequisite barrage step.
- `/dw-lifecycle:apply-audit-flips` SKILL.md (sibling skill, if shipped) — the open → fixed-<sha> half of the closure triad.
- `audit-log.md` preservation rule — status changes only; entry bodies preserved verbatim.
- Project rule "Issue closure requires verification in a formally-installed release" — this skill operationalizes that rule.
