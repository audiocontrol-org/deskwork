#!/usr/bin/env bash
#
# install-lock.sh — shared bash runtime for deskwork plugin bin wrappers.
#
# Exports a single function: run_with_install_lock. The bin wrappers
# (plugins/deskwork/bin/deskwork, plugins/deskwork-studio/bin/deskwork-studio)
# are thin shells that source this file and invoke run_with_install_lock
# with their bin name + plugin root.
#
# Resolution order (first match wins):
#   1. Workspace-linked binary (`node_modules/.bin/<bin>`) — the dev path;
#      runs source via tsx, supports edits without rebuild.
#   2. First-run install: when the plugin tree (the marketplace install
#      payload) has no node_modules yet, run `npm install --omit=dev`
#      from the plugin root, then exec the freshly-linked source bin
#      via tsx. Phase 23d (source-shipped re-architecture).
#   3. Loud error.
#
# Concurrent-install lock (Issue #76):
#   Two simultaneous wrapper invocations on a fresh marketplace install
#   could both race into `npm install`, producing partial node_modules
#   trees and ENOENT-on-exec for the linked bin. We serialize with a
#   portable directory-based lock (`mkdir` is atomic on POSIX). The
#   loser polls until the holder finishes (or the lock is found stale)
#   then re-checks the bin. macOS does not ship `flock(1)`, so we avoid
#   it. A capped wait (LOCK_WAIT_SECONDS) prevents indefinite hangs;
#   stale-lock recovery (LOCK_STALE_SECONDS) keeps a crashed holder
#   from blocking forever.
#
#   Partial-install recovery: if `node_modules/` exists but the expected
#   bin does NOT, we re-run `npm install` (idempotent enough to fix
#   most partial states) and surface a clear log line.
#
#   Failure surfacing: `npm install` stderr is captured to a tmp file;
#   on non-zero exit, the wrapper emits the captured output instead of
#   falling through to the misleading "cannot locate" branch at the end.
#
# Vendored under each plugin at vendor/cli-bin-lib/install-lock.sh —
# see scripts/materialize-vendor.sh for the materialization pairs that
# turn the dev-path symlink into a real directory at release time.

set -euo pipefail

# run_with_install_lock --bin-name <name> --plugin-root <dir> -- <args...>
#
# The wrapper invokes us with the plugin's bin name + plugin root, then
# `--` followed by the user's original $@. All flag parsing happens
# here; the wrappers stay thin.
#
# Exits via `exec` on the success path; never returns.
run_with_install_lock() {
  local bin_name=""
  local plugin_root=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --bin-name)
        bin_name="$2"
        shift 2
        ;;
      --plugin-root)
        plugin_root="$2"
        shift 2
        ;;
      --)
        shift
        break
        ;;
      *)
        echo "install-lock: unexpected argument: $1" >&2
        return 2
        ;;
    esac
  done

  if [ -z "${bin_name}" ] || [ -z "${plugin_root}" ]; then
    echo "install-lock: --bin-name and --plugin-root are required" >&2
    return 2
  fi

  local script_dir="${plugin_root}/bin"

  local LOCK_WAIT_SECONDS=120
  local LOCK_STALE_SECONDS=300
  local LOCK_POLL_INTERVAL=1

  # (1) Workspace symlink — fastest, supports source-level edits.
  local workspace_candidates=(
    "${script_dir}/../../../node_modules/.bin/${bin_name}"
    "${script_dir}/../node_modules/.bin/${bin_name}"
    "${script_dir}/../../node_modules/.bin/${bin_name}"
  )
  local candidate
  for candidate in "${workspace_candidates[@]}"; do
    if [ -x "$candidate" ]; then
      exec "$candidate" "$@"
    fi
  done

  # (2) First-run install path. Marketplace install copies plugins/<name>/
  # into ~/.claude/plugins/cache/<…>/, with no node_modules. Detect that
  # state, run `npm install --omit=dev` once, then exec the source bin.
  local plugin_local_bin="${plugin_root}/node_modules/.bin/${bin_name}"
  local lock_dir="${plugin_root}/.deskwork-install.lock"

  # lock_dir_mtime_seconds — print mtime (epoch seconds) of $1 or empty.
  _il_lock_dir_mtime_seconds() {
    local path="$1"
    if [ -d "$path" ]; then
      if stat -f '%m' "$path" >/dev/null 2>&1; then
        stat -f '%m' "$path"
      elif stat -c '%Y' "$path" >/dev/null 2>&1; then
        stat -c '%Y' "$path"
      fi
    fi
  }

  # acquire_install_lock — try to mkdir the lock atomically. If another
  # process holds it, poll up to LOCK_WAIT_SECONDS. Treat locks older than
  # LOCK_STALE_SECONDS as crashed-holder leftovers and reclaim. Returns 0
  # on lock acquired, 1 on timeout, 2 if the bin appeared while waiting.
  _il_acquire_install_lock() {
    local waited=0
    while true; do
      if mkdir "$lock_dir" 2>/dev/null; then
        return 0
      fi
      local now mtime age
      now="$(date +%s)"
      mtime="$(_il_lock_dir_mtime_seconds "$lock_dir")"
      if [ -n "$mtime" ]; then
        age=$(( now - mtime ))
        if [ "$age" -gt "$LOCK_STALE_SECONDS" ]; then
          echo "${bin_name}: removing stale install lock ${lock_dir} (age=${age}s)" >&2
          rmdir "$lock_dir" 2>/dev/null || rm -rf "$lock_dir" 2>/dev/null || true
          continue
        fi
      fi
      # Bin appeared while we were waiting? Holder finished successfully.
      if [ -x "${plugin_local_bin}" ]; then
        return 2
      fi
      if [ "$waited" -ge "$LOCK_WAIT_SECONDS" ]; then
        return 1
      fi
      sleep "$LOCK_POLL_INTERVAL"
      waited=$(( waited + LOCK_POLL_INTERVAL ))
    done
  }

  _il_release_install_lock() {
    rmdir "$lock_dir" 2>/dev/null || rm -rf "$lock_dir" 2>/dev/null || true
  }

  _il_run_npm_install() {
    local stderr_file="$1"
    local rc=0
    # Subshell so the npm exit code is propagated up through the pipe to
    # us. We must NOT use `if !` here — the negation overwrites $?.
    ( cd "${plugin_root}" && npm install --omit=dev --no-audit --no-fund --loglevel=error ) 2>"$stderr_file" || rc=$?
    return "$rc"
  }

  if [ ! -x "${plugin_local_bin}" ]; then
    if [ -f "${plugin_root}/package.json" ]; then
      if [ -d "${plugin_root}/node_modules" ]; then
        echo "${bin_name}: previous install appears partial (node_modules exists but bin missing); re-running install..." >&2
      else
        echo "${bin_name}: first run — installing dependencies (one-time)..." >&2
      fi

      _il_acquire_install_lock
      local lock_status=$?
      if [ "$lock_status" -eq 1 ]; then
        cat >&2 <<EOF
