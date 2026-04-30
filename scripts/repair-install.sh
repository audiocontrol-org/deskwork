#!/usr/bin/env bash
#
# repair-install.sh — adopter recovery for deskwork plugin-cache eviction.
#
# Lives at the marketplace clone path:
#   ~/.claude/plugins/marketplaces/deskwork/scripts/repair-install.sh
#
# That path is durable across Claude Code's plugin-cache eviction (the
# marketplace clone is owned by Claude Code's marketplace manager, not
# the cache layer that gets garbage-collected). When the cache layer
# disappears between sessions, this script restores the cache subtrees
# from the clone — without depending on the deskwork CLI itself, which
# would be unreachable.
#
# Tracking issue: https://github.com/audiocontrol-org/deskwork/issues/131
#
# Modes:
#   (default)  Restore broken cache subtrees + prune stale registry
#              entries + report. One diagnostic line per repaired plugin.
#   --quiet    Same, but silent on healthy state. Used by SessionStart hooks.
#   --check    Read-only — report state without modifying.
#
# Exit codes:
#   0  Healthy or repaired successfully.
#   1  Cache broken AND repair failed (marketplace clone missing,
#      filesystem error, plugin manifest unreadable).
#   2  Usage error.
#
# Requirements:
#   - bash 3.2+ (macOS-friendly)
#   - node (used for JSON parsing of plugin.json + registry)
#   - cp / mkdir / chmod (POSIX)
#   - rsync (optional; falls back to cp)

set -euo pipefail

# ---------- args ----------

QUIET=0
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet|-q)        QUIET=1; shift ;;
    --check|--dry-run) CHECK_ONLY=1; shift ;;  # --dry-run kept as alias for back-compat with v0.9.8
    --json)            shift ;;                 # --json no-op for back-compat; the bash script's stdout shape is fixed
    -h|--help)
      sed -n '/^#$/,/^# Requirements:/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Usage: $0 [--quiet|--check]" >&2
      exit 2 ;;
  esac
done

# ---------- constants ----------

REGISTRY="${HOME}/.claude/plugins/installed_plugins.json"
MARKETPLACE_CLONE="${HOME}/.claude/plugins/marketplaces/deskwork"
CACHE_BASE="${HOME}/.claude/plugins/cache/deskwork"
PLUGINS=(deskwork deskwork-studio dw-lifecycle)

REPAIRED=()
HEALTHY=()
ERRORS=()

# ---------- helpers ----------

log() { [[ $QUIET -eq 1 ]] || echo "$@"; }
err() { echo "$@" >&2; }

# Read the marketplace metadata version (lockstep with plugin versions).
# Used for the one-line banner so operators running the script manually
# see exactly which version they're on. Returns empty string if the
# marketplace.json is unreadable — the banner is a nice-to-have, never
# blocking.
script_version() {
  local manifest="$MARKETPLACE_CLONE/.claude-plugin/marketplace.json"
  [[ -f "$manifest" ]] || { echo ""; return 0; }
  node -e "
    try {
      const m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
      const v = m.metadata && m.metadata.version;
      if (typeof v === 'string' && v) console.log(v);
    } catch (e) { /* banner is optional; never fail the script over it */ }
  " 2>/dev/null
}

ensure_marketplace_clone() {
  if [[ ! -d "$MARKETPLACE_CLONE" ]]; then
    err "marketplace clone missing at $MARKETPLACE_CLONE"
    err "  in Claude Code, run: /plugin marketplace add audiocontrol-org/deskwork"
    return 1
  fi
}

# Read a plugin's canonical version from its manifest in the clone.
plugin_canonical_version() {
  local plugin=$1
  local manifest="$MARKETPLACE_CLONE/plugins/$plugin/.claude-plugin/plugin.json"
  if [[ ! -f "$manifest" ]]; then
    err "  warning: no manifest at $manifest — skipping canonical version"
    return 0
  fi
  node -e "
    try {
      const m = JSON.parse(require('fs').readFileSync('$manifest', 'utf8'));
      if (typeof m.version === 'string' && m.version) console.log(m.version);
    } catch (e) {
      process.stderr.write('  warning: failed to parse plugin.json for $plugin: ' + e.message + '\\n');
    }
  "
}

