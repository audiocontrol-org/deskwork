#!/usr/bin/env bash
# FR-011 anti-coupling gate (document-primitives).
#
# Asserts the shipped product MECHANISM contains zero references to the
# predecessor lifecycle plugin. Release-blocking: a hit exits non-zero.
#
# Match    : the single literal whole token `dw-lifecycle` (predecessor plugin
#            name == CLI binary == skill-namespace prefix), case-insensitive,
#            word-boundary so it never matches "lifecycle" inside
#            "pluggable-lifecycle-providers" or "stack-control" prose.
# Scope    : engine code, the verb modules, skill bodies, grammars, fixtures.
# Excluded : the two proof documents (ROADMAP.md, DESIGN-INBOX.md) — governed
#            content that legitimately names the predecessor as lineage.
#
# Usage:
#   check-no-predecessor-refs.sh [--scan-root <dir>]
#     --scan-root <dir>  Root to scan (default: the stack-control plugin dir).
#                        Tests point this at a tmp tree.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCAN_ROOT="$SCRIPT_DIR/../plugins/stack-control"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scan-root)
      SCAN_ROOT="${2:-}"
      if [[ -z "$SCAN_ROOT" ]]; then
        echo "check-no-predecessor-refs: --scan-root requires a directory" >&2
        exit 2
      fi
      shift 2
      ;;
    *)
      echo "check-no-predecessor-refs: unexpected argument '$1'" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$SCAN_ROOT" ]]; then
  echo "check-no-predecessor-refs: scan root not found: $SCAN_ROOT" >&2
  exit 2
fi

# FR-011 scan scope, relative to SCAN_ROOT. Missing dirs are skipped (a tmp
# fixture tree need not contain all of them).
SCOPE=(
  "src/document-model"
  "src/subcommands/archive.ts"
  "src/subcommands/unarchive.ts"
  "src/subcommands/curate.ts"
  "skills/archive"
  "skills/unarchive"
  "skills/curate"
  "grammars"
  "tests/document-primitives/fixtures"
)

targets=()
for rel in "${SCOPE[@]}"; do
  p="$SCAN_ROOT/$rel"
  [[ -e "$p" ]] && targets+=("$p")
done

if [[ ${#targets[@]} -eq 0 ]]; then
  # Nothing in scope to scan — vacuously clean.
  exit 0
fi

# Whole-token, case-insensitive. POSIX-ERE boundary: a non-alphanumeric (or
# start/end) must flank the token. `-` is not [:alnum:], so the token's own
# hyphen is fine, while `pluggable-lifecycle` (no `dw-` prefix) cannot match.
PATTERN='(^|[^[:alnum:]])dw-lifecycle([^[:alnum:]]|$)'

# Exclude the two proof documents by basename.
hits="$(grep -rniIE \
  --exclude='ROADMAP.md' \
  --exclude='DESIGN-INBOX.md' \
  -- "$PATTERN" "${targets[@]}" 2>/dev/null || true)"

if [[ -n "$hits" ]]; then
  echo "check-no-predecessor-refs: FR-011 violation — predecessor references found:" >&2
  echo "$hits" >&2
  exit 1
fi

exit 0
