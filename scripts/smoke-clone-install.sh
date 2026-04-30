#!/usr/bin/env bash
#
# smoke-clone-install.sh — install-path coverage helpers for
# scripts/smoke-marketplace.sh. Sourced by the main smoke; not an entry
# point.
#
# Phase 26 rewrite (v0.9.5+):
#   The vendor-materialization architecture is gone. Plugins now ship
#   as thin shells that first-run-install @deskwork/<pkg>@<version> from
#   npm at first invocation. The smoke mirrors that path: cone-mode
#   sparse-clone of plugins/<plugin>/ from a clone of REPO_ROOT, then
#   run the bin shim, which triggers the real `npm install --omit=dev
#   @deskwork/<pkg>@<version>` against the public registry.
#
#   Phases:
#     phase_a_marketplace_read — full clone of release-source HEAD;
#       mirrors Claude Code's marketplace.json read step and validates
#       the catalog itself (every plugin entry parses + names a usable
#       source).
#
#     phase_b_per_source — for each plugin declared as `git-subdir`
#       in marketplace.json, cone-mode sparse-clone of plugins/<plugin>/
#       (cone mode includes root-level files including the workspace-
#       declaring root package.json, exactly the shape Claude Code's
#       sparse clone produces). Then run the bin shim's --help. The
#       shim's first-run install fetches from npm.
#
#   What this does NOT cover (intentional):
#     - Local-state shortcuts (no `file://` substitution for the npm
#       registry): the bin shim's `npm install` runs against the actual
#       public registry. This requires the version pinned in the plugin
#       shell's plugin.json to already be published.
#     - source.ref pinning logic (retired with vendor): we no longer
#       point marketplace entries at materialized tag commits.
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
# Clone REPO_ROOT into <dest>. With the vendor architecture retired,
# there is no materialize-vendor step — the clone is the release source
# as-is.
#
# We do still clone (rather than just point at REPO_ROOT) because Phase B
# uses cone-mode sparse-checkout, which mutates per-clone state we don't
# want leaking into the developer's working tree.
build_release_source_clone() {
  local dest="$1"
  info "building release-source clone at ${dest}"
  # --no-local opt-out via file:// URL forces git to use the wire
  # protocol rather than hardlink-by-default optimizations, so the clone
  # is representative of what `git clone <url>` would produce over the
  # network. Phase B's sparse-clone needs this.
  git clone --quiet "file://${REPO_ROOT}" "${dest}"
  ok "cloned REPO_ROOT into release-source"
}

# run_bin_help_at <plugin_dir> <bin_name>
#
# Invoke <plugin_dir>/bin/<bin_name> --help. The bin shim does its own
# first-run `npm install --omit=dev @deskwork/<pkg>@<version>` if the
# pinned version isn't installed.
#
# We do NOT pre-run npm install here; we want the shim to do it itself,
# so any shim-level regressions surface (lock corruption, wrong version
# pin, etc.).
#
# 180s ceiling: cold npm install of the studio package and its deps can
# take 30-60s on a fresh tree under load. 180s gives headroom but still
# surfaces a hang.
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
  (
    cd "${plugin_dir}"
    "${bin_path}" --help
  ) >"${out_file}" 2>&1 &
  local bin_pid=$!
  local deadline=$(( $(date +%s) + 180 ))
  while [ "$(date +%s)" -lt "${deadline}" ]; do
    if ! kill -0 "${bin_pid}" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if kill -0 "${bin_pid}" 2>/dev/null; then
    fail "${bin_name} --help did not exit within 180s (likely hang or first-run install stalled)"
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
# every plugin entry has a usable source spec. Cheap pre-flight before
# the slower per-plugin install simulations.
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
# `<ref>` is `HEAD` when omitted from marketplace.json (Phase 26e: ref
# is no longer pinned per release; defaults to the repo's default
# branch).
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
# Mirror Claude Code's per-plugin install path. With Phase 26 we have a
# single shape: git-subdir + cone-mode sparse-clone. We keep the
# relative-path branch as a safety net in case marketplace.json changes
# in the future, but the active path is git-subdir.
#
# Cone mode is critical: per Claude Code docs, git-subdir uses sparse-
# clone in cone mode, which includes root-level files (workspace-
# declaring root package.json) even though only `<path>` directories are
# populated. This is the exact shape the husky walk-up bug surfaced in
# (v0.9.4): npm install at the plugin shell walked UP into the root
# package.json's prepare script. We test against the same shape.
#
# For git-subdir, `ref` defaults to HEAD when marketplace.json omits the
# field; we substitute "the release-source's HEAD" for "the repo's
# default branch" since the smoke runs against a local clone.
#
# After cloning, the bin shim's first-run `npm install --omit=dev
# @deskwork/<pkg>@<version>` runs against the actual npm public
# registry. This means the version pinned in plugin.json MUST be
# published before the smoke can pass.
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
      local src_path="${rel_path#./}"
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
