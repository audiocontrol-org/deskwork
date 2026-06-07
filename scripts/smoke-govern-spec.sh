#!/usr/bin/env bash
#
# smoke-govern-spec.sh — deterministic local smoke for the spec-governance
# orchestration script (T004 / T025, US1) + regression for the empty-models
# array bug the T024 dogfood caught.
#
# Drives plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh
# end-to-end against a throwaway feature tree, with a STUB barrage entrypoint that
# fakes the expensive model-firing step (render + barrage) but DELEGATES the lift
# to the REAL `dw-lifecycle audit-barrage-lift` — so the orchestration control
# flow, the audit-log lift format, and the convergence gate are exercised
# faithfully without live model CLIs. Asserts:
#
#   T004  a run-dir appears under the tmp repo's audit-runs/ AND the feature
#         audit-log.md gains a dated `audit-barrage lift (...)` section.
#   T025  the CLEAN fixture (0 HIGH) STILL records a run-dir + a dated audit-log
#         section — a clean run is recorded, never pre-emptively skipped.
#   REG   the run with GOVERN_MODELS UNSET (the default, all-models path) does
#         NOT die with `_models_flag[@]: unbound variable` on bash 3.2 — the
#         exact failure the dogfood surfaced.
#
# Live mode (SMOKE_LIVE=1) fires the REAL multi-model barrage instead of the stub
# (slow; needs model CLIs). Local-only (project rule: no barrage in CI).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GOVERN_SPEC_SH="${REPO_ROOT}/plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh"
FIXTURES="${REPO_ROOT}/plugins/stack-control/tests/fixtures/spec-governance"
[ -f "${GOVERN_SPEC_SH}" ] || { echo "smoke-govern-spec: FAIL — script not found at ${GOVERN_SPEC_SH}" >&2; exit 1; }
fail() { echo "smoke-govern-spec: FAIL — $1" >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/smoke-govern-spec.XXXXXX")"
trap 'rm -rf "${WORK}"' EXIT

# --- stub barrage entrypoint: fakes render+barrage, delegates lift to the real verb ---
STUB="${WORK}/stub-dw-lifecycle"
cat > "${STUB}" <<'STUBEOF'
#!/usr/bin/env bash
set -euo pipefail
verb="${1:-}"; shift || true
case "${verb}" in
  audit-barrage-render)
    out=""
    while [ $# -gt 0 ]; do [ "$1" = "--output" ] && { out="$2"; shift; }; shift; done
    printf 'STUB PROMPT\n' > "${out}" ;;
  audit-barrage)
    feat=""
    while [ $# -gt 0 ]; do case "$1" in --feature) feat="$2"; shift ;; esac; shift; done
    rundir="$(pwd)/.dw-lifecycle/scope-discovery/audit-runs/20260606T000000000Z-${feat}"
    mkdir -p "${rundir}"
    cat > "${rundir}/claude.md" <<'MODEL'
### Stubbed low-severity finding from the deterministic smoke

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   low
Surface:    fixtures/spec.md:1

A stubbed low finding so the lift + convergence gate run deterministically.
MODEL
    printf '%s\n' "${rundir}" ;;
  audit-barrage-lift)
    exec dw-lifecycle audit-barrage-lift "$@" ;;
  *) echo "stub: unsupported verb '${verb}'" >&2; exit 2 ;;
esac
STUBEOF
chmod +x "${STUB}"

run_case() {
  local label="$1" fixture_spec="$2" slug="$3" models_env="$4"
  local repo="${WORK}/${slug}"
  local feature_dir="${repo}/docs/1.0/001-IN-PROGRESS/${slug}"
  mkdir -p "${feature_dir}"
  printf '# Audit Log — %s\n' "${slug}" > "${feature_dir}/audit-log.md"
  cp "${fixture_spec}" "${repo}/spec.md"
  # The lift verb resolves the feature root via `git rev-parse --show-toplevel`
  # (repo.ts), so the tmp tree must be a git repo — production always is.
  git -C "${repo}" init -q

  local barrage_bin="${STUB}"
  [ "${SMOKE_LIVE:-0}" = "1" ] && barrage_bin="dw-lifecycle"

  echo "smoke-govern-spec: [${label}] running govern-spec.sh (GOVERN_MODELS='${models_env}', bin=$(basename "${barrage_bin}")) ..." >&2
  GOVERN_REPO_ROOT="${repo}" \
  GOVERN_FEATURE_SLUG="${slug}" \
  GOVERN_SPEC_PATH="${repo}/spec.md" \
  GOVERN_MODELS="${models_env}" \
  GOVERN_BARRAGE_BIN="${barrage_bin}" \
    bash "${GOVERN_SPEC_SH}" >"${repo}/out.txt" 2>"${repo}/err.txt" || true

  grep -q 'unbound variable' "${repo}/err.txt" \
    && fail "[${label}] govern-spec.sh hit an unbound-variable error:\n$(cat "${repo}/err.txt")"

  local runs_dir="${repo}/.dw-lifecycle/scope-discovery/audit-runs"
  [ -d "${runs_dir}" ] || fail "[${label}] no audit-runs dir under ${runs_dir}"
  local n_runs
  n_runs="$(find "${runs_dir}" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  [ "${n_runs}" -ge 1 ] || fail "[${label}] expected >=1 run-dir, found ${n_runs}"

  grep -Eq '^##[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]+—[[:space:]]+audit-barrage[[:space:]]+lift[[:space:]]+\(' \
    "${feature_dir}/audit-log.md" \
    || fail "[${label}] audit-log gained no dated 'audit-barrage lift (...)' section"

  echo "smoke-govern-spec: [${label}] OK — ${n_runs} run-dir(s) + dated lift section recorded" >&2
}

# T004 — high-finding fixture, GOVERN_MODELS pinned.
run_case "high-finding" "${FIXTURES}/high-finding/spec.md" "spec-gov-smoke-high" "claude"
# T025 — clean fixture: a clean run is STILL recorded.
run_case "clean" "${FIXTURES}/clean/spec.md" "spec-gov-smoke-clean" "claude"
# REG — GOVERN_MODELS UNSET (empty): the default all-models path must not crash
# on the empty-array expansion (the T024 dogfood regression).
run_case "models-unset" "${FIXTURES}/clean/spec.md" "spec-gov-smoke-default" ""

echo "smoke-govern-spec: PASS"