${bin_name}: another ${bin_name} install appears to be in progress.
Lock directory: ${lock_dir}
Waited ${LOCK_WAIT_SECONDS}s without acquiring the lock.
If you believe the lock is stale, remove it manually:
  rm -rf "${lock_dir}"
EOF
        exit 75
      fi

      if [ "$lock_status" -eq 0 ]; then
        # We hold the lock. Re-check the bin under the lock — another
        # process may have completed install while we were entering the
        # critical section.
        if [ ! -x "${plugin_local_bin}" ]; then
          local npm_stderr_file
          npm_stderr_file="$(mktemp -t "${bin_name}-install.XXXXXX")"
          trap '_il_release_install_lock; rm -f "${npm_stderr_file}"' EXIT INT TERM
          local npm_exit=0
          _il_run_npm_install "$npm_stderr_file" || npm_exit=$?
          if [ "$npm_exit" -ne 0 ]; then
            echo "${bin_name}: npm install failed (exit ${npm_exit}). Captured stderr:" >&2
            cat "$npm_stderr_file" >&2 || true
            _il_release_install_lock
            rm -f "$npm_stderr_file"
            trap - EXIT INT TERM
            exit "$npm_exit"
          fi
          if [ ! -x "${plugin_local_bin}" ]; then
            echo "${bin_name}: npm install completed but ${plugin_local_bin} still missing. Captured stderr:" >&2
            cat "$npm_stderr_file" >&2 || true
            _il_release_install_lock
            rm -f "$npm_stderr_file"
            trap - EXIT INT TERM
            exit 1
          fi
          rm -f "$npm_stderr_file"
          trap - EXIT INT TERM
        fi
        _il_release_install_lock
      fi
      # lock_status == 2: bin appeared while waiting; holder finished.
    fi
  fi
  if [ -x "${plugin_local_bin}" ]; then
    exec "${plugin_local_bin}" "$@"
  fi

  # (3) Nothing found.
  cat >&2 <<EOF
${bin_name}: cannot locate the ${bin_name} binary.

Looked for workspace bin in:
  ${workspace_candidates[0]}
  ${workspace_candidates[1]}
  ${workspace_candidates[2]}

Looked for first-run-install bin at:
  ${plugin_local_bin}

If you cloned the deskwork repo manually, run 'npm install' at the repo
root to populate node_modules/.bin/. If you installed via the
marketplace, the first-run install above should have populated
node_modules — re-run and capture the install output.
EOF
  exit 127
}
