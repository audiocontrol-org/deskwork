#!/usr/bin/env python3
"""Batch re-scope backlog items. Run from repo root."""
import sys
import os

BACKLOG = "/Users/orion/work/deskwork-work/stack-control/plugins/stack-control/.stack-control/backlog/tasks"

def find_file(task_id):
    prefix = f"task-{task_id} "
    for name in os.listdir(BACKLOG):
        if name.startswith(prefix):
            return os.path.join(BACKLOG, name)
    raise FileNotFoundError(f"No file for task-{task_id}")

def patch(task_id, old_title=None, new_title=None, old_desc=None, new_desc=None):
    path = find_file(task_id)
    with open(path) as f:
        content = f.read()
    if old_title and new_title:
        if old_title not in content:
            print(f"WARNING: title not found in task-{task_id}")
        else:
            content = content.replace(old_title, new_title)
    if old_desc and new_desc:
        if old_desc not in content:
            print(f"WARNING: desc not found in task-{task_id}")
        else:
            content = content.replace(old_desc, new_desc)
    if old_desc is None and new_desc:
        # Inject description section before end of file
        DESC_BLOCK = f"\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\n{new_desc}\n<!-- SECTION:DESCRIPTION:END -->\n"
        # Add after the front matter closing ---
        parts = content.split("---", 2)
        if len(parts) >= 3:
            content = f"---{parts[1]}---{parts[2]}{DESC_BLOCK}"
        else:
            content += DESC_BLOCK
    with open(path, "w") as f:
        f.write(content)
    print(f"OK: task-{task_id}")


# TASK-109: re-scope torn-temp to writeWholeFeatureConvergenceRecord
patch(109,
    old_title="TASK-109",  # frontmatter id field, not what we patch
    new_title=None,
    old_desc=None,
    new_desc="Re-scoped 2026-06-22: original finding cited checkpoint-state.ts:58-63 writePhaseCheckpoint() (deleted by 030 US2 — moot). Surviving risk: writeWholeFeatureConvergenceRecord in chunk-artifacts.ts uses atomic temp+rename; a crash between write and rename leaves a torn temp file that can shadow the real convergence record on next run. Add a temp-file cleanup step (scan for .tmp.json siblings on govern startup) or use a write-then-rename pattern that avoids temp persistence. Compare with chunk-artifact.ts tear-on-failure path."
)

# TASK-110: re-scope non-regular FS entries onto scope-fingerprint.ts
patch(110,
    old_desc=None,
    new_desc="Re-scoped 2026-06-22: original finding cited checkpoint-state.ts:144-158 (deleted by 030 — moot). Same defect migrated to scope-fingerprint.ts:77 digestScopedPath — only symlinks and directories are guarded; FIFO, socket, and device special files fall through to readFileSync and hash as opaque blobs. Fix: reject non-regular entries (FIFO/socket/block-device/char-device) in digestScopedPath, fail loud instead of silently hashing device bytes."
)

# TASK-113: re-scope to fleet-knowledge doctor/schema; possible dup of TASK-77
patch(113,
    old_desc=None,
    new_desc="Re-scoped 2026-06-22: phase-checkpoints artifact cited in original finding was deleted by 030 US2 (moot). Surviving gap: fleet-knowledge.yaml ships with only light setup verification (verify.ts:44) and no full schema/doctor rule — same surviving gap as TASK-77. Confirm whether this is a dup of TASK-77; if so, close as dup. Otherwise scope to fleet-knowledge.yaml doctor rule + schema validation only."
)

# TASK-119: re-scope to structured machine-readable terminal kind
patch(119,
    old_desc=None,
    new_desc="Re-scoped 2026-06-22: the substring-anchoring risk (incidental match) was fixed — protocol.ts:370 now uses anchored /^audit-barrage: FLOOR SHORTFALL\\b/m. Surviving root ask: the fleet-floor vs barrage-outage split still parses prose rather than a structured exit-code or typed marker. A crash / unexpected stderr layout could route floor-shortfall to the outage branch. Fix: emit a structured machine-readable terminal kind signal from the barrage layer (e.g. a JSON marker on stderr, or a dedicated exit code band) so the classification path does not depend on prose format."
)

