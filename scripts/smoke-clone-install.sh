#!/usr/bin/env bash
#
# smoke-clone-install.sh — install-path coverage helpers for
# scripts/smoke-marketplace.sh. Sourced by the main smoke; not an entry
# point.
#
# Why this file exists (Issue #90):
#   The original smoke used `git archive HEAD plugins/<plugin> packages/
#   | tar -x` to materialize the install payload. That extraction does
#   not match Claude Code's real marketplace install path on two
#   dimensions:
#
#     1. Workspace-root visibility. Real install does `git clone` of
#        the full marketplace repo, so npm install inside
#        plugins/<plugin>/ walks UP and runs the workspace-root
#        `prepare` script. The archive-extracted tree had no root
#        package.json, so the walk-up never happened — the v0.9.4
#        `prepare: husky` --omit=dev failure was invisible.
#
#     2. Vendor symlink behavior. Real install for a `git-subdir`
#        source sparse-clones JUST the plugin path. Committed vendor
#        symlinks dangle (their relative target traverses out of the
#        sparse-checkout). The old smoke materialized symlinks
#        locally before testing, so #88's empty-vendor failure was
#        invisible.
#
#   This helper drives both install shapes via real `git clone`:
#
#     phase_a_marketplace_read — full clone of release-source HEAD;
#       mirrors Claude Code's marketplace.json read step and validates
#       the catalog itself (every plugin entry parses + names a usable
#       source). Cheap pre-flight before phase B.
#
#     phase_b_per_source — for each plugin, branch on the source
#       declared in marketplace.json:
#         relative-path → copy plugins/<plugin>/ from REPO_ROOT
#                          (UNMATERIALIZED). Vendor symlinks dangle
#                          because packages/ doesn't ride along —
#                          this is the #88 install-blocker shape.
#         git-subdir    → cone-mode sparse-clone of plugins/<plugin>/
#                          from the release-source (vendor MATERIALIZED).
#                          Cone mode includes root-level files
#                          (workspace package.json) — this is the
#                          husky walk-up shape that hit operators in
#                          v0.9.4.
#       Then run the bin wrapper. The wrapper's first-run
#       `npm install --omit=dev` is what surfaces the bugs above.
#
# Inputs:
#   REPO_ROOT — set by the main smoke before sourcing.
#   TMP      — set by the main smoke (cleanup root).
#
# Side effects:
#   Appends to FAILURES (defined in main smoke). Does not exit on
#   per-phase failure; the main smoke aggregates and decides exit code.

set -euo pipefail

# Logging shims. The main smoke defines `info`, `ok`, `fail`, `warn`,
# `dim`. If we're sourced before they exist (defensive), fall back to
# plain printf so the helpers still work in standalone debug.
if ! command -v info >/dev/null 2>&1; then
  info()  { printf '[info] %s\n' "$1"; }
  ok()    { printf '[ok]   %s\n' "$1"; }
  fail()  { printf '[fail] %s\n' "$1" >&2; }
  warn()  { printf '[warn] %s\n' "$1" >&2; }
  dim()   { printf '       %s\n' "$1"; }
fi

