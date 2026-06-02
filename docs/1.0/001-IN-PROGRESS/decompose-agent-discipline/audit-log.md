---
slug: decompose-agent-discipline
targetVersion: "1.0"
---

# Audit log — decompose-agent-discipline

## 2026-06-02 — Phase 2 per-disposition outcomes

`.claude/rules/agent-discipline.md`: **566 → 157 lines** (target: 150–200). Every disposition from the operator-approved table (PRD revision 2, Final) landed; each new home + the agent-discipline.md edit shipped in the same commit per the audit-legibility contract.

| # | Rule | Disposition | Outcome / new home |
|---|---|---|---|
| 1 | /frontend-design for design tasks | compose-into-skill | → `dw-lifecycle/skills/implement` + `setup` § Composed disciplines; rule → pointer |
| 2 | /dw-lifecycle:review after every step | delete | Deleted entirely (dead; superseded by audit-barrage). Skill retirement split to [#387](https://github.com/audiocontrol-org/deskwork/issues/387) |
| 3 | scope-don't-defer + TDD | compose (DONE) | → pointer (promote-findings + check-open-findings + check-fix-task-tdd + doctor rule own it) |
| 4 | audit-barrage | compose (DONE) | → pointer (audit-barrage SKILL owns it) |
| 5 | tooling-feedback | compose-into-skill | → `scope-inventory` § Composed disciplines; rule → pointer |
| 6 | inventory-vs-discovery | compose-into-skill | → `scope-inventory` § Composed disciplines; rule → pointer |
| 7 | read docs before quoting commands | stays-shrunk | shrunk ~10 → ~3 lines in place |
| 8 | operator owns scope decisions | mixed | dispatch-report half → `implement` skill; hedge half stays-shrunk |
| 9 | capture mode vs scope mode | compose-into-skill | → `dw-lifecycle/skills/define` + `deskwork/skills/iterate`; rule → pointer |
| 10 | empty revisions beat missed changes | compose-into-skill | → `deskwork/skills/iterate` + `approve`; rule → pointer |
| 11 | orchestrator ≠ implementation session | compose + gate | → `setup`/`issues` exit-step + `implement` precondition; rule → pointer |
| 12 | "Just for now" is bullshit | DEFER | **Untouched** (operator-flagged load-bearing); 49 lines intact |
| 13 | packaging is UX | compose-into-skill | → `complete`/`close-shipped` § Composed disciplines; rule → pointer |
| 14 | public-distribution-only | stays-shrunk | shrunk in place |
| 15 | never pass --no-tailscale | tool-fix | Flag now a deprecated no-op + `DESKWORK_STUDIO_NO_TAILSCALE` env hatch (TDD); rule **deleted** (bait gone) |
| 16 | memory-vs-rule placement | stays-shrunk | shrunk in place |
| 17 | namespace deskwork metadata | gate + compose | Write-guard `assertNamespacedDeskworkKeys` added (TDD); read/migrate side already existed (legacy-top-level-id-migration); rule shrunk to read-convention + pointer |
| 18a | stay on feature/deskwork-plugin | delete | Deleted (stale convention) |
| 18b | don't pitch /schedule | stays-shrunk | shrunk in place |
| 18c | no test infra in CI | stays-shrunk | shrunk in place |
| 18d | content DBs preserve | stays-shrunk | shrunk in place |
| 18e | agent-as-user dogfood | stays-shrunk | shrunk in place |
| 19 | issue closure requires release verify | compose-into-skill | → `complete`/`close-shipped` § Composed disciplines; rule → pointer |
| 19b | marketplace-clone script contract | stays-shrunk | shrunk to ~2 lines in place |
| 20 | closure is structural | compose (DONE) | → pointer (hygiene-family SKILLs own it) |

**Verification:**
- Size: 157 lines (`wc -l`), in the 150–200 target band.
- Tests green: core 535, studio 589, cli 211 (all pre-existing suites pass; the 2 tool-level tasks added new tests).
- Open-findings gate: zero open findings.
- All 3 deletes (entries 2, 15, 18a) confirmed absent from the file.
- Entry 12 confirmed byte-untouched.

**Spun-off scope:** [#387](https://github.com/audiocontrol-org/deskwork/issues/387) — retire `/dw-lifecycle:review` + `/dw-lifecycle:audit` skills in favor of audit-barrage (multi-skill architectural change; out of this feature's scope by operator decision).

**Two TDD tool-level tasks (test-first):**
- 2b.1 `--no-tailscale` no-op alias: `packages/studio/test/cli-args.test.ts` (4 new tests) → `packages/studio/src/server.ts`.
- 2b.2 namespace write-guard: `packages/core/test/frontmatter.test.ts` (5 new tests) → `packages/core/src/frontmatter.ts`.
