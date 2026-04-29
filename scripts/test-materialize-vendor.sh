#!/usr/bin/env bash
#
# test-materialize-vendor.sh — local-only smoke verification for
# scripts/materialize-vendor.sh (issue #78).
#
# Three tests, each on a freshly-rigged tmp source tree and a tmp
# vendor symlink that points at it:
#
#   Test A: chmod +x a stub script in source. Materialize. Assert the
#           +x bit survives end-to-end (verified via the same stat
#           listing the script uses internally).
#   Test B: place a symlink in source that points outside source
#           (via ../../../../etc/passwd). Run materialize_one. Assert
#           it fails with the symlink-traversal error.
#   Test C: place an in-tree symlink (link → file.txt in same dir).
#           Run materialize_one. Assert success and that the
#           materialized tree contains the symlink with same target.
#
# Local-only — not wired into CI per .claude/rules/agent-discipline.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Source the materialize script so we can call materialize_one and
# stat_mode_listing directly with rigged tmp arguments.
# shellcheck source=./materialize-vendor.sh
. "${SCRIPT_DIR}/materialize-vendor.sh"

if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_OFF=$'\033[0m'
else
  C_GREEN=''; C_RED=''; C_BOLD=''; C_OFF=''
fi

ok()    { printf '%s[ok]%s   %s\n' "$C_GREEN" "$C_OFF" "$1"; }
fail()  { printf '%s[fail]%s %s\n' "$C_RED"   "$C_OFF" "$1"; }
info()  { printf '%s[info]%s %s\n' "$C_BOLD"  "$C_OFF" "$1"; }

TMP="$(mktemp -d -t test-materialize-vendor.XXXXXX)"
FAILURES=0

cleanup() {
  if [ "${KEEP_TMP:-}" = "1" ]; then
    info "KEEP_TMP=1 — leaving tmp at ${TMP}"
  else
    rm -rf "${TMP}"
  fi
}
trap cleanup EXIT INT TERM

info "tmp root: ${TMP}"

# make_source_tree <dir>
#   Creates a minimal source tree with a normal file, a script with
#   +x set, and a nested subdir. Caller can add wrinkles on top.
make_source_tree() {
  local dir="$1"
  mkdir -p "${dir}/sub"
  printf 'hello\n' > "${dir}/file.txt"
  printf 'world\n' > "${dir}/sub/nested.txt"
  printf '#!/usr/bin/env bash\necho hi\n' > "${dir}/run.sh"
  chmod +x "${dir}/run.sh"
}

# rig_vendor_link <source_dir> <vendor_link_path>
#   Create the vendor symlink at <vendor_link_path> pointing at
#   <source_dir>. (materialize_one expects vendor_link to be a
#   symlink; the actual target it resolves to is irrelevant — it
#   just gets rm'd.)
rig_vendor_link() {
  local source_dir="$1"
  local vendor_link="$2"
  mkdir -p "$(dirname "${vendor_link}")"
  ln -s "${source_dir}" "${vendor_link}"
}

# ----- Test A: +x bit preserved end-to-end -------------------------------

test_a_exec_bit_preserved() {
  info "Test A: +x bit preserved through materialize"
  local src="${TMP}/a-src"
  local link="${TMP}/a-vendor/pkg"
  make_source_tree "${src}"
  rig_vendor_link "${src}" "${link}"

  if ! materialize_one "${src}" "${link}" >"${TMP}/a.log" 2>&1; then
    fail "Test A: materialize_one failed unexpectedly"
    cat "${TMP}/a.log" >&2
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Check the materialized tree: run.sh should still be +x.
  if [ ! -x "${link}/run.sh" ]; then
    fail "Test A: run.sh in materialized tree is not executable"
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Cross-check via the stat listing — both should show identical mode
  # for run.sh. (materialize_one already enforces this internally; we
  # re-verify here to make the test self-evidencing.)
  local src_mode dst_mode
  src_mode="$(stat_mode_listing "${src}" | awk '$2=="run.sh"{print $1}')"
  dst_mode="$(stat_mode_listing "${link}" | awk '$2=="run.sh"{print $1}')"
  if [ -z "${src_mode}" ] || [ "${src_mode}" != "${dst_mode}" ]; then
    fail "Test A: run.sh mode bits drifted (src=${src_mode}, dst=${dst_mode})"
    FAILURES=$((FAILURES + 1))
    return
  fi

  ok "Test A: run.sh +x bit preserved (mode ${src_mode})"
}

# ----- Test B: symlink escaping source is rejected -----------------------

