#!/usr/bin/env bash
#
# materialize-vendor.sh — replace each plugin's vendor/<package>
# symlinks with directory copies of the corresponding packages/<package>/,
# then verify the copies are byte-identical to source via diff -r.
#
# Why: at marketplace install time, Claude Code clones the repo and
# copies plugins/<name>/ into its plugin cache. Committed symlinks
# survive the clone, but the relative target (../../../packages/<pkg>)
# traverses out of the copied subtree and resolves to a non-existent
# path on the operator's side. Replacing the symlink with the actual
# directory contents makes the plugin tree self-contained.
#
# Per-plugin vendored packages (Phase 23b/23c):
#   plugins/deskwork-studio/vendor/core    → packages/core
#   plugins/deskwork-studio/vendor/studio  → packages/studio
#   plugins/deskwork/vendor/core           → packages/core
#   plugins/deskwork/vendor/cli            → packages/cli
#
# Run by the release workflow (.github/workflows/release.yml) after
# tests pass and before the tag is re-pointed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# (plugin, vendored-name) pairs. Each entry maps to a vendor symlink at
# plugins/<plugin>/vendor/<vendored-name> with source at
# packages/<vendored-name>/.
VENDOR_PAIRS=(
  "deskwork-studio:core"
  "deskwork-studio:studio"
  "deskwork:core"
  "deskwork:cli"
)

for pair in "${VENDOR_PAIRS[@]}"; do
  plugin="${pair%%:*}"
  pkg="${pair#*:}"
  source_dir="${REPO_ROOT}/packages/${pkg}"
  vendor_link="${REPO_ROOT}/plugins/${plugin}/vendor/${pkg}"

  if [ ! -d "${source_dir}" ]; then
    echo "materialize-vendor: source directory not found: ${source_dir}" >&2
    exit 1
  fi
  if [ ! -L "${vendor_link}" ]; then
    echo "materialize-vendor: expected symlink at ${vendor_link} (got: $(ls -ld "${vendor_link}" 2>/dev/null || echo missing))" >&2
    exit 1
  fi

  echo "materialize-vendor: materializing ${vendor_link}"
  rm "${vendor_link}"
  # -a preserves perms/links; we exclude node_modules and any nested
  # build state so the copy is the source-of-truth tree only.
  rsync -a \
    --exclude 'node_modules' \
    --exclude '.turbo' \
    --exclude 'dist' \
    --exclude '*.tsbuildinfo' \
    "${source_dir}/" "${vendor_link}/"
  # diff -r catches drift between source and copy (excluded paths
  # don't appear because rsync didn't copy them, and the source tree
  # is checked in clean by CI).
  if ! diff -r \
    --exclude=node_modules \
    --exclude=.turbo \
    --exclude=dist \
    --exclude='*.tsbuildinfo' \
    "${source_dir}" "${vendor_link}" > /tmp/materialize-vendor-diff.log; then
    echo "materialize-vendor: diff -r failed for ${plugin}/vendor/${pkg} — copy is not identical to source" >&2
    cat /tmp/materialize-vendor-diff.log >&2
    exit 1
  fi
  echo "materialize-vendor: ${plugin}/vendor/${pkg} verified against ${source_dir}"
done

echo "materialize-vendor: done"
