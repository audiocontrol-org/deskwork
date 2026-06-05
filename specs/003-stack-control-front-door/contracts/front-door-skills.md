# Contract: Front-door skills

Two Claude Code skills, invoked in-session as `/stack-control:…`. Skills-over-CLI: the skill body is the agent-facing touch point; `stackctl` is the deterministic primitive it calls; the in-session agent does the agent-work (FR-007). Mirrors `dw-lifecycle`'s skill+command pairing (`commands/<x>.md` slash command + `skills/<x>/SKILL.md` body).

> Per `.claude/rules/enforcement-lives-in-skills.md`: discipline lives in skill bodies + CLI verbs, never in git hooks. These skills travel with the plugin install.

---

## `/stack-control:execute` — Execution touch point (US1, MVP)

**Frontmatter** (`skills/execute/SKILL.md`): `name: execute`, description naming "run a Spec Kit spec via native execution, governance firing."

**Body contract**:
1. Resolve the target spec dir (arg or active feature).
2. Call `stackctl execute-check --spec <dir>`. **If it fails, STOP** and surface the descriptive error verbatim — no partial run, no fallback (FR-008, Edge "spec not runnable").
3. Drive **native `/speckit-implement`** over the spec **via the in-session agent** (the skill runs in-session, so the agent is present). MUST NOT shell out to a headless/batch CLI to invoke the agent (FR-006, Principle IX motivation).
4. Native execution's `after_implement` hook fires the **rehomed governance extension automatically** — the skill does NOT manually invoke governance (SC-002: 0 manual barrage invocations). The skill only confirms it fired and surfaces the run-dir / findings location.

**Postcondition**: native execution ran over the spec; governance fired; findings recorded in `audit-log.md`. On any blocked path: a descriptive error naming the missing piece (mechanism / runnable spec / governance capability), never a faked run (SC-006).

**Acceptance mapping**: US1 scenarios 1–3; SC-002, SC-004, SC-006.

---

## `/stack-control:curate` — Curation touch point (US2)

**Frontmatter** (`skills/curate/SKILL.md`): `name: curate`, description naming "create / edit / iterate / review a Spec Kit spec in-session."

**Body contract**:
1. Call `stackctl curate-check --spec <dir>` to report current artifact state.
2. Provide the **full edit / iterate / review loop** over the spec, in-session, via the agent (FR-005): create a spec (delegating creation to native `/speckit-specify` where appropriate — see research R3 open item), edit it, iterate it, review it — without the operator leaving their Claude Code session.
3. Bring the spec to a **runnable** state (such that `/stack-control:execute`'s `execute-check` passes) without manual re-assembly (US2 scenario 2).

**Postcondition**: the spec is advanced toward runnable; handing it to `/stack-control:execute` runs without manual re-assembly.

**Acceptance mapping**: US2 scenarios 1–2.

---

## Cross-skill invariants

- **In-session only**: both skills run inside the operator's Claude Code session; neither depends on a headless agent invocation (FR-006/007).
- **Self-hosting (FR-009 / SC-005)**: the two skills together MUST be sufficient to curate **and** run the *next* feature's spec (e.g. Feature 2) through the front door — the self-hosting proof, validated in quickstart.
- **Fail-loud**: every skill's "cannot proceed" branch surfaces the underlying `stackctl` / native error verbatim; no skill papers over a missing mechanism (Principle V).