# build_release_source_clone <dest>
#
# Clone REPO_ROOT into <dest> with all branches + tags, then run
# scripts/materialize-vendor.sh inside the clone and commit the result.
# The output is a git repo whose HEAD represents the materialized
# release state — the same shape the release workflow tags on GitHub.
#
# Why a clone-and-commit rather than running materialize-vendor on
# REPO_ROOT directly: the working tree must stay clean between smoke
# runs (the operator may iterate). Mutating REPO_ROOT's vendor/
# symlinks would break dev. Cloning isolates the materialization to
# a throwaway tree that subsequent clones can fetch from via
# file://<dest>.
#
# We do NOT push or tag; the materialization commit lives only in
# this temp clone. Phase B clones using the commit SHA / branch from
# this clone, not via tag — which is fine because the only thing we
# care about for the smoke is the materialized vendor shape.
build_release_source_clone() {
  local dest="$1"
  info "building release-source clone at ${dest}"
  # --no-local opt-out: file:// URL forces git to use the wire protocol
  # rather than hardlink-by-default optimizations, so the clone is
  # representative of what `git clone <url>` would produce over the
  # network. We need this for Phase B's sparse-clone behavior.
  git clone --quiet "file://${REPO_ROOT}" "${dest}"
  ok "cloned REPO_ROOT into release-source"

  info "materializing vendor symlinks inside release-source clone"
  # Run the SAME materialize-vendor.sh code path the release uses,
  # but inside the clone. After this, vendor/<pkg> is a real
  # directory; sparse-clones from this repo will produce
  # self-contained plugin trees.
  ( cd "${dest}" && bash scripts/materialize-vendor.sh ) >/dev/null
  ok "materialized vendor symlinks in release-source"

  # Commit the materialization so subsequent clones from file://${dest}
  # see the materialized shape. Use a local-only identity so we don't
  # depend on the operator's git config being set in unusual ways.
  #
  # `git add -A` (NOT `commit -am`) is critical here. After
  # materialize-vendor.sh, git sees each `vendor/<pkg>` symlink as
  # DELETED (the symlink blob is gone) and the new directory contents
  # as UNTRACKED (rsync output isn't auto-tracked). `commit -am` only
  # stages tracked-file changes — it would commit the deletions and
  # leave the directory contents untracked, producing a release-source
  # tree where `vendor/<pkg>/` is absent entirely. `add -A` stages
  # both deletions AND untracked, which is what we need.
  (
    cd "${dest}"
    git add -A
    git -c user.email=smoke@deskwork.local \
        -c user.name=smoke \
        commit --quiet -m "smoke: materialize vendor for install simulation"
  )
  ok "committed materialized release-source"
}

# run_npm_install_at <dir>
#
# Run `npm install --omit=dev` at <dir> and return its exit code.
# Captures stderr to a temp file shown only on failure (keeps the
# success path quiet). Used by both phase_a and phase_b.
run_npm_install_at() {
  local dir="$1"
  local stderr_file
  stderr_file="$(mktemp -t smoke-npm-stderr.XXXXXX)"
  local rc=0
  ( cd "${dir}" && npm install --omit=dev --no-audit --no-fund --loglevel=error ) \
    2>"${stderr_file}" || rc=$?
  if [ "${rc}" -ne 0 ]; then
    fail "npm install --omit=dev failed in ${dir} (exit ${rc})"
    echo "----- captured stderr -----" >&2
    cat "${stderr_file}" >&2 || true
    echo "----- end stderr ----------" >&2
  fi
  rm -f "${stderr_file}"
  return "${rc}"
}

