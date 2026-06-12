# Quickstart: stack-control front door — validation guide

Runnable scenarios that prove Feature 1 works end-to-end. Each maps to a Success Criterion. Run from the repo root on `feature/pluggable-lifecycle-providers`. These are validation steps, not implementation — implementation details live in `tasks.md`.

> Prerequisites: Node ≥20, `dw-lifecycle` CLI on PATH (governance's outbound seam), `jq`, GitHub Spec Kit (`specify`) installed, the stack-control plugin loadable (`claude --plugin-dir plugins/stack-control`).

---

## Scenario A — Plugin stands up; `stackctl` resolves (SC-001, US3)

```bash
claude plugin validate plugins/stack-control          # manifest valid
plugins/stack-control/bin/stackctl version            # prints the repo lockstep version (matches marketplace.json)
```

**Expected**: validation passes; `stackctl version` prints the repo's single lockstep version (the same version `marketplace.json` and every other plugin carry — R4). 0 manual wiring steps beyond loading the plugin.

---

## Scenario B — Governance extension registered from the new home (SC-001, FR-003)

```bash
ls plugins/stack-control/spec-kit/deskwork-governance/   # moved here (old dw-lifecycle path gone)
specify extension list                                   # shows deskwork-governance enabled
```

**Expected**: the extension source lives under `plugins/stack-control/`; the old `plugins/dw-lifecycle/spec-kit/deskwork-governance/` no longer exists; `specify extension list` shows `deskwork-governance` enabled.

---

## Scenario C — `execute-check` fails loud on a non-runnable spec (SC-006, FR-008)

```bash
# point at a spec dir missing tasks.md
plugins/stack-control/bin/stackctl execute-check --spec specs/<a-spec-without-tasks>
echo "exit=$?"
```

**Expected**: exit ≠0, stderr names the missing artifact (e.g. `tasks.md missing; spec not runnable`). No exit-0, no faked verdict.

---

## Scenario D — Governance fires automatically after native execution (SC-002, SC-004, US1 🎯)

The headless smoke proves the orchestration; the manual run proves the hook fires.

```bash
# (1) Orchestration (deterministic, headless) — proves run-dir + lanes + lift:
bash scripts/smoke-governance-after-implement.sh      # GOVERN path now points at plugins/stack-control/...
```

**Expected (smoke)**: a new run-dir under `.dw-lifecycle/scope-discovery/audit-runs/`; `INDEX.md` lists ≥2 model lanes; findings appended to the feature `audit-log.md`. Exit 0.

```bash
# (2) Hook firing (in-session) — the operator runs, through the front door:
#   /stack-control:execute   (drives native /speckit-implement over a small spec)
# Observe: after_implement fires governance with ZERO manual barrage invocation.
```

**Expected (manual)**: native execution completes; governance fires automatically; findings recorded. Neutrality grep over `govern.sh` + command body returns **0** provider-identity matches (SC-004).

---

## Scenario E — Isolation invariant: dw-lifecycle unchanged (SC-003, US3, VR-2)

```bash
# No inbound coupling from dw-lifecycle to the moved extension:
grep -rn "deskwork-governance\|spec-kit/" plugins/dw-lifecycle/src plugins/dw-lifecycle/bin \
  plugins/dw-lifecycle/commands plugins/dw-lifecycle/skills    # expect: no matches

# dw-lifecycle's own suite passes identically before/after the move:
npm --workspace @deskwork/plugin-dw-lifecycle test
```

**Expected**: zero references (no inbound dependency); dw-lifecycle's test suite passes unchanged.

---

## Scenario F — Self-hosting proof (SC-005, FR-009)

```text
# Through the front door (in-session), author + run the NEXT feature's spec:
#   /stack-control:extend   → advance Feature 2's existing spec (specs/002-parallel-execution-engine) to runnable
#                             (or /stack-control:define for a brand-new spec)
#   /stack-control:execute  → run it via native Spec Kit, governance firing
```

**Expected**: the next feature's spec is **authored (`define`/`extend`) and run (`execute`) through the front door**, not via ad-hoc invocation — demonstrating the front door is usable to drive subsequent stack-control development (the reason this feature is first).

---

## Success-criteria coverage

| SC | Scenario |
|----|----------|
| SC-001 (clean install: stackctl + governance, 0 wiring) | A, B |
| SC-002 (run + governance auto-fires, 0 manual barrage) | D |
| SC-003 (dw-lifecycle 0 behavior change) | E |
| SC-004 (0 provider-identity branches) | D |
| SC-005 (next feature authored+run through the door) | F |
| SC-006 (descriptive error, 0 silent no-ops) | C, D |