test_b_symlink_traversal_rejected() {
  info "Test B: symlink escaping source tree is rejected"
  local src="${TMP}/b-src"
  local link="${TMP}/b-vendor/pkg"
  make_source_tree "${src}"
  # Place an escaping symlink in source. Target is intentionally a
  # path that climbs out of src (../../../../etc/passwd).
  ln -s "../../../../etc/passwd" "${src}/danger"
  rig_vendor_link "${src}" "${link}"

  if materialize_one "${src}" "${link}" >"${TMP}/b.log" 2>&1; then
    fail "Test B: materialize_one succeeded but should have rejected the escaping symlink"
    cat "${TMP}/b.log" >&2
    FAILURES=$((FAILURES + 1))
    return
  fi

  if ! grep -q "escapes source tree" "${TMP}/b.log"; then
    fail "Test B: expected 'escapes source tree' in error output"
    cat "${TMP}/b.log" >&2
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Vendor link should still exist as a symlink — we should have
  # bailed BEFORE the rm step.
  if [ ! -L "${link}" ]; then
    fail "Test B: vendor link was removed despite guard rejection (rm happened before guard?)"
    FAILURES=$((FAILURES + 1))
    return
  fi

  ok "Test B: escaping symlink rejected, vendor link untouched"
}

# ----- Test C: in-tree symlink preserved ---------------------------------

test_c_intree_symlink_preserved() {
  info "Test C: in-tree symlink preserved through materialize"
  local src="${TMP}/c-src"
  local link="${TMP}/c-vendor/pkg"
  make_source_tree "${src}"
  # In-tree symlink: link → file.txt in the same dir.
  ln -s "file.txt" "${src}/alias"
  rig_vendor_link "${src}" "${link}"

  if ! materialize_one "${src}" "${link}" >"${TMP}/c.log" 2>&1; then
    fail "Test C: materialize_one failed against safe in-tree symlink"
    cat "${TMP}/c.log" >&2
    FAILURES=$((FAILURES + 1))
    return
  fi

  if [ ! -L "${link}/alias" ]; then
    fail "Test C: alias is not a symlink in materialized tree"
    FAILURES=$((FAILURES + 1))
    return
  fi

  local materialized_target
  materialized_target="$(readlink "${link}/alias")"
  if [ "${materialized_target}" != "file.txt" ]; then
    fail "Test C: alias target drifted (expected 'file.txt', got '${materialized_target}')"
    FAILURES=$((FAILURES + 1))
    return
  fi

  ok "Test C: in-tree symlink preserved with target 'file.txt'"
}

# ----- Test D: canonicalize_relative direct unit tests -------------------
#
# Code-reviewer finding: canonicalize_relative is the engine of the
# symlink-traversal guard. Tests A–C exercise it indirectly via
# materialize_one. Tests below pin its behavior on edge cases where the
# guard's correctness depends entirely on canonicalization being right:
# `.` and `//` collapse, `..` traversal, escaping above the parent, and
# the cap-at-root behavior when `..` exceeds parent depth.
#
# Setup: pretend the link lives at <parent>/link. canonicalize_relative
# resolves <literal_target> against <parent>'s pwd -P. We rig <parent>
# under TMP so escapes are distinguishable from the system's /etc.

