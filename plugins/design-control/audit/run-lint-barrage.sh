#!/usr/bin/env bash
# Assemble + fire the design-control lo-fi-lint adversarial barrage.
#
# LEVEL 1 (dev-time): this validates OUR lint implementation by firing the
# dw-lifecycle audit-barrage cross-model at the lint source with the committed
# adversarial prompt. It is NOT the product's design referee (that is the
# Level-2 cross-model design-review barrage over a rendered surface).
#
# Re-run after any change to plugins/design-control/src/lint/*.ts. Triage the
# per-model outputs in the printed run-dir via the audit protocol: every genuine
# defeat -> lint fix + deterministic vitest fixture + `dw-lifecycle scope-widen`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HEADER=plugins/design-control/audit/lint-adversarial-prompt.md
PROMPT=$(mktemp)
trap 'rm -f "$PROMPT"' EXIT

cat "$HEADER" > "$PROMPT"
printf '\n\n===== LIVE LINT SOURCE (read-only, current) =====\n' >> "$PROMPT"
for f in types allowlist codepoint stylesheet-pin check-mockup-lofi; do
  printf '\n----- plugins/design-control/src/lint/%s.ts -----\n' "$f" >> "$PROMPT"
  cat "plugins/design-control/src/lint/$f.ts" >> "$PROMPT"
done

dw-lifecycle audit-barrage --feature design-control --prompt-file "$PROMPT" "$@"