# run_bin_help_at <plugin_dir> <bin_name>
#
# Invoke <plugin_dir>/bin/<bin_name> --help. The bin wrapper does its
# own first-run `npm install` if node_modules is absent — this is the
# exact path Claude Code's install triggers when the operator first
# invokes a slash command that backs onto the bin.
#
# We do NOT pre-run npm install here; we want the bin wrapper to do
# it itself, so that any wrapper-level regressions surface (e.g.
# install-lock corruption, missing tsx, broken node version detection).
#
# We DO assert that the bin completes within a reasonable timeout —
# install-lock's first-run install can take 15-30s on a fresh tree
# but anything beyond a minute is a hang we should surface.
run_bin_help_at() {
  local plugin_dir="$1"
  local bin_name="$2"
  local bin_path="${plugin_dir}/bin/${bin_name}"
  if [ ! -x "${bin_path}" ]; then
    fail "bin wrapper not executable or missing: ${bin_path}"
    return 1
  fi
  local out_file
  out_file="$(mktemp -t smoke-bin-out.XXXXXX)"
  local rc=0
  # 120s ceiling: first-run install on a cold tree under load can take
  # 30-60s. 120s gives headroom but still surfaces a hang. We use the
  # `&` + `wait` pattern so SIGINT to the smoke is signal-interruptible
  # (bash's `wait` is a cancellation point).
  (
    cd "${plugin_dir}"
    "${bin_path}" --help
  ) >"${out_file}" 2>&1 &
  local bin_pid=$!
  local deadline=$(( $(date +%s) + 120 ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    if ! kill -0 "${bin_pid}" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if kill -0 "${bin_pid}" 2>/dev/null; then
    fail "${bin_name} --help did not exit within 120s (likely hang or first-run install stalled)"
    kill -TERM "${bin_pid}" 2>/dev/null || true
    sleep 1
    kill -KILL "${bin_pid}" 2>/dev/null || true
    rc=124
  else
    set +e
    wait "${bin_pid}"
    rc=$?
    set -e
  fi
  if [ "${rc}" -ne 0 ]; then
    fail "${bin_name} --help exited ${rc} in ${plugin_dir}"
    echo "----- captured output -----" >&2
    cat "${out_file}" >&2 || true
    echo "----- end output ----------" >&2
  fi
  rm -f "${out_file}"
  return "${rc}"
}

# phase_a_marketplace_read <release_source_repo>
#
# Sanity check on the marketplace.json read step: clone the FULL
# release-source repo at HEAD (mirrors Claude Code's marketplace.json
# read of the default branch) and assert marketplace.json parses and
# every plugin entry has a usable source spec. This is intentionally
# lightweight — we don't run bins here because Claude Code doesn't
# run bins from the marketplace clone either; it only reads the
# catalog. The bin install paths are exercised by phase_b_per_source.
#
# Why this matters: catches the failure mode where marketplace.json
# is itself malformed or points at non-existent paths. A bad ref
# in a git-subdir source would fail here AND in phase_b; a bad
# relative-path would also fail here AND in phase_b. Phase_b is the
# real test; this phase is just a faster-failing pre-flight against
# the catalog itself.
phase_a_marketplace_read() {
  local release_source="$1"
  local clone_dir="${TMP}/phase-a-marketplace"
  info "phase A (marketplace.json read) — full clone of release-source default branch"
  git clone --quiet --depth=1 "file://${release_source}" "${clone_dir}"
  ok "cloned full marketplace into ${clone_dir}"
  if [ ! -s "${clone_dir}/.claude-plugin/marketplace.json" ]; then
    fail "phase A: marketplace.json missing or empty in clone"
    FAILURES=$((FAILURES + 1))
    return 1
  fi
  # Validate every plugin entry has a parseable source via node.
  local validation_log
  validation_log="$(mktemp -t smoke-validation.XXXXXX)"
  if ! node -e "
    const m = require('${clone_dir}/.claude-plugin/marketplace.json');
    if (!Array.isArray(m.plugins) || m.plugins.length === 0) {
      console.error('marketplace has no plugins');
      process.exit(1);
    }
    for (const p of m.plugins) {
      if (!p.name) { console.error('plugin missing name'); process.exit(1); }
      const s = p.source;
      if (typeof s === 'string') {
        if (!s.startsWith('./')) {
          console.error(p.name + ': relative source must start with ./');
          process.exit(1);
        }
      } else if (s && s.source === 'git-subdir') {
        if (!s.url || !s.path) {
          console.error(p.name + ': git-subdir source missing url/path');
          process.exit(1);
        }
      } else {
        console.error(p.name + ': unsupported source type');
        process.exit(1);
      }
    }
    console.log('marketplace.json validates: ' + m.plugins.length + ' plugin(s)');
  " > "${validation_log}" 2>&1; then
    fail "phase A: marketplace.json validation failed"
    cat "${validation_log}" >&2
    rm -f "${validation_log}"
    FAILURES=$((FAILURES + 1))
    return 1
  fi
  ok "phase A: $(cat "${validation_log}")"
  rm -f "${validation_log}"
  return 0
}

# read_marketplace_source <plugin>
#
# Read the source spec for <plugin> from marketplace.json and emit a
# canonical line of the form:
#
#   relative <path>
#   git-subdir <url> <path> <ref>
#
# We use a node one-liner because jq isn't a hard dep on macOS and
# bash JSON parsing is a fool's errand. node IS a hard dep (the
# whole project runs on it), so this is safe.
#
# Why this matters (Issue #90, #88 repro):
#   The smoke must mirror what Claude Code does per the source field.
#   A relative-path source is copied as-is from the marketplace clone
#   (no materialization, no separate fetch) — vendor symlinks dangle.
#   A git-subdir source is cloned from <url>@<ref> — the operator
#   gets whatever vendor shape lives at <ref>. Pinning <ref> to a
#   materialized tag is exactly what #88's fix did, so reverting
#   that pin (back to relative-path or git-subdir@main) must make
#   this smoke fail.
read_marketplace_source() {
  local plugin="$1"
  node -e "
    const m = require('${REPO_ROOT}/.claude-plugin/marketplace.json');
    const p = m.plugins.find(p => p.name === '${plugin}');
    if (!p) { process.stderr.write('plugin not found: ${plugin}\n'); process.exit(2); }
    const s = p.source;
    if (typeof s === 'string') {
      process.stdout.write('relative ' + s + '\n');
    } else if (s && s.source === 'git-subdir') {
      process.stdout.write('git-subdir ' + s.url + ' ' + s.path + ' ' + (s.ref || 'HEAD') + '\n');
    } else {
      process.stderr.write('unsupported source for ${plugin}: ' + JSON.stringify(s) + '\n');
      process.exit(2);
    }
  "
}

# phase_b_per_source <release_source_repo> <plugin> <bin_name>
#
# Mirrors Claude Code's per-plugin install path, branching on the
# source type declared in marketplace.json:
#
#   relative-path source  → copy plugins/<plugin>/ from REPO_ROOT
#                            HEAD (the unmaterialized working tree).
#                            Vendor symlinks survive the copy and
#                            then dangle at install time. This is
#                            the install shape that hit operators
#                            on the pre-#88 marketplace.json.
#
#   git-subdir + ref      → clone from <url>@<ref>. Locally we
#                            substitute file://<release-source> for
#                            <url> (the release-source's HEAD
#                            represents the materialized tag).
#                            Vendor is real directories.
#
# Either way, after the install we run the bin wrapper. The wrapper's
# first-run `npm install --omit=dev` is what surfaces vendor-visibility
# bugs (the bin tries to source vendor/cli-bin-lib/install-lock.sh
# on line 17 — if vendor is empty, exit 1 with "No such file or
# directory").
phase_b_per_source() {
  local release_source="$1"
  local plugin="$2"
  local bin_name="$3"
  local clone_dir="${TMP}/phase-b-${plugin}"

  local source_line
  source_line="$(read_marketplace_source "${plugin}")"
  local source_kind
  source_kind="$(printf '%s' "${source_line}" | awk '{print $1}')"

  case "${source_kind}" in
    relative)
      local rel_path
      rel_path="$(printf '%s' "${source_line}" | awk '{print $2}')"
      info "phase B (relative-path source) — plugin=${plugin} path=${rel_path}"
      # Strip leading "./" so destination paths don't carry it.
      local src_path="${rel_path#./}"
      # Claude Code copies the plugin path from the marketplace clone.
      # We mirror with rsync to preserve symlinks faithfully on both
      # macOS (BSD cp) and Linux (GNU cp). rsync -a copies symlinks
      # as symlinks (not their targets) by default — exactly what we
      # want, because the bug is that those committed symlinks dangle
      # post-copy when packages/ isn't beside the plugin in the
      # operator's cache.
      #
      # The marketplace clone here is REPO_ROOT itself — the
      # unmaterialized working tree.
      #
      # mkdir -p of the FULL destination path (not just clone_dir)
      # is required: rsync's "create dest if missing" only handles
      # the leaf, not intermediate components, so a multi-segment
      # src_path (e.g. plugins/deskwork) needs the parent
      # directories pre-created.
      mkdir -p "${clone_dir}/${src_path}"
      rsync -a --exclude=node_modules --exclude=.runtime-cache \
        "${REPO_ROOT}/${src_path}/" "${clone_dir}/${src_path}/"
      ok "copied ${src_path} from REPO_ROOT (relative-path source) into ${clone_dir}"

      local plugin_dir="${clone_dir}/${src_path}"
      if [ ! -d "${plugin_dir}" ]; then
        fail "phase B: ${rel_path} missing after relative-path copy"
        FAILURES=$((FAILURES + 1))
        return 1
      fi

      if ! run_bin_help_at "${plugin_dir}" "${bin_name}"; then
        fail "phase B: ${bin_name} --help failed under relative-path source"
        FAILURES=$((FAILURES + 1))
        return 1
      fi
      ok "phase B: ${bin_name} --help succeeded under relative-path source"
      return 0
      ;;
    git-subdir)
      local _url path ref
      _url="$(printf '%s' "${source_line}" | awk '{print $2}')"
      path="$(printf '%s' "${source_line}" | awk '{print $3}')"
      ref="$(printf '%s' "${source_line}" | awk '{print $4}')"
      info "phase B (git-subdir source) — plugin=${plugin} path=${path} ref=${ref}"
      # Sparse-clone from the release-source. We treat the release-
      # source's HEAD as the materialized state for whatever ref is
      # configured (the smoke runs pre-tag, so we can't actually clone
      # by tag name — we substitute "the materialized HEAD" for "the
      # tag we're about to create").
      #
      # CONE MODE is critical here. Per Claude Code docs, git-subdir
      # uses sparse-clone — and in cone mode (the git default since
      # 2.27, and what Claude Code uses), root-level files including
      # package.json ARE present even though only `<path>` directories
      # are populated. This is how the husky walk-up bug hit operators:
      # the sparse-cloned tree had workspaces-declaring root
      # package.json, so npm install at the plugin shell walked UP.
      # --no-cone would HIDE that bug class — we'd be back to the
      # false-pass behavior #90 was filed about.
      git clone --quiet --filter=blob:none --no-checkout \
        "file://${release_source}" "${clone_dir}"
      ( cd "${clone_dir}" && git sparse-checkout init --cone >/dev/null )
      ( cd "${clone_dir}" && git sparse-checkout set "${path}" >/dev/null )
      ( cd "${clone_dir}" && git checkout --quiet )
      ok "sparse-cloned ${path} from release-source (git-subdir cone, ref=${ref}) into ${clone_dir}"

      local plugin_dir="${clone_dir}/${path}"
      if [ ! -d "${plugin_dir}" ]; then
        fail "phase B: ${path} missing after sparse-checkout"
        FAILURES=$((FAILURES + 1))
        return 1
      fi

      # Vendor sanity check: every vendor/<pkg> entry must be a real
      # directory with content. A symlink here would dangle (because
      # packages/ is not in the sparse-checkout) and the resulting
      # copy would be invisible to the bin wrapper's tsx exec.
      if ! assert_vendor_materialized "${plugin_dir}"; then
        fail "phase B: vendor materialization check failed for ${path}"
        FAILURES=$((FAILURES + 1))
        return 1
      fi

      if ! run_bin_help_at "${plugin_dir}" "${bin_name}"; then
        fail "phase B: ${bin_name} --help failed under git-subdir source"
        FAILURES=$((FAILURES + 1))
        return 1
      fi
      ok "phase B: ${bin_name} --help succeeded under git-subdir source"
      return 0
      ;;
    *)
      fail "phase B: unsupported source kind '${source_kind}' for plugin ${plugin}"
      FAILURES=$((FAILURES + 1))
      return 1
      ;;
  esac
}

