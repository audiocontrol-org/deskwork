# Quickstart: Validating Anchor Unification (016)

Runnable scenarios proving the feature end-to-end. Contracts: [anchor-resolution](./contracts/anchor-resolution.md), [cli-at-flag](./contracts/cli-at-flag.md), [resolver-error-wording](./contracts/resolver-error-wording.md). Entities: [data-model](./data-model.md).

## Prerequisites

- Repo checked out; `cd plugins/stack-control` (the dogfood domain).
- `npx vitest run src/__tests__/installation-isolation-probe.test.ts src/__tests__/installation-isolation-cwd.test.ts src/__tests__/govern-payload-self-reference.test.ts` — the pinned suites; green is the baseline claim for everything below.

## V1 — One domain per govern run (US1 / SC-001)

```bash
# Fixture: tmp repo with a domain at <repo>/plugins/demo + a feature inside it
# (the suite builds this; manual variant shown)
cd <fixture>/plugins/demo
../../../bin/stackctl govern --mode implement --feature <slug> --dry-run
```

Expect: feature root, run-dir, audit-log, store-exclusion, and slush lines all under `plugins/demo`; zero "no installation found" sub-step lines. From a cwd outside any domain the same command refuses with the not-found class; with `--at <fixture>/plugins/demo` it behaves identically to the in-domain run.

## V2 — Domain-complete config + seeding (US2 / SC-003)

```bash
TMP=$(mktemp -d) && cd "$TMP"
<plugin>/bin/stackctl setup --apply
ls .stack-control/audit-barrage-config.yaml   # seeded, owned copy
```

Expect: seeded config present; a governed dry-run reports `config: domain-override (...)`. Delete the override → reports `config: plugin-default (...)`. Place an `audit-barrage-config.yaml` in the PARENT directory → still `plugin-default`; the outer file is never read (verify with the suite's access assertion).

## V3 — No-overlap invariant (FR-013 / SC-009)

```bash
cd "$TMP" && mkdir -p inner && cd inner
<plugin>/bin/stackctl setup            # dry-run form
```

Expect: refusal naming `$TMP` as the enclosing domain; exit 2; nothing written. Then hand-create `inner/.stack-control/config.yaml` (simulating a copied marker) and run any verb from `inner/`: expect the overlap error naming both roots — not a nearest-first resolution, not the setup-remediation class.

## V4 — Backlog cwd-invariance + `--at` (US3 / SC-004)

```bash
cd <domain>           && bin/stackctl backlog capture "t1" --type bug
cd <domain>/src       && ../bin/stackctl backlog capture "t2" --type bug
cd /tmp               && <domain>/bin/stackctl backlog capture "t3" --type bug --at <domain>/src
```

Expect: three tasks in the SAME store; the third run's placement identical to the first two. `backlog import-slush --feature <slug>` from `<domain>/src` finds the audit log (no "feature not found"). `backlog promote` from a subdir emits no false "does not yet exist" advisory for an existing target.

## V5 — Spec-pointer is domain-internal (US4 / SC-007)

Fixture: domain context file carries the marker; a stale `specs/<feat>/spec.md` copy sits OUTSIDE the domain at the git toplevel.

Expect: resolution selects the domain's spec; the toplevel copy is never read. Remove the domain's context file → loud failure naming the marker source tried; never a fallback upward, never a downstream ENOENT on a constructed path.

## V6 — Wording classes (US5 / SC-005)

```bash
cd $(mktemp -d)   # outside any domain
for v in "backlog list" "scope-widen --help-probe" "scope-inventory" "slush-findings" "audit-barrage" "audit-barrage-lift" "install-scope-discovery"; do
  <plugin>/bin/stackctl $v 2>&1 | head -1
done
```

Expect: every line carries the identical `FATAL — `+`stackctl setup` class. Then corrupt a domain's `config.yaml` and re-run from inside it: every verb prints the parse error verbatim WITHOUT the class.

## V7 — Harness self-guard (US6 / SC-006)

Run the isolation suite with a simulated marker above the fixture root (the suite provides the simulation seam). Expect: initialization fails with the explanatory refusal BEFORE any verb row executes; zero writes outside the fixture tree (asserted by the suite's write-snapshot).

## V8 — Governance convergence (SC-008)

`/stack-control:execute` over this feature; the cross-model loop reaches gate OPEN with no "two sub-steps disagree about the domain" finding against the post-fix surface.
