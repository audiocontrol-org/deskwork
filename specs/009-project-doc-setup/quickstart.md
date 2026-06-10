# Quickstart / Validation: Post-Install Project Setup

Runnable scenarios proving the feature end-to-end. Each maps to a user story + success criteria. All run in a **plain shell** (no Claude Code surface — SC-009). `stackctl` = the plugin CLI (dev: `tsx plugins/stack-control/src/cli.ts`). Use throwaway tmp dirs; never run against the live dogfood tree.

Prerequisites: Node ≥20, the `backlog` binary on PATH (reused from 008), a git repo in the tmp dir (the upward walk stops at the filesystem root regardless, but a git repo mirrors real use).

## Scenario 1 — Fresh setup in one step (US1, SC-001/SC-004)

```
mkdir -p /tmp/sc-fresh && cd /tmp/sc-fresh && git init -q
stackctl setup --apply
# EXPECT: report lists created: config, roadmap, inbox, backlog, program audit log — with locations
stackctl roadmap next        # EXPECT: resolves THIS project's ROADMAP.md (no --doc), "0 ready"
stackctl inbox list          # EXPECT: resolves THIS project's DESIGN-INBOX.md, empty
stackctl backlog list        # EXPECT: resolves THIS project's backlog store, empty
```

PASS: every verb operates on the scaffolded project-local file with no `--doc` and no bundled-copy fallback.

## Scenario 2 — Non-destructive idempotent re-run (US2, SC-002)

```
cd /tmp/sc-fresh
stackctl inbox capture --idea "keep me" --apply      # real content
sha=$(shasum DESIGN-INBOX.md ROADMAP.md)
stackctl setup --apply                                # re-run
shasum -c <<<"$sha"                                   # EXPECT: OK — unchanged
# EXPECT: report shows all items already-present
```

PASS: pre-existing content is byte-for-byte preserved; only-missing-created.

## Scenario 3 — Configurable locations (US3, SC-007)

```
mkdir -p /tmp/sc-cfg && cd /tmp/sc-cfg && git init -q
mkdir -p .stack-control && cat > .stack-control/config.yaml <<'YAML'
version: 1
paths:
  roadmap: "docs/ROADMAP.md"
  inbox: "notes/DESIGN-INBOX.md"
YAML
stackctl setup --apply
# EXPECT: roadmap at docs/ROADMAP.md, inbox at notes/DESIGN-INBOX.md; config records them
stackctl roadmap next        # EXPECT: resolves docs/ROADMAP.md (configured), no --doc
```

PASS: each working file lands at its configured location; verbs resolve the configured path.

## Scenario 4 — Monorepo isolation (US4, SC-008)

```
mkdir -p /tmp/sc-mono/pkgA /tmp/sc-mono/pkgB && cd /tmp/sc-mono && git init -q
stackctl setup --at pkgA --apply
stackctl setup --at pkgB --apply
( cd pkgA && stackctl inbox capture --idea "A-only" --apply )
# EXPECT: pkgB/DESIGN-INBOX.md does NOT contain "A-only"
shaB=$(shasum pkgB/DESIGN-INBOX.md)
stackctl setup --at pkgA --apply        # re-setup A
( shasum -c <<<"$shaB" )                # EXPECT: OK — B untouched
```

PASS: two installations isolated; a capture in one reaches zero of the other's files; re-setup of one leaves the other unchanged. A verb run in `pkgA/sub/dir` resolves to pkgA (nearest-wins).

## Scenario 5 — Verify fails loud on malformed (US5, SC-005)

```
mkdir -p /tmp/sc-bad/.stack-control && cd /tmp/sc-bad && git init -q
cat > .stack-control/config.yaml <<'YAML'
version: 1
YAML
printf 'this is not a governed roadmap\n' > ROADMAP.md   # malformed, present
stackctl setup --apply ; echo "exit=$?"
# EXPECT: exit=1; report names ROADMAP.md as malformed; ready=false; NOT overwritten
shasum ROADMAP.md     # unchanged (drift surfaced, not clobbered — FR-010)
```

PASS: a present-but-malformed required file produces a fail-loud, named error and zero false-clean reports.

## Scenario 6 — Auto-on-first-use parity (FR-015/016/017)

```
mkdir -p /tmp/sc-auto/.stack-control && cd /tmp/sc-auto && git init -q
printf 'version: 1\n' > .stack-control/config.yaml      # installation exists, files do not
stackctl inbox capture --idea "first" --apply
# EXPECT: verb ANNOUNCES it scaffolded the missing inbox (and any siblings it needs), then captures "first"
# Compare to an explicit-setup project: the scaffolded inbox skeleton is byte-identical
```

PASS: a verb lazily bootstraps + announces + proceeds; the scaffold is identical to `setup`'s. A verb run **outside** any installation fails loud directing to `stackctl setup`.

## Scenario 7 — Collision/escape refusal (FR-024)

```
mkdir -p /tmp/sc-collide/.stack-control && cd /tmp/sc-collide && git init -q
cat > .stack-control/config.yaml <<'YAML'
version: 1
paths:
  roadmap: "../escape/ROADMAP.md"     # escapes the installation root
YAML
stackctl setup --apply ; echo "exit=$?"   # EXPECT: exit=2; descriptive escape error
```

PASS: a configured location that escapes the root (or collides with another key/installation) is refused fail-loud.

## Cross-cutting checks

- **Plain-shell (SC-009)**: every scenario above ran with no Claude Code session — the CLI alone.
- **No network/secrets/interactive (FR-014)**: no scenario requires any.
- **Constitution I**: each scenario corresponds to a RED-first test under `tests/setup/` or `tests/config/` written before its implementation.
