#!/usr/bin/env bash
#
# materialize-vendor.sh — replace each plugin's vendor/<package>
# symlinks with directory copies of the corresponding packages/<package>/,
# then verify the copies are byte-identical to source via diff -r AND
# mode-bit-identical via a stat-based comparison.
#
# Why: at marketplace install time, Claude Code clones the repo and
# copies plugins/<name>/ into its plugin cache. Committed symlinks
# survive the clone, but the relative target (../../../packages/<pkg>)
# traverses out of the copied subtree and resolves to a non-existent
# path on the operator's side. Replacing the symlink with the actual
# directory contents makes the plugin tree self-contained.
#
# Per-plugin vendored packages (Phase 23b/23c, plus cli-bin-lib):
#   plugins/deskwork-studio/vendor/core         → packages/core
#   plugins/deskwork-studio/vendor/studio       → packages/studio
#   plugins/deskwork-studio/vendor/cli-bin-lib  → packages/cli-bin-lib
#   plugins/deskwork/vendor/core                → packages/core
#   plugins/deskwork/vendor/cli                 → packages/cli
#   plugins/deskwork/vendor/cli-bin-lib         → packages/cli-bin-lib
#
# Run by the release workflow (.github/workflows/release.yml) after
# tests pass and before the tag is re-pointed.
#
# Verification:
#   - Content: diff -r catches any byte-level drift between source and
#     copy (excluded paths don't appear because rsync didn't copy them).
#   - Mode bits: a stat-based comparison catches +x/perm drift that
#     diff -r is content-only and would silently miss. Ownership is
#     intentionally NOT compared — when run as non-root in local dev,
#     ownership comparisons spuriously fail. The marketplace install
#     drops the tarball under the operator's UID anyway.
#
# Symlink-traversal guard:
#   Before rsync, every symlink in the source tree is resolved and its
#   resolved path verified to stay within source_dir. Absolute targets
#   are rejected outright. Relative targets that escape the source
#   tree are rejected. This prevents shipping a tarball with a dangling
#   or directory-traversal-laden symlink that would only surface on
#   the adopter's side.
#
# Portability:
#   - stat: BSD (macOS) and GNU (Linux) have incompatible flags. We
#     detect which is available at startup and pick the right format
#     string. Both produce mode bits + path lines.
#   - readlink: we use only the no-flag form, which is portable.
#     readlink -f is GNU-only and we don't need it — we canonicalize
#     manually.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# (plugin, vendored-name) pairs. Each entry maps to a vendor symlink at
# plugins/<plugin>/vendor/<vendored-name> with source at
# packages/<vendored-name>/.
VENDOR_PAIRS=(
  "deskwork-studio:core"
  "deskwork-studio:studio"
  "deskwork-studio:cli-bin-lib"
  "deskwork:core"
  "deskwork:cli"
  "deskwork:cli-bin-lib"
)

# Detect stat flavor once, up front. BSD stat (macOS) supports -f "%Lp",
# GNU stat (Linux) supports -c "%a". %Lp gives octal perms with leading
# zeros stripped to match %a behavior.
if stat -f "%Lp" /dev/null >/dev/null 2>&1; then
  STAT_FLAVOR="bsd"
elif stat -c "%a" /dev/null >/dev/null 2>&1; then
  STAT_FLAVOR="gnu"
else
  echo "materialize-vendor: cannot detect stat flavor (neither BSD -f nor GNU -c worked)" >&2
  exit 1
fi

# stat_mode_listing <dir>
#   Emits "<octal-perms> <relative-path>" lines for every regular file
#   under <dir>, sorted, with <dir>'s prefix stripped so two listings
#   from different roots line up for diff. Excludes the same paths
#   rsync skips (node_modules / .turbo / dist / *.tsbuildinfo) at find
#   time via -prune, so the source-side listing matches the vendor
#   side regardless of whether the source has been npm-installed.
stat_mode_listing() {
  local dir="$1"
  local prefix="${dir%/}/"
  if [ "${STAT_FLAVOR}" = "bsd" ]; then
    find "${dir}" \
      \( -name node_modules -o -name .turbo -o -name dist \) -prune -o \
      -type f ! -name '*.tsbuildinfo' -print0 \
      | xargs -0 stat -f "%Lp %N" \
      | awk -v p="${prefix}" '{
          mode=$1
          $1=""
          sub(/^ /, "")
          sub("^"p, "")
          print mode, $0
        }' \
      | sort
  else
    find "${dir}" \
      \( -name node_modules -o -name .turbo -o -name dist \) -prune -o \
      -type f ! -name '*.tsbuildinfo' -print0 \
      | xargs -0 stat -c "%a %n" \
      | awk -v p="${prefix}" '{
          mode=$1
          $1=""
          sub(/^ /, "")
          sub("^"p, "")
          print mode, $0
        }' \
      | sort
  fi
}

# canonicalize_relative <link_path> <literal_target>
#   Resolve <literal_target> against <link_path>'s parent directory and
#   collapse it to an absolute, .. -free path WITHOUT requiring readlink
#   -f or realpath (both are non-portable in their flag spelling). We
#   use the parent's pwd -P and a small awk pass to fold .. and . away.
#   stdout: the canonicalized absolute path.
canonicalize_relative() {
  local link_path="$1"
  local literal_target="$2"
  local parent
  parent="$(cd "$(dirname "${link_path}")" && pwd -P)"
  # Combine parent + target, then collapse . and .. components.
  local combined="${parent}/${literal_target}"
  printf '%s' "${combined}" | awk -F/ '{
    n=0
    for (i=1; i<=NF; i++) {
      seg=$i
      if (seg == "" || seg == ".") continue
      if (seg == "..") {
        if (n > 0) n--
        continue
      }
      n++
      out[n]=seg
    }
    s=""
    for (i=1; i<=n; i++) s=s "/" out[i]
    if (s == "") s="/"
    print s
  }'
}