# assert_vendor_materialized <plugin_dir>
#
# Walk plugin_dir/vendor/* and require each entry to be either:
#   - a real directory containing at least a package.json, OR
#   - absent (no vendor/ directory at all is fine for plugins
#     that don't vendor packages).
#
# Symlinks fail. Empty directories fail. Directories without a
# package.json fail (catches the case where rsync wrote an empty
# stub).
#
# Why we don't allow symlinks even if they "happen to resolve":
# the install shape we're asserting (sparse clone of plugins/<plugin>
# only) by definition has no out-of-tree resolution path. Any
# symlink with a relative parent escape would dangle.
assert_vendor_materialized() {
  local plugin_dir="$1"
  local vendor_dir="${plugin_dir}/vendor"
  if [ ! -d "${vendor_dir}" ]; then
    dim "  no vendor/ in ${plugin_dir} — nothing to check"
    return 0
  fi
  local entry
  local rc=0
  for entry in "${vendor_dir}"/*; do
    [ -e "${entry}" ] || continue
    if [ -L "${entry}" ]; then
      fail "vendor symlink found at ${entry} — sparse clone would dangle"
      rc=1
      continue
    fi
    if [ ! -d "${entry}" ]; then
      fail "vendor entry not a directory: ${entry}"
      rc=1
      continue
    fi
    if [ ! -s "${entry}/package.json" ]; then
      fail "vendor entry missing/empty package.json: ${entry}/package.json"
      rc=1
      continue
    fi
  done
  return "${rc}"
}
