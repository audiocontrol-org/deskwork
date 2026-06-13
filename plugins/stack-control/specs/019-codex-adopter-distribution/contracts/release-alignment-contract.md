# Contract: Release alignment across hosts

## Rules

1. Claude and Codex distribution metadata resolve to the same released
   `stack-control` version line.
2. Release checks fail loudly when Codex distribution metadata is missing,
   stale, or version-divergent.
