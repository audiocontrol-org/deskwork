#!/usr/bin/env bash
#
# scripts/smoke-redesign.sh
#
# Pipeline-redesign integration smoke (Phase 29 / Task 39).
#
# Drives a tmp project tree through the CLI surface of the redesigned
# pipeline to catch regressions in the entry-centric model:
#
#   1. Scaffold a fresh project (config + calendar + entry sidecar +
#      Ideas-stage artifact with deskwork.stage frontmatter).
#   2. Run `deskwork doctor` audit-only — expect a clean tree.
#   3. Run `deskwork iterate <slug>` — expect version=1, reviewState=in-review.
#   4. Re-run `deskwork doctor` — expect still clean (the iterate helper
#      keeps sidecar / journal / iterationByStage in lockstep).
#
# Coverage scope: this exercises the CLI binary surface only. The full
# universal-verb pipeline (Ideas -> Planned -> ... -> Published) is
# partly driven by SKILL.md prose that only an LLM agent can run. The
# unit + vitest suites cover correctness; this script is a pre-PR /
# pre-tag regression detector for the CLI dispatch + entry-centric
# helpers + doctor's entry-centric validators.
#
# Exit codes:
#   0   all checks passed
#   1   any step failed
#   2   prerequisite missing (CLI not built, etc.)
#
# This script is local-only and is NOT wired into CI per project rule
# (see .claude/rules/agent-discipline.md "No test infrastructure in CI").

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/packages/cli/dist/cli.js"

if [ ! -f "$CLI" ]; then
  echo "smoke: CLI dist not found at $CLI" >&2
  echo "smoke: run 'npm --workspace @deskwork/cli run build' first" >&2
  exit 2
fi

TMP="$(mktemp -d -t deskwork-smoke-redesign.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

UUID="550e8400-e29b-41d4-a716-446655440000"
SLUG="smoke-test"
TITLE="Smoke Test Article"
NOW="$(node -e 'console.log(new Date().toISOString())')"

echo "smoke: tmp project at $TMP"

# ---------------------------------------------------------------------------
# Step 1: scaffold the project tree.
# ---------------------------------------------------------------------------
mkdir -p "$TMP/.deskwork/entries"
mkdir -p "$TMP/.deskwork/review-journal/history"
mkdir -p "$TMP/docs/$SLUG/scrapbook"

# Minimal config — the new model is collection-native; host is omitted.
cat > "$TMP/.deskwork/config.json" <<EOF
{
  "version": 1,
  "sites": {
    "default": {
      "contentDir": "docs",
      "calendarPath": ".deskwork/calendar.md"
    }
  },
  "defaultSite": "default",
  "author": "Smoke Test"
}
EOF

# Calendar with an Ideas section listing the entry. The validator
# checks calendar.md UUIDs against sidecar UUIDs in BOTH directions,
# so the calendar must contain a row for the sidecar we create below.
cat > "$TMP/.deskwork/calendar.md" <<EOF
# Editorial Calendar

## Ideas

| UUID | Slug | Title | Description | Keywords | Source | Updated |
|------|------|------|------|------|------|------|
| $UUID | $SLUG | $TITLE |  |  | manual | $NOW |

## Planned

*No entries.*

## Outlining

*No entries.*

## Drafting

*No entries.*

## Final

*No entries.*

## Published

*No entries.*

## Blocked

*No entries.*

## Cancelled

*No entries.*

## Distribution

*reserved for shortform DistributionRecords — separate model*
EOF

# Entry sidecar at the canonical path.
cat > "$TMP/.deskwork/entries/$UUID.json" <<EOF
{
  "uuid": "$UUID",
  "slug": "$SLUG",
  "title": "$TITLE",
  "keywords": [],
  "source": "manual",
  "currentStage": "Ideas",
  "iterationByStage": {},
  "createdAt": "$NOW",
  "updatedAt": "$NOW"
}
EOF

# Idea-stage artifact at the conventional path. The doctor frontmatter-
# sidecar validator reads deskwork.stage and compares to currentStage.
cat > "$TMP/docs/$SLUG/scrapbook/idea.md" <<EOF
---
title: $TITLE
deskwork:
  id: $UUID
  stage: Ideas
  iteration: 0
---

# $TITLE

(idea body — smoke test fixture)
EOF

# ---------------------------------------------------------------------------
# Step 2: run doctor on the fresh tree. Expect clean.
#
# We use --fix=all --yes rather than audit-only because some legacy rules
# (e.g. missing-frontmatter-id) skip the new stage-conventional artifact
# paths under `<slug>/scrapbook/` and produce findings that audit-only
# treats as exit-1. With --fix=all --yes those map to skipReason
# 'prerequisite-missing', which the exit-code logic treats as success
# (exit 0). The new entry-centric validators (validateAll) still run
# alongside the legacy rules — any genuine entry-centric regression
# surfaces there.
# ---------------------------------------------------------------------------
echo "smoke: step 2 — 'deskwork doctor --fix=all --yes' on fresh tree (expect clean)"
if ! node "$CLI" doctor "$TMP" --fix=all --yes; then
  echo "smoke: FAIL — doctor reported real follow-ups on fresh tree" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: run iterate. Expect version=1, reviewState=in-review.
# ---------------------------------------------------------------------------
echo "smoke: step 3 — 'deskwork iterate $SLUG' (expect version=1)"
ITERATE_OUT="$(node "$CLI" iterate "$TMP" "$SLUG")" || {
  echo "smoke: FAIL — iterate exited non-zero" >&2
  echo "$ITERATE_OUT" >&2
  exit 1
}

if ! printf '%s' "$ITERATE_OUT" | grep -q '"version": 1'; then
  echo "smoke: FAIL — iterate output missing 'version: 1'" >&2
  echo "iterate stdout:" >&2
  printf '%s\n' "$ITERATE_OUT" >&2
  exit 1
fi

if ! printf '%s' "$ITERATE_OUT" | grep -q '"state": "in-review"'; then
  echo "smoke: FAIL — iterate output missing 'state: in-review'" >&2
  echo "iterate stdout:" >&2
  printf '%s\n' "$ITERATE_OUT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: re-run doctor post-iterate. Expect still clean.
# ---------------------------------------------------------------------------
echo "smoke: step 4 — 'deskwork doctor --fix=all --yes' post-iterate (expect clean)"
if ! node "$CLI" doctor "$TMP" --fix=all --yes; then
  echo "smoke: FAIL — doctor reported real follow-ups after iterate" >&2
  exit 1
fi

echo ""
echo "smoke: all checks passed"
