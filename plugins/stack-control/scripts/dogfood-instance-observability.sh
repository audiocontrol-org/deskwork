#!/usr/bin/env bash
# dogfood-instance-observability.sh — specs/037-instance-observability FR-027 / SC-010.
#
# THE PRIMARY ACCEPTANCE PATH (not a demo). Drives the four quickstart.md
# scenarios END-TO-END against REAL PRODUCERS — a real plane, a real sidecar,
# real `stackctl` verbs, a real `session-start`/`session-end`, and a real
# `workflow advance` phase transition — then queries the real read-only API.
#
# THE NON-NEGOTIABLE RULE (learned from 036): every instance/session/bearing
# state observed here is produced by a REAL producer. This script NEVER POSTs a
# hand-built event to /v1/ingest. If a state is only reachable by synthetic
# injection, that is a PRODUCER DEFECT this script REPORTS — never one it fakes.
#
# ISOLATION: the machine-local store (identity, token, current-session, socket,
# spool, durable event log) is redirected off the real $HOME via HOME + a SHORT
# $TMPDIR (UDS sun_path budget) + XDG dirs, so a run mints nothing into the
# developer's home (036 isolation exception).
#
# ENGINE: ./bin/stackctl — the SOURCE engine (tsx over src/), per
# .claude/rules/source-engine-for-stack-control-dev.md. Bare `stackctl` would be
# the stale installed cache.
#
# Usage: bash plugins/stack-control/scripts/dogfood-instance-observability.sh
# Evidence is printed to stdout AND tee'd to $EVIDENCE (env override) if set.

set -uo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACKCTL="$PLUGIN_ROOT/bin/stackctl"
TOKEN="dogfood-bearer-$$-abc"

# --- isolation: short TMPDIR for the UDS budget; HOME/XDG off the real home ---
TMPROOT="$(mktemp -d /tmp/dfobs.XXXXXX)"
export HOME="$TMPROOT/home"
export TMPDIR="$TMPROOT/t"
export XDG_STATE_HOME="$TMPROOT/state"
export XDG_RUNTIME_DIR="$TMPROOT/run"
mkdir -p "$HOME" "$TMPDIR" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"

PLANE_PID=""
SIDECAR_PID=""
cleanup() {
  [ -n "$SIDECAR_PID" ] && kill "$SIDECAR_PID" 2>/dev/null
  [ -n "$PLANE_PID" ] && kill "$PLANE_PID" 2>/dev/null
  sleep 0.3
  rm -rf "$TMPROOT"
}
trap cleanup EXIT INT TERM

section() { printf '\n============================================================\n%s\n============================================================\n' "$1"; }
note()    { printf '  %s\n' "$1"; }

# --- installation under test (a real git repo carrying a real roadmap item) ---
INSTALL="$TMPROOT/install"
mkdir -p "$INSTALL"
cd "$INSTALL" || exit 1
git init -q
git config user.email dogfood@example.invalid
git config user.name dogfood
git config commit.gpgsign false
"$STACKCTL" setup --apply >/dev/null 2>&1
# a planned roadmap node → its forward transition open-design (planned ->
# designing) has an empty exit gate and commits, so `workflow advance --apply`
# is a REAL committed phase transition (the phase.entered producer).
printf '\n## multi:feature/dogfood-bearing\n\n- status: planned\n\ndogfood bearing item scope prose.\n' >> ROADMAP.md
git add -A && git commit -q -m init
note "installation root: $(cd "$INSTALL" && pwd -P)"
note "expected Instance Identity path (FR-001/D8): the realpath above"

# --- provision the bearer token the real way, boot a real plane + sidecar -----
"$STACKCTL" plane provision-token --token "$TOKEN" >/dev/null 2>&1
"$STACKCTL" plane serve --port 0 --token "$TOKEN" >"$TMPROOT/plane.log" 2>&1 &
PLANE_PID=$!
PORT=""
for _ in $(seq 1 60); do
  PORT="$(grep -oE 'port [0-9]+' "$TMPROOT/plane.log" | grep -oE '[0-9]+' || true)"
  [ -n "$PORT" ] && break; sleep 0.2
done
[ -z "$PORT" ] && { echo "FATAL: plane did not bind a port"; cat "$TMPROOT/plane.log"; exit 1; }
export STACKCTL_CP_URL="http://127.0.0.1:$PORT"
note "plane serving on $STACKCTL_CP_URL (pid $PLANE_PID)"

"$STACKCTL" sidecar run >"$TMPROOT/sidecar.log" 2>&1 &
SIDECAR_PID=$!
for _ in $(seq 1 60); do grep -q "elected" "$TMPROOT/sidecar.log" && break; sleep 0.2; done
note "sidecar: $(cat "$TMPROOT/sidecar.log")"

