#!/usr/bin/env bash
# smoke-interceptor-loaded.sh — 028 US4 T117 (FR-035; contract T7; SC-007).
#
# Proves the capability-mediation TEETH are loaded and firing — the interceptor must
# be both REGISTERED (auto-discovered via the plugin manifest) and FIRING. Local
# pre-PR smoke, NOT a CI job (project rule: no test infrastructure in CI).
#
# Registration assertions:
#   1. hooks/hooks.json declares a PreToolUse matcher for both Bash and Skill →
#      ${CLAUDE_PLUGIN_ROOT}/bin/intercept.
#   2. .claude-plugin/plugin.json wires hooks/hooks.json (closing AUDIT-20260618-73:
#      the manifest references the hooks file rather than relying on undocumented
#      auto-discovery alone).
#   3. bin/intercept exists and is executable.
#
# Firing assertions (the interceptor actually evaluates a payload):
#   4. A fronted backend with NO marker (Bash `backlog capture ...`) emits a deny
#      hookSpecificOutput.
#   5. A non-backend (Bash `ls -la`) permits (no deny output).
#
# Exit 0 only when ALL hold.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_JSON="$PLUGIN_ROOT/hooks/hooks.json"
PLUGIN_JSON="$PLUGIN_ROOT/.claude-plugin/plugin.json"
INTERCEPT="$PLUGIN_ROOT/bin/intercept"

fail() {
  printf 'smoke-interceptor-loaded: FAIL — %s\n' "$1" 1>&2
  exit 1
}

printf 'smoke-interceptor-loaded: checking registration...\n'

[ -f "$HOOKS_JSON" ] || fail "hooks/hooks.json missing"
[ -x "$INTERCEPT" ] || fail "bin/intercept missing or not executable"

# 1. hooks.json declares Bash + Skill PreToolUse matchers → bin/intercept.
node -e '
  const fs = require("fs");
  const h = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const pre = h.hooks && h.hooks.PreToolUse;
  if (!Array.isArray(pre)) { console.error("no PreToolUse array"); process.exit(1); }
  const matchers = pre.map((e) => e.matcher);
  if (JSON.stringify(matchers) !== JSON.stringify(["Bash", "Skill"])) {
    console.error("matchers != [Bash, Skill]: " + JSON.stringify(matchers)); process.exit(1);
  }
  for (const e of pre) {
    const cmd = e.hooks && e.hooks[0] && e.hooks[0].command;
    if (cmd !== "${CLAUDE_PLUGIN_ROOT}/bin/intercept") {
      console.error("unexpected hook command: " + cmd); process.exit(1);
    }
  }
' "$HOOKS_JSON" || fail "hooks.json does not declare Bash+Skill -> bin/intercept"

# 2. plugin.json wires hooks/hooks.json.
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (m.hooks !== "./hooks/hooks.json") {
    console.error("plugin.json hooks key != ./hooks/hooks.json: " + JSON.stringify(m.hooks));
    process.exit(1);
  }
' "$PLUGIN_JSON" || fail "plugin.json does not reference ./hooks/hooks.json"

printf 'smoke-interceptor-loaded: registration OK\n'
printf 'smoke-interceptor-loaded: checking firing...\n'

# 4. Fronted backend, no marker -> deny.
DENY_OUT="$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"backlog capture \"x\" --type bug"},"session_id":"smoke-interceptor-loaded","cwd":"'"$PLUGIN_ROOT"'"}' | "$INTERCEPT")"
printf '%s' "$DENY_OUT" | grep -q '"permissionDecision":"deny"' || fail "fronted backend (backlog capture) did not emit deny: $DENY_OUT"

# 5. Non-backend -> permit (no deny output).
PERMIT_OUT="$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"ls -la"},"session_id":"smoke-interceptor-loaded","cwd":"'"$PLUGIN_ROOT"'"}' | "$INTERCEPT")"
if printf '%s' "$PERMIT_OUT" | grep -q '"deny"'; then
  fail "non-backend (ls -la) emitted a deny: $PERMIT_OUT"
fi

printf 'smoke-interceptor-loaded: firing OK\n'
printf 'smoke-interceptor-loaded: PASS\n'
