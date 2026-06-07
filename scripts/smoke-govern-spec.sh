#!/usr/bin/env bash
#
# smoke-govern-spec.sh — RED-first local smoke for the spec-governance
# orchestration script (T004 / T025, US1).
#
# Drives plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh
# against a throwaway feature tree in a tmp dir, firing the REAL dw-lifecycle
# audit-barrage (one model lane by default to keep it cheap), and asserts:
#
#   T004  over the high-finding fixture: a run-dir appears under the tmp
#         repo's .dw-lifecycle/scope-discovery/audit-runs/ AND the feature
#         audit-log.md gains a dated `audit-barrage lift (...)` section.
#   T025  over the CLEAN fixture (0 findings): govern-spec.sh STILL records a
#         run-dir + a dated audit-log section — a clean run is recorded, never
#         pre-emptively skipped (empty revisions beat missed changes). Unlike
#         dw-lifecycle implement-hook's no-new-diff guard, govern-spec.sh
#         (mirroring govern.sh) always runs.
#
# Local-only (project rule: no barrage in CI). Requires dw-lifecycle on PATH,
# jq, git, and at least one model-family CLI. Override the lane(s) with
# SMOKE_MODELS (default: claude).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GOVERN_SPEC_SH="${REPO_ROOT}/plugins/stack-control/spec-kit/spec-governance/scripts/bash/govern-spec.sh"
FIXTURES="${REPO_ROOT}/plugins/stack-control/tests/fixtures/spec-governance"
SMOKE_MODELS="${SMOKE_MODELS:-claude}"

if [ ! -f "${GOVERN_SPEC_SH}" ]; then
  echo "smoke-govern-spec: FAIL — orchestration script not found at ${GOVERN_SPEC_SH}" >&2
  exit 1
fi

fail() { echo "smoke-govern-spec: FAIL — $1" >&2; exit 1; }

run_one() {
  local label="$1" fixture_spec="$2" slug="$3"
  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/smoke-govern-spec.XXXXXX")"
  trap 'rm -rf "${work}"' RETURN

  local feature_dir="${work}/docs/1.0/001-IN-PROGRESS/${slug}"
  mkdir -p "${feature_dir}"
  printf '# Audit Log — %s\n' "${slug}" > "${feature_dir}/audit-log.md"
  cp "${fixture_spec}" "${work}/spec.md"

  echo "smoke-govern-spec: [${label}] firing govern-spec.sh (models=${SMOKE_MODELS}) over ${slug} ..." >&2
  GOVERN_REPO_ROOT="${work}" \
  GOVERN_FEATURE_SLUG="${slug}" \
  GOVERN_SPEC_PATH="${work}/spec.md" \
  GOVERN_MODELS="${SMOKE_MODELS}" \
    bash "${GOVERN_SPEC_SH}" || true   # gate may exit 1 (blocked) — assert artifacts, not exit

  # Assertion 1: a run-dir was recorded under the tmp repo.
  local runs_dir="${work}/.dw-lifecycle/scope-discovery/audit-runs"
  [ -d "${runs_dir}" ] || fail "[${label}] no audit-runs dir under ${runs_dir}"
  local n_runs
  n_runs="$(find "${runs_dir}" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  [ "${n_runs}" -ge 1 ] || fail "[${label}] expected >=1 run-dir, found ${n_runs}"

  # Assertion 2: the audit-log gained a dated lift section (recorded, never skipped).
  grep -Eq '^##[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]+—[[:space:]]+audit-barrage[[:space:]]+lift[[:space:]]+\(' \
    "${feature_dir}/audit-log.md" \
    || fail "[${label}] audit-log gained no dated 'audit-barrage lift (...)' section"

  echo "smoke-govern-spec: [${label}] OK — ${n_runs} run-dir(s) + dated lift section recorded" >&2
}

# T004 — high-finding fixture: must record run-dir + lift section.
run_one "high-finding" "${FIXTURES}/high-finding/spec.md" "spec-gov-smoke-high"

# T025 — clean fixture: a clean run is STILL recorded (never pre-emptively skipped).
run_one "clean" "${FIXTURES}/clean/spec.md" "spec-gov-smoke-clean"

echo "smoke-govern-spec: PASS"