# Enumerate every (plugin, version) tuple referenced by:
#   1. PATH entries pointing at cache bin dirs
#   2. installed_plugins.json registry entries
#   3. The marketplace clone's canonical version
# Output: one version per line (deduped, blanks dropped).
versions_referenced() {
  local plugin=$1
  {
    # 1. PATH-referenced versions
    if [[ -n "${PATH:-}" ]]; then
      echo "$PATH" | tr ':' '\n' | while IFS= read -r dir; do
        # Match: <home>/.claude/plugins/cache/deskwork/<plugin>/<version>/bin
        case "$dir" in
          "$CACHE_BASE/$plugin/"*"/bin"|"$CACHE_BASE/$plugin/"*"/bin/")
            local rest=${dir#"$CACHE_BASE/$plugin/"}
            echo "${rest%%/*}"
            ;;
        esac
      done
    fi

    # 2. Registry-referenced versions
    if [[ -f "$REGISTRY" ]]; then
      node -e "
        try {
          const r = JSON.parse(require('fs').readFileSync('$REGISTRY', 'utf8'));
          const entries = r.plugins && r.plugins['${plugin}@deskwork'] || [];
          for (const e of entries) {
            if (typeof e.version === 'string' && e.version) console.log(e.version);
          }
        } catch (e) { /* registry parse failures are surfaced elsewhere */ }
      " 2>/dev/null || true
    fi

    # 3. Canonical version from marketplace clone manifest
    plugin_canonical_version "$plugin"
  } | awk 'NF && !seen[$0]++'
}

# Verify a plugin/version cache subtree is healthy enough to dispatch.
# We require the bin file to exist and be executable.
verify_version() {
  local plugin=$1
  local version=$2
  local bin_path="$CACHE_BASE/$plugin/$version/bin/$plugin"
  [[ -x "$bin_path" ]]
}

# Restore a plugin/version cache subtree from the marketplace clone.
restore_version() {
  local plugin=$1
  local version=$2
  local source="$MARKETPLACE_CLONE/plugins/$plugin"
  local dest="$CACHE_BASE/$plugin/$version"

  if [[ ! -d "$source" ]]; then
    err "  marketplace clone has no $plugin subtree at $source"
    return 1
  fi

  if [[ $CHECK_ONLY -eq 1 ]]; then
    log "  [check] would restore $plugin@$version from $source"
    REPAIRED+=("$plugin@$version (check-only)")
    return 0
  fi

  mkdir -p "$dest"
  # Use rsync if available — handles symlinks + permissions cleanly.
  # Exclude node_modules and .runtime-cache: those are runtime-built,
  # not part of the plugin's static surface, and rebuilding them is
  # cheap (the bin shim does first-run install on demand).
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete-excluded \
      --exclude '/node_modules/' \
      --exclude '/.runtime-cache/' \
      "$source/" "$dest/"
  else
    # cp -R fallback. Trailing /. copies contents into dest dir.
    cp -RP "$source/." "$dest/"
    rm -rf "$dest/node_modules" "$dest/.runtime-cache" 2>/dev/null || true
  fi

  # Defensive: ensure bins are executable. cp/rsync should preserve
  # permissions, but POSIX ACLs / mounted filesystems can drop them.
  if [[ -d "$dest/bin" ]]; then
    chmod +x "$dest/bin/"* 2>/dev/null || true
  fi

  REPAIRED+=("$plugin@$version")
  log "  repaired $plugin@$version"
}

# Per-plugin: walk every referenced version, repair if missing.
process_plugin() {
  local plugin=$1
  local versions
  versions=$(versions_referenced "$plugin") || true

  if [[ -z "$versions" ]]; then
    log "  $plugin: no versions referenced (PATH + registry + manifest empty)"
    return 0
  fi

  while IFS= read -r version; do
    [[ -z "$version" ]] && continue
    if verify_version "$plugin" "$version"; then
      HEALTHY+=("$plugin@$version")
    else
      if ! restore_version "$plugin" "$version"; then
        ERRORS+=("$plugin@$version")
      fi
    fi
  done <<< "$versions"
}

# Detect whether the SessionStart auto-repair hook is wired up in either
# the user-scope or project-scope settings.json. Substring match on the
# script filename — settings.json is JSONC (comments + trailing commas
# allowed) so a plain grep is safer than a JSON.parse round-trip, and
# the script path is already a stable contract surface (see the
# "Adopter-facing scripts have a stable CLI contract" rule). A false
# positive (e.g. a comment that mentions the script) only suppresses a
# hint; it doesn't break anything.
session_hook_installed() {
  local needle="repair-install.sh"
  local user_settings="${HOME}/.claude/settings.json"
  local project_settings="${PWD}/.claude/settings.json"
  if [[ -f "$user_settings" ]] && grep -F -q "$needle" "$user_settings" 2>/dev/null; then
    return 0
  fi
  if [[ -f "$project_settings" ]] && grep -F -q "$needle" "$project_settings" 2>/dev/null; then
    return 0
  fi
  return 1
}

