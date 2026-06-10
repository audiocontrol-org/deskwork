#!/usr/bin/env bash
# Local-only regression smoke for AUDIT-20260605-12 (per the project no-CI-tests
# rule). Exercises the REAL govern.sh untracked-fold against a tmp git repo:
# a large untracked file that sorts FIRST must not suppress folding of a small
# untracked file that sorts LATER. With the old `break` the small file is
# silently dropped (FAIL); with `continue` it is still folded (PASS).
#
# Drives the real govern.sh (source copy) with lightweight stubs for the
# dw-lifecycle barrage verbs so the script reaches and completes the fold
# without network. The render stub captures the assembled vars JSON (which
# carries the folded diff) so we can assert the small file's content survived.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
GOVERN="${REPO_ROOT}/plugins/stack-control/spec-kit/deskwork-governance/scripts/bash/govern.sh"
[ -f "${GOVERN}" ] || { echo "smoke: FATAL — govern.sh not found at ${GOVERN}" >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/smoke-fold.XXXXXX")"
trap 'rm -rf "${WORK}"' EXIT

# --- a tmp git repo on a feature branch (govern.sh derives slug from it) ---
REPO="${WORK}/repo"
mkdir -p "${REPO}"
git -C "${REPO}" init -q
git -C "${REPO}" config user.email smoke@example.com
git -C "${REPO}" config user.name smoke
git -C "${REPO}" checkout -q -b feature/smoke-fold
echo "seed" > "${REPO}/seed.txt"
git -C "${REPO}" add -A
git -C "${REPO}" commit -qm "seed"

# --- untracked files: big sorts first, small sorts later ---
# >256KB of TEXT (so grep -Iq . treats it as text, not binary). Generated
# without a pipe to avoid SIGPIPE under `set -o pipefail`.
awk 'BEGIN{for(i=0;i<6000;i++) print "BIGFILLER line of ascii text to exceed the fold budget padding xxxxxxxxxx"}' \
  > "${REPO}/a-big.txt"
printf 'ZSMALLMARKER unique content that must survive the fold\n' > "${REPO}/z-small.txt"

# --- stub dw-lifecycle: render captures vars JSON; barrage/lift no-op ---
BIN="${WORK}/bin"
mkdir -p "${BIN}"
CAPTURE="${WORK}/captured-vars.json"
cat > "${BIN}/dw-lifecycle" <<STUB
#!/usr/bin/env bash
set -euo pipefail
verb="\${1:-}"; shift || true
vars=""; out=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    --vars-file) vars="\$2"; shift 2;;
    --output) out="\$2"; shift 2;;
    --output-run-dir) shift;;
    *) shift;;
  esac
done
case "\${verb}" in
  audit-barrage-render) cp "\${vars}" "${CAPTURE}"; [ -n "\${out}" ] && cp "\${vars}" "\${out}"; ;;
  audit-barrage) echo "${WORK}/run-dir";;
  audit-barrage-lift) :;;
esac
STUB
chmod +x "${BIN}/dw-lifecycle"
mkdir -p "${WORK}/run-dir"

# --- run the real govern.sh against the tmp repo ---
STDERR="${WORK}/stderr.txt"
set +e
( cd "${REPO}" && PATH="${BIN}:${PATH}" GOVERN_FEATURE_SLUG=smoke-fold GOVERN_DIFF_BASE=HEAD \
    bash "${GOVERN}" >/dev/null 2>"${STDERR}" )
rc=$?
set -e

[ "${rc}" -eq 0 ] || { echo "smoke: FATAL — govern.sh exited ${rc}"; cat "${STDERR}" >&2; exit 1; }
[ -f "${CAPTURE}" ] || { echo "smoke: FATAL — render stub did not capture vars JSON"; exit 1; }

# The big file should be reported as a budget skip ...
grep -q "budget" "${STDERR}" || { echo "smoke: FATAL — expected a budget-skip log for a-big.txt"; cat "${STDERR}" >&2; exit 1; }

# ... and the SMALL file (sorting after the big one) must still be folded.
if grep -q "ZSMALLMARKER" "${CAPTURE}"; then
  echo "smoke OK — small untracked file folded despite an earlier oversized file (AUDIT-20260605-12 fixed)."
  exit 0
else
  echo "smoke FAIL — small untracked file (z-small.txt) was dropped after an earlier oversized file (AUDIT-20260605-12 regression: fold used 'break' not 'continue')." >&2
  exit 1
fi
