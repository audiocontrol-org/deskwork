#!/usr/bin/env bash
set -euo pipefail

COMMENT="Migrated to local stack-control backlog as part of dw-lifecycle wind-down. Closing on GitHub."

DW_LIFECYCLE_ISSUES=(
  431 422 419 418 417 413 409 408 400 396 392 387
  374 373 369 366 364 361 356 352 351 350 349 347
  335 315 314 297 292 290 286 285 281 280 279 273
  258 211 153 136 135 134 133 127 126 123 122 116
)

REPO="audiocontrol-org/deskwork"

for num in "${DW_LIFECYCLE_ISSUES[@]}"; do
  echo "Closing issue $num..."
  gh issue close "$num" --repo "$REPO" --comment "$COMMENT"
done

echo "Done. Closed ${#DW_LIFECYCLE_ISSUES[@]} issues."
