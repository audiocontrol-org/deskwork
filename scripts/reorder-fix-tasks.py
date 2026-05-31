#!/usr/bin/env python3
"""
Physically reorder Phase 5's fix-finding task blocks in the workplan
so they appear sorted by AUDIT-id ascending. Closes the AUDIT-16
physical-reorder deferral that AUDIT-20260531-03 caught.

The script reads the workplan, extracts every `### Task 5.X
(fix-finding-AUDIT-20260530-NN): ...` block (heading line through
the line before the next ### or ## heading), removes them from
their current positions, and re-inserts the sorted list at the
position of the first fix-task block.

Idempotent: running twice produces the same output (the sorted
position is identical).

Pure-doc edit; no functional code change.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WORKPLAN = Path(
    "/Users/orion/work/deskwork-work/scope-discovery/docs/1.0/001-IN-PROGRESS/scope-discovery/workplan.md"
)

# Match a fix-task heading and capture its canonical AUDIT id (the
# `AUDIT-YYYYMMDD-NN` prefix INSIDE the `(fix-finding-...)` marker).
# Match a fix-task heading and capture the canonical AUDIT id. We
# don't bother matching the closing paren or the colon — the
# `(fix-finding-AUDIT-...)` marker may contain nested parens for
# cross-model findings (e.g.
# `### Task 5.1 (fix-finding-AUDIT-20260530-01 (claude-01 + ...; cross-model)):`).
FIX_TASK_HEADING_RE = re.compile(
    r"^### Task 5\.\d+ \(fix-finding-(AUDIT-\d{8}-\d+)\b", re.IGNORECASE
)


def main() -> int:
    text = WORKPLAN.read_text()
    lines = text.split("\n")

    # Pass 1: find every fix-task heading line + its canonical id.
    fix_starts: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        m = FIX_TASK_HEADING_RE.match(line)
        if m is not None:
            fix_starts.append((i, m.group(1)))

    if not fix_starts:
        print("No fix-task blocks found; nothing to do.", file=sys.stderr)
        return 0

    # Pass 2: compute (start, end_exclusive) for each block.
    blocks: list[tuple[int, int, str, list[str]]] = []
    for idx, (start_line, audit_id) in enumerate(fix_starts):
        # Block ends at the next `### ` or `## ` heading, or EOF.
        end_line = len(lines)
        for j in range(start_line + 1, len(lines)):
            ln = lines[j]
            if ln.startswith("### ") or ln.startswith("## "):
                end_line = j
                break
        blocks.append((start_line, end_line, audit_id, lines[start_line:end_line]))

    # Strip trailing blank lines from each block so re-insertion doesn't
    # accumulate extra blanks. We'll add ONE separator between blocks.
    cleaned_blocks: list[tuple[str, list[str]]] = []
    for _start, _end, audit_id, block_lines in blocks:
        # Remove trailing empty strings.
        while block_lines and block_lines[-1].strip() == "":
            block_lines.pop()
        cleaned_blocks.append((audit_id, block_lines))

    # Sort by canonical AUDIT id (lex order is correct here:
    # `AUDIT-20260530-01` < `AUDIT-20260530-09` < `AUDIT-20260530-10`
    # because the NN suffix is zero-padded to 2 digits and the date is
    # fixed-width).
    cleaned_blocks.sort(key=lambda b: b[0])

    # Renumber Task headings to 5.1, 5.2, ..., 5.N in sorted order so
    # both the audit-id sequence AND the task-number sequence are
    # monotonic. The heading regex captures the full heading line; we
    # rewrite the leading `### Task 5.X ` portion.
    HEADING_TASK_NUM_RE = re.compile(r"^(### Task) 5\.\d+( \(fix-finding)", re.IGNORECASE)
    renumbered: list[tuple[str, list[str]]] = []
    for i, (audit_id, block_lines) in enumerate(cleaned_blocks):
        new_num = i + 1
        new_block = list(block_lines)
        if new_block:
            new_block[0] = HEADING_TASK_NUM_RE.sub(
                rf"\1 5.{new_num}\2", new_block[0]
            )
        renumbered.append((audit_id, new_block))
    cleaned_blocks = renumbered

    # Pass 3: rebuild the file with the fix-tasks removed from their
    # original positions, then re-inserted sorted at the FIRST fix-task
    # position.
    insertion_line = fix_starts[0][0]

    # Collect indices to delete: all lines from each block's start to
    # end. Use a set for O(1) lookups.
    delete_indices: set[int] = set()
    for start, end, _audit_id, _block_lines in blocks:
        for j in range(start, end):
            delete_indices.add(j)

    # Build the new line list:
    new_lines: list[str] = []
    inserted = False
    for i, line in enumerate(lines):
        if i == insertion_line and not inserted:
            # Emit all sorted blocks here, separated by one blank line.
            for k, (_audit_id, block_lines) in enumerate(cleaned_blocks):
                new_lines.extend(block_lines)
                new_lines.append("")  # trailing blank inside the block
                if k < len(cleaned_blocks) - 1:
                    new_lines.append("")  # separator between blocks
            inserted = True
        if i in delete_indices:
            continue
        new_lines.append(line)

    new_text = "\n".join(new_lines)
    WORKPLAN.write_text(new_text)
    print(
        f"Reordered {len(cleaned_blocks)} fix-task blocks at position {insertion_line + 1}.",
        file=sys.stderr,
    )
    print(
        "Order: " + ", ".join(b[0] for b in cleaned_blocks),
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
