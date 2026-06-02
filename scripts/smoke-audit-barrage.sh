#!/usr/bin/env bash
# Local smoke test for the audit-barrage verb pair. Not wired into CI
# per .claude/rules/agent-discipline.md "No test infrastructure in CI"
# — this is a hand-run gate the operator exercises before tagging a
# release that ships audit-barrage changes.
#
# Exercises the verb pair end-to-end against fake CLI shims (so it
# never touches real model APIs):
#
#   1. dw-lifecycle audit-barrage-render --vars-file ... --output ...
#        -> prompt renders; declared vars substituted; file written
#   2. dw-lifecycle audit-barrage --feature ... --prompt-file ...
#      with a config that points at fake-CLI shims
#        -> run dir + INDEX.md + per-model .md files materialize
#
# Exits 0 with "OK" on the last line. Exits 1 with a specific error
# otherwise.
#
# Honors $SMOKE_AUDIT_BARRAGE_TMPDIR for the fixture root; otherwise
# mktemp.

set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)"
DW_BIN="$ROOT/plugins/dw-lifecycle/bin/dw-lifecycle"

if [ ! -x "$DW_BIN" ]; then
  echo "FAIL: dw-lifecycle bin not found or not executable at $DW_BIN" >&2
  exit 1
fi

# Fixture root.
if [ -n "${SMOKE_AUDIT_BARRAGE_TMPDIR:-}" ]; then
  FIXTURE="$SMOKE_AUDIT_BARRAGE_TMPDIR"
  rm -rf "$FIXTURE"
  mkdir -p "$FIXTURE"
else
  FIXTURE="$(mktemp -d -t smoke-audit-barrage-XXXXXX)"
fi