test_d_canonicalize_relative_cases() {
  info "Test D: canonicalize_relative edge cases"
  local parent="${TMP}/d-parent"
  local link="${parent}/link"
  mkdir -p "${parent}"
  # The link doesn't have to actually exist for canonicalize_relative —
  # only its parent dir is consulted via dirname + cd. Touch it so the
  # arrangement matches reality.
  : > "${link}"

  # Resolve parent itself via the same `cd … && pwd -P` the function uses,
  # so on macOS where /tmp is a symlink to /private/tmp the expected
  # values line up with what the function returns.
  local parent_canon
  parent_canon="$(cd "${parent}" && pwd -P)"

  local got expected case_label fails=0

  _check() {
    local label="$1"; local target="$2"; local want="$3"
    local g
    g="$(canonicalize_relative "${link}" "${target}")"
    if [ "${g}" = "${want}" ]; then
      ok "  D.${label}: '${target}' -> '${g}'"
    else
      fail "  D.${label}: '${target}' -> '${g}' (want '${want}')"
      fails=$((fails + 1))
    fi
  }

  # 1. './foo' -> resolves under parent
  _check "1-dot-foo"     "./foo"        "${parent_canon}/foo"
  # 2. '../../foo' -> two levels above parent
  local p_up1 p_up2
  p_up1="$(dirname "${parent_canon}")"
  p_up2="$(dirname "${p_up1}")"
  _check "2-up-up-foo"   "../../foo"    "${p_up2}/foo"
  # 3. './../../foo' -> equivalent to '../../foo'
  _check "3-dot-up-up"   "./../../foo"  "${p_up2}/foo"
  # 4. 'foo/./bar' -> parent/foo/bar
  _check "4-mid-dot"     "foo/./bar"    "${parent_canon}/foo/bar"
  # 5. 'foo//bar' -> parent/foo/bar (double slash collapses)
  _check "5-double-slash" "foo//bar"    "${parent_canon}/foo/bar"
  # 6. '..' (single) -> one level above parent (just parent's parent)
  _check "6-up"          ".."           "${p_up1}"
  # 7. excess '..' beyond root cap-at-root behavior. We pop until n=0
  #    then stop. Parent depth N means N..-pops collapse to "/", which
  #    the function emits as the literal string "/" via the trailing
  #    fallback. We assert THAT behavior — the symlink guard doesn't
  #    rely on detecting "/" as an error, but it does rely on the path
  #    not getting silently pinned at parent_canon. "/" is well-defined
  #    and unequal to ${source_canon}, so the guard correctly rejects.
  #    Build a target with way more ..'s than parent has segments.
  local many_ups="../../../../../../../../../../../../../../../../foo"
  got="$(canonicalize_relative "${link}" "${many_ups}")"
  case "${got}" in
    /foo|/) ok "  D.7-cap-at-root: '${many_ups}' -> '${got}' (capped at root)" ;;
    *)
      fail "  D.7-cap-at-root: '${many_ups}' -> '${got}' (expected '/foo' or '/')"
      fails=$((fails + 1))
      ;;
  esac
  # 8. '../etc/passwd' from a tmp-rooted parent -> resolves to
  #    parent_canon's parent + /etc/passwd. This is the core escape
  #    detection case: the resolved path must NOT start with parent_canon,
  #    so the guard's case-statement match correctly rejects it.
  _check "8-escape-etc"  "../etc/passwd" "${p_up1}/etc/passwd"

  if [ "${fails}" -gt 0 ]; then
    FAILURES=$((FAILURES + fails))
    return
  fi
  ok "Test D: all canonicalize_relative cases passed"
}

# ----- Test E: source with node_modules verifies cleanly ----------------
#
# Regression for v0.9.0 release-workflow failure: CI's checkout has
# `npm install` + `npm test` populated by the time materialize runs,
# so packages/<pkg>/ contains node_modules/.vite/vitest/<hash>/results.json
# (and similar). The vendor copy excludes node_modules per rsync's
# --exclude. The mode-bit listing must apply the SAME exclusion at find
# time, otherwise the source listing has a node_modules/... line the
# vendor side doesn't, and the diff -u fails.

test_e_source_with_node_modules() {
  info "Test E: source with node_modules + dist + .turbo verifies cleanly"
  local src="${TMP}/e-src"
  local link="${TMP}/e-vendor/pkg"
  make_source_tree "${src}"
  # Populate the same junk drawers CI does. Different perms on each
  # to force a real mode-bit divergence if the prune isn't working.
  mkdir -p "${src}/node_modules/.vite/vitest/aaaa"
  printf '{"results":[]}\n' > "${src}/node_modules/.vite/vitest/aaaa/results.json"
  chmod 600 "${src}/node_modules/.vite/vitest/aaaa/results.json"
  mkdir -p "${src}/dist"
  printf 'compiled\n' > "${src}/dist/build-output.js"
  chmod 600 "${src}/dist/build-output.js"
  mkdir -p "${src}/.turbo"
  printf 'cache\n' > "${src}/.turbo/cache-key"
  : > "${src}/built.tsbuildinfo"
  chmod 600 "${src}/built.tsbuildinfo"
  rig_vendor_link "${src}" "${link}"

  if ! materialize_one "${src}" "${link}" >"${TMP}/e.log" 2>&1; then
    fail "Test E: materialize_one failed when source has node_modules + dist + .turbo"
    cat "${TMP}/e.log" >&2
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Vendor copy should NOT contain any of the excluded paths.
  for excluded in node_modules dist .turbo built.tsbuildinfo; do
    if [ -e "${link}/${excluded}" ]; then
      fail "Test E: vendor copy contains excluded path '${excluded}'"
      FAILURES=$((FAILURES + 1))
      return
    fi
  done

  ok "Test E: source with node_modules / dist / .turbo / *.tsbuildinfo verifies cleanly"
}

# ----- Run --------------------------------------------------------------

test_a_exec_bit_preserved
test_b_symlink_traversal_rejected
test_c_intree_symlink_preserved
test_d_canonicalize_relative_cases
test_e_source_with_node_modules

echo
if [ "${FAILURES}" -gt 0 ]; then
  fail "${FAILURES} test(s) failed"
  exit 1
fi
ok "all materialize-vendor tests passed"