# TASK-243: re-scope to git rm --cached cleanup
patch(243,
    old_desc="plugins/stack-control/.stack-control/state/front-door/ is not covered by any gitignore. The execute (027) per-phase boundary commit uses git add -A, which sweeps the session marker into the commit; a stale marker 57b16bd2-...json is already tracked from a prior session. Fixed forward in 027 Phase 1 by adding **/.stack-control/state/ to the repo-root .gitignore; the already-tracked stale marker still needs a git rm --cached cleanup (not done in the Phase 1 scope commit).",
    new_desc="Re-scoped 2026-06-22: gitignore half DONE (**/.stack-control/state/ at root .gitignore:168). Surviving work: git ls-files shows state/front-door/57b16bd2-...json still tracked — run git rm --cached plugins/stack-control/.stack-control/state/front-door/57b16bd2-*.json (and any other tracked marker files) to complete the cleanup."
)

# TASK-354: re-scope to adaptive liveness window for chunk payloads
patch(354,
    old_desc=None,
    new_desc="Re-scoped 2026-06-22: per-phase payload framing is obsolete (per-phase govern deleted by 030). Surviving gap: the liveness window is not payload-scaled — whole-feature chunk payloads can be just as large as the per-phase payloads that triggered the timeout. timeout-derivation.ts scales the floor but not the liveness window; the fixed 300s window leaves extended-thinking models vulnerable on large chunks. Fix: scale the per-lane liveness window proportionally to estimated payload size (or adopt the adaptive mechanism that timeout_secs_per_kb already provides for floor). Near-duplicate of TASK-324 root (same file: timeout-derivation.ts); consider folding."
)

# TASK-413: re-scope to pipeline-output wiring only
patch(413,
    old_desc="The CLI per-chunk loop (T036) reuses the existing barrage payload assembler (buildImplementVars -> payload-implement.ts, 801 lines) rather than switching the CLI to the end-govern-pipeline module (which would need the barrage->findings auditChunk integration). So payload-implement.ts remains (FR-022 decompose not done) and govern.ts is 985 lines (down from 1284 but still over cap; pre-existing TASK-151). All NEW 030 modules are <=500 (SC-007 for new code holds). Either decompose payload-implement in place, or do the deeper CLI switch to runEndGovern (enabling its removal + using seam/fix-fanout/bounded-loop at the CLI).",
    new_desc="Re-scoped 2026-06-22: payload-implement.ts DELETED by 030 US8; govern.ts is now 333 lines (under the 300-500 cap). FR-022 decompose/cap intent is met. Surviving work: the CLI dispatches to runEndGovern but the pipeline object output is not yet fully wired through (overlaps TASK-417 — WholeFeatureConvergenceRecord vs GovernConvergenceRecord shape mismatch). Scope: wire CLI pipeline output to runEndGovern cleanly so the record shape gate in capability-reconcile reads the correct type."
)

# TASK-47: re-scope to cross-boundary rename / payload-FATAL residual
patch(47,
    old_desc="Found at the installation-isolation after_implement governance pass: the feature relocated specs/.specify into the installation (git mv, history-preserving); git diff --relative <pre-feature-base> then shows every moved file as a pure ADD (~1.8MB / 20k insertions of pre-existing spec text) because the delete side lies outside the installation subtree. govern has no end-ref or pathspec seam, and GOVERN_PAYLOAD_BUDGET bounds only the untracked fold. Workaround used: a local synthetic rename-neutralized base commit (worktree at the base + the same git mv, never pushed). Candidate fixes: rename-pair across the boundary before relativizing; a documented --diff-base recipe for relocations; or a payload-size FATAL with actionable advice instead of silent oversized shipping.",
    new_desc="Re-scoped 2026-06-22: 021 T026 added --find-renames for the committed/cross-tree arms (partial fix landed). Surviving residual: a rename across the installation boundary (git mv moving files in OR out of the installation subtree) still bloats the payload — the delete side is outside the relative subtree, so git diff --relative shows a full ADD. No rename-pairing across the boundary, and no payload-size FATAL with actionable advice. Candidate next step: detect cross-boundary bloat (payload > threshold) and emit a FATAL with actionable advice (e.g. use a synthetic base commit or --diff-base recipe), rather than silently shipping the oversized payload."
)

print("All re-scopes applied.")
