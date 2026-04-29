#!/usr/bin/env bash
#
# materialize-vendor.sh — replace plugin vendor/core symlinks with
# directory copies of packages/core/, then verify the copy is byte-
# identical to the source via diff -r.
#
# Why: at marketplace install time, Claude Code clones the repo and
# copies plugins/<name>/ into its plugin cache. Committed symlinks
# survive the clone, but the relative target (../../../packages/core)
# traverses out of the copied subtree and resolves to a non-existent
# path on the operator's side. Replacing the symlink with the actual
# directory contents makes the plugin tree self-contained.
#
# Run by the release workflow (.github/workflows/release.yml) after
# tests pass and before the tag is re-pointed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/packages/core"

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "materialize-vendor: source directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

PLUGINS=(deskwork deskwork-studio)

for plugin in "${PLUGINS[@]}"; do
  vendor_link="${REPO_ROOT}/plugins/${plugin}/vendor/core"
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
    "${SOURCE_DIR}/" "${vendor_link}/"
  # diff -r catches drift between source and copy (excluded paths
  # don't appear because rsync didn't copy them, and the source tree
  # is checked in clean by CI).
  if ! diff -r \
    --exclude=node_modules \
    --exclude=.turbo \
    --exclude=dist \
    --exclude='*.tsbuildinfo' \
    "${SOURCE_DIR}" "${vendor_link}" > /tmp/materialize-vendor-diff.log; then
    echo "materialize-vendor: diff -r failed for ${plugin} — copy is not identical to source" >&2
    cat /tmp/materialize-vendor-diff.log >&2
    exit 1
  fi
  echo "materialize-vendor: ${plugin}/vendor/core verified against ${SOURCE_DIR}"
done

echo "materialize-vendor: done"