cleanup() {
  if [ -z "${SMOKE_AUDIT_BARRAGE_TMPDIR:-}" ]; then
    rm -rf "$FIXTURE"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

echo "== smoke-audit-barrage: build fixture at $FIXTURE =="

# Lay out a minimal repo-shaped tree so the verb's repo-root resolution
# has a place to land its .dw-lifecycle/scope-discovery/audit-runs/
# directory.
mkdir -p "$FIXTURE/.dw-lifecycle/scope-discovery"

# Build two fake-CLI shim scripts. Each one accepts an opaque prompt
# argv and emits a deterministic finding block on stdout, then exits 0.
# Mirroring the shape the real claude/codex CLIs use means the smoke
# exercises the same spawn machinery as a production invocation.

cat > "$FIXTURE/fake-claude-cli" <<'FAKECLAUDE'
#!/usr/bin/env node
// Prompt arrives in argv[2..]; we ignore the body and emit a
// deterministic finding block so the smoke can assert on it.
const body = [
  '### Smoke finding from fake-claude',
  '',
  'Finding-ID: AUDIT-BARRAGE-fake-claude-01',
  'Status:     open',
  'Severity:   informational',
  'Surface:    smoke-fixture',
  '',
  'Fake-claude found a deterministic smoke finding.',
  '',
].join('\n');
process.stdout.write(body);
process.exit(0);
FAKECLAUDE
chmod +x "$FIXTURE/fake-claude-cli"

cat > "$FIXTURE/fake-codex-cli" <<'FAKECODEX'
#!/usr/bin/env node
const body = [
  '### Smoke finding from fake-codex',
  '',
  'Finding-ID: AUDIT-BARRAGE-fake-codex-01',
  'Status:     open',
  'Severity:   low',
  'Surface:    smoke-fixture',
  '',
  'Fake-codex independently noticed something noteworthy.',
  '',
].join('\n');
process.stdout.write(body);
process.exit(0);
FAKECODEX
chmod +x "$FIXTURE/fake-codex-cli"

# Seed an audit-barrage-config.yaml pointing at the fake CLIs.
cat > "$FIXTURE/.dw-lifecycle/scope-discovery/audit-barrage-config.yaml" <<CONFIG
models:
  - name: fake-claude
    binary: $FIXTURE/fake-claude-cli
    args_template: "{{prompt}}"
    timeout_seconds: 30
  - name: fake-codex
    binary: $FIXTURE/fake-codex-cli
    args_template: "{{prompt}}"
    timeout_seconds: 30
CONFIG

# ---------- 1. audit-barrage-render ----------

echo "== smoke-audit-barrage: render prompt via audit-barrage-render =="

cat > "$FIXTURE/vars.json" <<'VARS'
{
  "feature_slug": "smoke",
  "workplan_summary": "smoke-workplan-summary",
  "diff": "smoke-diff-body",
  "audit_log_excerpt": "smoke-audit-excerpt",
  "commit_subjects": "smoke-commit-subject-1"
}
VARS

PROMPT_OUT="$FIXTURE/rendered-prompt.md"

if ! "$DW_BIN" audit-barrage-render \
  --feature smoke \
  --vars-file "$FIXTURE/vars.json" \
  --output "$PROMPT_OUT" >"$FIXTURE/render.stdout" 2>"$FIXTURE/render.stderr"; then
  cat "$FIXTURE/render.stderr" >&2
  fail "audit-barrage-render exited non-zero"
fi

[ -f "$PROMPT_OUT" ] || fail "rendered prompt file not written at $PROMPT_OUT"

grep -q "smoke-diff-body" "$PROMPT_OUT" \
  || fail "rendered prompt missing diff substitution"
grep -q "smoke-workplan-summary" "$PROMPT_OUT" \
  || fail "rendered prompt missing workplan_summary substitution"
grep -q "smoke-audit-excerpt" "$PROMPT_OUT" \
  || fail "rendered prompt missing audit_log_excerpt substitution"

# Declared-var markers must NOT survive substitution.
if grep -E '\{\{(feature_slug|workplan_summary|diff|audit_log_excerpt|commit_subjects)\}\}' "$PROMPT_OUT" >/dev/null; then
  fail "rendered prompt contains unsubstituted declared-var marker"
fi

echo "  ok — rendered prompt written ($(wc -c <"$PROMPT_OUT") bytes)"

# ---------- 2. audit-barrage ----------

echo "== smoke-audit-barrage: fire fake-CLI barrage =="

if ! "$DW_BIN" audit-barrage \
  --feature smoke \
  --prompt-file "$PROMPT_OUT" \
  --repo-root "$FIXTURE" >"$FIXTURE/barrage.stdout" 2>"$FIXTURE/barrage.stderr"; then
  cat "$FIXTURE/barrage.stderr" >&2
  fail "audit-barrage exited non-zero"
fi

# stdout should be a single JSON object — the BarrageRun record.
if ! node -e "JSON.parse(require('fs').readFileSync('$FIXTURE/barrage.stdout','utf8'))"; then
  fail "audit-barrage stdout is not valid JSON"
fi

# Discover the run dir from the BarrageRun JSON.
RUN_DIR="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$FIXTURE/barrage.stdout','utf8')).runDir)")"
[ -d "$RUN_DIR" ] || fail "BarrageRun.runDir does not exist: $RUN_DIR"

[ -f "$RUN_DIR/INDEX.md" ] || fail "INDEX.md missing from $RUN_DIR"
[ -f "$RUN_DIR/PROMPT.md" ] || fail "PROMPT.md missing from $RUN_DIR"
[ -f "$RUN_DIR/fake-claude.md" ] || fail "fake-claude.md missing from $RUN_DIR"
[ -f "$RUN_DIR/fake-codex.md" ] || fail "fake-codex.md missing from $RUN_DIR"
[ -d "$RUN_DIR/stderr" ] || fail "stderr/ subdir missing from $RUN_DIR"

# Per-model stdout captures must contain the deterministic finding text.
grep -q "Smoke finding from fake-claude" "$RUN_DIR/fake-claude.md" \
  || fail "fake-claude.md missing the deterministic finding block"
grep -q "Smoke finding from fake-codex" "$RUN_DIR/fake-codex.md" \
  || fail "fake-codex.md missing the deterministic finding block"

# INDEX.md must list both models.
grep -q "### fake-claude" "$RUN_DIR/INDEX.md" || fail "INDEX.md missing fake-claude row"
grep -q "### fake-codex" "$RUN_DIR/INDEX.md" || fail "INDEX.md missing fake-codex row"

# Timestamp format on the run-dir must include the millisecond suffix.
case "$(basename "$RUN_DIR")" in
  *T[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]Z-smoke) ;;
  *) fail "run-dir name does not match expected millisecond-resolution shape: $(basename "$RUN_DIR")" ;;
esac

echo "  ok — run dir at $RUN_DIR with INDEX.md + 2 model captures"

echo ""
echo "OK"