# --- API helpers (READ-ONLY GETs; the token is the only credential) -----------
AUTH=(-H "Authorization: Bearer $TOKEN")
BASE="http://127.0.0.1:$PORT"
instances_all() { curl -s "${AUTH[@]}" "$BASE/v1/instances?include=all"; }
instances()     { curl -s "${AUTH[@]}" "$BASE/v1/instances"; }
first_id()      { instances_all | jq -r '.instances[0].id // empty'; }
enc()           { jq -rn --arg x "$1" '$x|@uri'; }

# ============================================================================
section "SCENARIO 1 (US1) — an instance appears from a real ordinary verb"
# ============================================================================
note "producer: real './bin/stackctl version' (an ordinary short verb)"
"$STACKCTL" version >/dev/null 2>&1
"$STACKCTL" version >/dev/null 2>&1
"$STACKCTL" roadmap list >/dev/null 2>&1 || true
sleep 3
echo "-- GET /v1/instances (default view) after 3 ordinary verbs --"
instances | jq .
echo "-- GET /v1/instances?include=all --"
instances_all | jq .
S1_COUNT="$(instances_all | jq '.instances | length')"
if [ "$S1_COUNT" -ge 1 ]; then
  note "S1 VERDICT: PASS — an instance appeared from a real ordinary verb"
else
  note "S1 VERDICT: FAIL — NO instance appeared from real ordinary verbs."
  note "  invocation.completed rides the C4 'short-verb' emit buffer (capacity 0):"
  note "  a fresh short-lived CLI process exits before its local-socket connect"
  note "  completes, so the buffer DROPS the event and nothing is ever uplinked."
fi

echo
echo "-- fail-open sub-check: a verb with STACKCTL_CP_URL pointed at a dead address --"
t0=$(date +%s%N)
STACKCTL_CP_URL="http://127.0.0.1:1" "$STACKCTL" version >/dev/null 2>&1
rc=$?
t1=$(date +%s%N)
note "verb exit code: $rc (expect 0); wall: $(( (t1 - t0) / 1000000 ))ms (verb is decoupled from the plane — emits to the LOCAL socket only)"

# ============================================================================
section "SCENARIO 2 (US2) — sessions are real and survive a restart"
# ============================================================================
note "producer: real './bin/stackctl session-start'"
"$STACKCTL" session-start >/dev/null 2>&1 || note "session-start exit=$?"
sleep 2
ID="$(first_id)"
note "instance id observed: ${ID:-<none>}"
if [ -n "$ID" ]; then
  echo "-- GET /v1/instances/$(printf '%s' "$ID") --"
  curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq '.instance | {id,currentSession,sessionsStarted,firstSessionAt,lastActivity}'
fi
echo "-- machine-local current-session record present beside identity/token? --"
find "$HOME" -name '*current-session*' 2>/dev/null | sed "s#$HOME#\$HOME#" || true
CS_FILE="$(find "$HOME" -name '*current-session*' 2>/dev/null | head -1)"
[ -n "$CS_FILE" ] && note "current-session record: FOUND (machine-local, off-repo)" || note "current-session record: not found by name '*current-session*'"

CUR_SESSION="$( [ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq -r '.instance.currentSession // "null"' || echo null)"
if [ "$CUR_SESSION" != "null" ]; then
  note "S2 currentSession VERDICT: PASS — real session-start populated currentSession"
else
  note "S2 currentSession VERDICT: FAIL — sessionsStarted counts, but currentSession/firstSessionAt stay null."
  note "  The sidecar re-mint pipeline (src/sidecar/pipeline.ts) hard-codes sessionId:null"
  note "  ('T019 later; null for now') and drops the {sessionId,startedAt} snapshot, so the"
  note "  uplinked session.started carries no session linkage."
fi