# Prune installed_plugins.json entries whose installPath doesn't exist
# on disk after the cache-restore pass. Inlined node -e so the script
# stays self-contained.
prune_registry() {
  [[ -f "$REGISTRY" ]] || return 0
  if [[ $CHECK_ONLY -eq 1 ]]; then
    log "[check] skipping registry prune"
    return 0
  fi

  PLUGINS_LIST="${PLUGINS[*]}" REGISTRY_PATH="$REGISTRY" QUIET="$QUIET" \
  node -e '
    const fs = require("fs");
    const path = process.env.REGISTRY_PATH;
    const quiet = process.env.QUIET === "1";
    const plugins = (process.env.PLUGINS_LIST || "").split(/\s+/).filter(Boolean);
    const keys = plugins.map(p => p + "@deskwork");
    let r;
    try { r = JSON.parse(fs.readFileSync(path, "utf8")); }
    catch (e) { process.stderr.write("registry parse failed: " + e.message + "\n"); process.exit(0); }
    if (typeof r.plugins !== "object" || r.plugins === null) { process.exit(0); }
    let pruned = 0;
    for (const k of keys) {
      const entries = r.plugins[k];
      if (!Array.isArray(entries)) continue;
      const live = entries.filter(e => e.installPath && fs.existsSync(e.installPath));
      pruned += entries.length - live.length;
      if (live.length === 0) { delete r.plugins[k]; }
      else { r.plugins[k] = live; }
    }
    if (pruned > 0) {
      fs.writeFileSync(path, JSON.stringify(r, null, 2) + "\n", "utf8");
      if (!quiet) console.log(`  pruned ${pruned} stale registry entr${pruned === 1 ? "y" : "ies"}`);
    }
  '
}

# ---------- main ----------

main() {
  ensure_marketplace_clone || exit 1

  # Banner — only when not --quiet and not --check (banner adds noise to
  # the read-only diagnostic which already prefixes its lines with [check]).
  if [[ $QUIET -eq 0 ]] && [[ $CHECK_ONLY -eq 0 ]]; then
    local version
    version=$(script_version)
    if [[ -n "$version" ]]; then
      log "deskwork repair-install v$version"
    fi
  fi

  for plugin in "${PLUGINS[@]}"; do
    log "checking $plugin"
    process_plugin "$plugin"
  done

  prune_registry

  # Validation pass: each plugin should have at least one working bin.
  local unrecoverable=()
  for plugin in "${PLUGINS[@]}"; do
    local found=0
    for d in "$CACHE_BASE/$plugin"/*/bin; do
      [[ -x "$d/$plugin" ]] && { found=1; break; }
    done
    [[ $found -eq 0 ]] && unrecoverable+=("$plugin")
  done

  if [[ ${#unrecoverable[@]} -gt 0 ]]; then
    err "Unrecoverable — no working bin for: ${unrecoverable[*]}"
    err "  In Claude Code, run:"
    for p in "${unrecoverable[@]}"; do
      err "    /plugin install $p@deskwork"
    done
    err "    /reload-plugins"
    exit 1
  fi

  if [[ ${#REPAIRED[@]} -gt 0 ]]; then
    if [[ $QUIET -eq 1 ]]; then
      # In quiet mode: announce what was repaired (the SessionStart
      # hook should still tell the operator if it actually fixed
      # something).
      echo "deskwork repair-install: repaired ${REPAIRED[*]}"
    else
      log "repaired: ${REPAIRED[*]}"
    fi
  elif [[ $QUIET -eq 0 ]]; then
    log "all plugins healthy."
  fi

  # Hint: the SessionStart auto-repair hook is the durable fix for
  # cache-eviction breakage. If it isn't wired up, point the operator
  # (or the agent reading this output) at the README's documented
  # snippet. We never install the hook ourselves — that's an
  # operator-consent decision (see issue #132). Suppressed in --quiet
  # mode, where the silence-on-healthy contract holds.
  if [[ $QUIET -eq 0 ]] && ! session_hook_installed; then
    log ""
    log "TIP: the SessionStart auto-repair hook isn't installed."
    log "     Add it once and this manual step goes away. Snippet + paste"
    log "     instructions are in the Troubleshooting section of:"
    log "       https://github.com/audiocontrol-org/deskwork/blob/main/plugins/deskwork/README.md"
    log "     Or ask your agent to walk you through it."
  fi

  if [[ ${#ERRORS[@]} -gt 0 ]]; then
    err "errors during restore: ${ERRORS[*]}"
    exit 1
  fi
}

main "$@"
