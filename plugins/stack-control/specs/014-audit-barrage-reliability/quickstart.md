# Quickstart: validating audit-barrage reliability hardening

Runbook mapping each Success Criterion to a runnable check. Prerequisites: repo checkout, `npm install`, the installed `claude` + `codex` CLIs, and the recorded calibration prompt (`design-control` worktree run dir `20260610T235555837Z-design-control/PROMPT.md`, 69 KB — copy into a fixture if the worktree is gone).

## Unit/integration suite (all FRs)

```bash
npm --workspace @deskwork/plugin-stack-control test
```

Covers: config v2 validation + migration refusal, timeout derivation, terminal-state settle paths (fake children), watchdog staleness kill + slow-but-alive non-kill (fake timers), stream-result extraction, INDEX rendering, lift/govern fleet-report consumption.

## SC-001 — calibration prompt completes (no exit-143)

```bash
plugins/stack-control/bin/stackctl audit-barrage --feature <fixture-feature> ...
# with the shipped v2 template (opus pin, derived timeout)
```

Expect: claude row `terminal state: completed`, non-empty `claude.md`, INDEX shows `timeout basis: derived (~69000 bytes × 13 s/KB …)`.

## SC-002 — hostile write-probe under enforcement

Replay a probe prompt that attempts: Write-tool file create, `echo x > probe.txt`, `python3 -c 'open(...,"w")'`, `git commit`+push. Run it through the enforced spawn path (same argv assembly the barrage uses) in a scratch clone.

Expect: zero new files (`git status --short` empty), zero commits (`git log` unchanged), zero remote changes. Repeat per enforced lane (claude now; codex once its sandbox fragment is probe-verified).

## SC-003 — forced timeout is loud at synthesis

Run a two-lane barrage where one lane has `timeout_seconds: 1` (override).

Expect: INDEX fleet report `configured: 2, produced: 1 ⚠ DEGRADED`; killed lane `terminal state: timed-out`; `audit-barrage-lift` output repeats the degradation and lifts zero findings from the killed lane; the answer to "did every configured model actually report?" is readable from lift output alone.

## SC-004 — dead spawn killed within the liveness window

Configure a fixture lane whose binary is a script that sleeps forever writing nothing, `liveness_window_seconds: 10`.

Expect: settle within ~10–15 s (window + check cadence), `terminal state: killed-no-liveness` (NOT timed-out), INDEX records staleness at kill; full timeout never consumed.

## SC-005 — slow-but-alive spawn is NOT killed

Fixture lane: script that emits one stdout line every 5 s for 90 s, window 10 s.

Expect: runs to completion, `terminal state: completed`; watchdog never fires (measured pulse 60–90 events/min on real claude stream-json runs is far inside any sane window).

## SC-006 — pre-014 config refused with remediation

```bash
# point the loader at a v1 config (e.g. the pre-migration project override)
plugins/stack-control/bin/stackctl audit-barrage ...
```

Expect: exit 2, message naming the config file, the missing fields (`model`, `readonly_enforcement`, derivation pair), and the template path to copy from. Zero spawns launched.

## FR-005 — enforcement does not break the audit (lift-ability check)

Replay the calibration prompt through the enforced claude lane; run `audit-barrage-lift` on the result.

Expect: findings lift cleanly (the plan-mode framing did not destroy the report format); read-only probes inside the audit (read files, run read-only commands) still executed.