echo
note "producer: real './bin/stackctl session-end'"
"$STACKCTL" session-end --no-push >/dev/null 2>&1 || note "session-end exit=$?"
sleep 2
[ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq '.instance | {currentSession,sessionsStarted,sessionsEnded}'

echo
note "supersede sub-case: two session-starts with no end between (FR-009a)"
"$STACKCTL" session-start >/dev/null 2>&1 || true
sleep 1
"$STACKCTL" session-start >/dev/null 2>&1 || true
sleep 2
[ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq '.instance | {sessionsStarted,sessionsEnded,currentSession}'
note "  (expect sessionsStarted incremented twice; the superseded prior session recorded ended/abandoned)"

echo
note "RESTART sub-case (SC-006): record counts, restart the plane over the SAME durable store, re-query"
BEFORE="$( [ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq -c '.instance | {sessionsStarted,sessionsEnded,firstSeenAt}' || echo '{}')"
note "before restart: $BEFORE"
kill "$PLANE_PID" 2>/dev/null; wait "$PLANE_PID" 2>/dev/null; PLANE_PID=""
: > "$TMPROOT/plane2.log"
"$STACKCTL" plane serve --port 0 --token "$TOKEN" >"$TMPROOT/plane2.log" 2>&1 &
PLANE_PID=$!
PORT2=""
for _ in $(seq 1 60); do PORT2="$(grep -oE 'port [0-9]+' "$TMPROOT/plane2.log" | grep -oE '[0-9]+' || true)"; [ -n "$PORT2" ] && break; sleep 0.2; done
BASE="http://127.0.0.1:$PORT2"
note "plane restarted on $BASE (pid $PLANE_PID)"
AFTER="$( [ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq -c '.instance | {sessionsStarted,sessionsEnded,firstSeenAt}' || echo '{}')"
note "after  restart: $AFTER"
if [ "$BEFORE" = "$AFTER" ] && [ "$BEFORE" != "{}" ]; then
  note "S2 RESTART VERDICT: PASS — counters rehydrated unchanged from the durable event log"
else
  note "S2 RESTART VERDICT: see values above (counters should be identical across restart)"
fi

# ============================================================================
section "SCENARIO 3 (US3) — bearing and phase durations from a REAL transition"
# ============================================================================
note "producer: real './bin/stackctl workflow advance ... --apply' (a committed phase transition)"
"$STACKCTL" workflow advance multi:feature/dogfood-bearing --apply 2>&1 | sed 's/^/  /'
sleep 2.5
ID="$(first_id)"
echo "-- GET /v1/instances/:id currentBearing + phaseDurations --"
[ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq '.instance | {lastActivity,currentBearing,phaseDurations}'
BEARING="$( [ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")" | jq -r '.instance.currentBearing // "null"' || echo null)"
if [ "$BEARING" != "null" ]; then
  note "S3 VERDICT: PASS — currentBearing reflects the real phase transition"
else
  note "S3 VERDICT: FAIL — phase.entered reaches the plane (lastActivity=phase.entered) but"
  note "  currentBearing stays null and phaseDurations stays {}. The sidecar re-mint pipeline"
  note "  drops the {phase,from,item} snapshot (redaction expects a {content,allowlist} shape;"
  note "  the 037 producer emits a bare snapshot), so bearing/durations never derive."
fi
note "unentered-phase sub-case (SC-009): phaseDurations reports a not-yet-entered phase as ABSENT (never a fabricated 0) — shown by the {} above"

# ============================================================================
section "SCENARIO 4 — live is free; the API is read-only (FR-023/024, SC-007)"
# ============================================================================
note "zero-durable-reads (FR-023/SC-007): proven mechanically by vitest tests/instance/live-zero-durable-reads.test.ts (T024)."
note "  Repeating the live read below serves from the in-memory registry:"
for _ in 1 2 3; do curl -s -o /dev/null -w "  GET /v1/instances -> HTTP %{http_code}\n" "${AUTH[@]}" "$BASE/v1/instances"; done

echo "-- API is read-only (FR-024): a state-changing method on an instance route is rejected --"
curl -s -o /dev/null -w "  POST /v1/instances -> HTTP %{http_code} (expect non-2xx: no command surface)\n" -X POST "${AUTH[@]}" "$BASE/v1/instances"
curl -s -o /dev/null -w "  DELETE /v1/instances/:id -> HTTP %{http_code} (expect non-2xx)\n" -X DELETE "${AUTH[@]}" "$BASE/v1/instances/$(enc "${ID:-x}")"

echo "-- GET /v1/instances/:id/runs (the instance's execute/govern runs facet) --"
[ -n "$ID" ] && curl -s "${AUTH[@]}" "$BASE/v1/instances/$(enc "$ID")/runs" | jq .
note "  (empty runs is correct here — no execute/govern RUN was driven; ordinary verbs are not runs)"
echo "-- GET /v1/fleet still serves the cross-instance run view --"
curl -s "${AUTH[@]}" "$BASE/v1/fleet" | jq .

echo "-- GET /v1/instances/stream (snapshot-then-deltas): follow for ~4s while a real producer acts --"
( curl -s -N "${AUTH[@]}" "$BASE/v1/instances/stream" >"$TMPROOT/stream.out" 2>&1 ) &
STREAM_PID=$!
sleep 1
"$STACKCTL" session-start >/dev/null 2>&1 || true   # a real producer emits a delta
sleep 3
kill "$STREAM_PID" 2>/dev/null
echo "  --- raw SSE frames captured on /v1/instances/stream ---"
sed 's/^/  /' "$TMPROOT/stream.out" | head -40
if grep -q "instance-upserted\|snapshot" "$TMPROOT/stream.out"; then
  note "S4 STREAM VERDICT: PASS — the stream delivered snapshot/delta frames"
else
  note "S4 STREAM VERDICT: see raw frames above"
fi

# ============================================================================
section "SUPPORTING EVIDENCE — sidecar + plane logs, on-disk store shape"
# ============================================================================
echo "-- sidecar log --"; sed 's/^/  /' "$TMPROOT/sidecar.log"
echo "-- plane log (initial) --"; sed 's/^/  /' "$TMPROOT/plane.log"
echo "-- machine-local store tree (redirected off real \$HOME) --"
find "$HOME/Library/Application Support/stack-control" -maxdepth 3 2>/dev/null | sed "s#$HOME#\$HOME#;s/^/  /"

section "DOGFOOD COMPLETE"
echo "Evidence above is the real, captured output of real producers driving the real API."