# guard_symlinks <source_dir>
#   Walk every symlink under source_dir. Fail if any link target is
#   absolute, or if its resolved path escapes source_dir.
guard_symlinks() {
  local source_dir="$1"
  local source_canon
  source_canon="$(cd "${source_dir}" && pwd -P)"
  local link target resolved
  # NUL-delimited so paths with spaces survive.
  while IFS= read -r -d '' link; do
    target="$(readlink "${link}")"
    case "${target}" in
      /*)
        echo "materialize-vendor: symlink at ${link} escapes source tree (target: ${target}) — refusing to materialize" >&2
        echo "materialize-vendor: absolute symlink targets are not allowed in vendored packages" >&2
        return 1
        ;;
    esac
    resolved="$(canonicalize_relative "${link}" "${target}")"
    case "${resolved}" in
      "${source_canon}"|"${source_canon}"/*)
        : # in-tree; allowed
        ;;
      *)
        echo "materialize-vendor: symlink at ${link} escapes source tree (target: ${target}) — refusing to materialize" >&2
        echo "materialize-vendor: resolved path: ${resolved}" >&2
        echo "materialize-vendor: source root:   ${source_canon}" >&2
        return 1
        ;;
    esac
  done < <(find "${source_dir}" -type l -print0)
}

# materialize_one <source_dir> <vendor_link>
#   1. Validate source_dir exists and vendor_link is a symlink.
#   2. Run the symlink-traversal guard against source_dir.
#   3. rsync source_dir/ → vendor_link/ (after rm of the symlink).
#   4. Verify content via diff -r.
#   5. Verify mode bits via stat-based listing diff.
#   Exits non-zero on any failure with a clear message.
materialize_one() {
  local source_dir="$1"
  local vendor_link="$2"

  if [ ! -d "${source_dir}" ]; then
    echo "materialize-vendor: source directory not found: ${source_dir}" >&2
    return 1
  fi
  if [ ! -L "${vendor_link}" ]; then
    echo "materialize-vendor: expected symlink at ${vendor_link} (got: $(ls -ld "${vendor_link}" 2>/dev/null || echo missing))" >&2
    return 1
  fi

  echo "materialize-vendor: scanning ${source_dir} for unsafe symlinks"
  guard_symlinks "${source_dir}" || return 1

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

  # Content verification.
  local diff_log
  diff_log="$(mktemp -t materialize-vendor-diff.XXXXXX)"
  if ! diff -r \
    --exclude=node_modules \
    --exclude=.turbo \
    --exclude=dist \
    --exclude='*.tsbuildinfo' \
    "${source_dir}" "${vendor_link}" > "${diff_log}"; then
    echo "materialize-vendor: diff -r failed for ${vendor_link} — copy is not identical to source" >&2
    cat "${diff_log}" >&2
    rm -f "${diff_log}"
    return 1
  fi
  rm -f "${diff_log}"

  # Mode-bit verification. diff -r above is content-only; we also need
  # to catch +x bit drift on scripts and any other perm changes rsync
  # might (in theory) miss.
  local src_modes dst_modes mode_diff
  src_modes="$(mktemp -t materialize-vendor-srcmodes.XXXXXX)"
  dst_modes="$(mktemp -t materialize-vendor-dstmodes.XXXXXX)"
  mode_diff="$(mktemp -t materialize-vendor-modediff.XXXXXX)"

  # stat_mode_listing already prunes the same paths rsync excludes, so
  # the source listing matches the vendor side even when the source
  # tree has been npm-installed (CI's case: node_modules + vitest
  # cache populated before materialize-vendor runs).
  stat_mode_listing "${source_dir}" > "${src_modes}"
  stat_mode_listing "${vendor_link}" > "${dst_modes}"

  if ! diff -u "${src_modes}" "${dst_modes}" > "${mode_diff}"; then
    echo "materialize-vendor: mode-bit drift between ${source_dir} and ${vendor_link}" >&2
    echo "materialize-vendor: --- source modes / +++ vendor modes" >&2
    cat "${mode_diff}" >&2
    rm -f "${src_modes}" "${dst_modes}" "${mode_diff}"
    return 1
  fi
  rm -f "${src_modes}" "${dst_modes}" "${mode_diff}"

  echo "materialize-vendor: ${vendor_link} verified against ${source_dir} (content + mode)"
}

# materialize_vendor_pairs <tree_root> <pair...>
#   Iterate "<plugin>:<pkg>" pairs, resolving source/dest paths under
#   <tree_root> rather than the canonical REPO_ROOT, and call
#   materialize_one for each. Used by both the entry-point loop below
#   (with tree_root=REPO_ROOT) and scripts/smoke-marketplace.sh (with
#   tree_root pointing at an extracted tarball under /tmp/<tree>) so
#   the smoke and release runs use exactly the same materialization
#   code path — including the symlink-traversal guard and the
#   mode-bit verification.
materialize_vendor_pairs() {
  local tree_root="$1"
  shift
  local pair plugin pkg source_dir vendor_link
  for pair in "$@"; do
    plugin="${pair%%:*}"
    pkg="${pair#*:}"
    source_dir="${tree_root}/packages/${pkg}"
    vendor_link="${tree_root}/plugins/${plugin}/vendor/${pkg}"
    materialize_one "${source_dir}" "${vendor_link}" || return 1
  done
}

# Only iterate the pairs when this script is the entry point. When it's
# sourced (by the test script or by smoke-marketplace.sh), we just
# expose the functions above.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  materialize_vendor_pairs "${REPO_ROOT}" "${VENDOR_PAIRS[@]}"
  echo "materialize-vendor: done"
fi
