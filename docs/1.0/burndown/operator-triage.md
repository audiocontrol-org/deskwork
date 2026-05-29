---
slug: burndown-operator-triage
date: 2026-05-29
kind: burndown-marching-orders
lane: operator-triage
source: docs/1.0/001-IN-PROGRESS/hygiene/issue-closure-audit-2026-05-29.md
---

# Marching Orders — Operator triage

These issues are blocked on the operator picking a direction. Each one cuts across two or more lanes; the agent's view of the trade-offs is presented but the call belongs to the operator. Until each is resolved, downstream work in the named lanes carries the risk of building the wrong thing.

## Architectural / semantic decisions

### [#246](https://github.com/audiocontrol-org/deskwork/issues/246) — core/approve refuses Final → Published

**Where it lives:** `@deskwork/core` lane → see [`deskwork-core.md`](deskwork-core.md).

**The divergence:** `packages/core/src/entry/approve.ts` throws *"Final → Published uses `publish`, not `approve`"*. But `plugins/deskwork/skills/approve/SKILL.md` step 4 names *"Final → Published"* in the stage map, and `DESKWORK-STATE-MACHINE.md` Commandment II says verbs are universal.

**Operator picks one:**

- **(a) Make approve universal.** Implement `Final → Published` in `approveEntryStage`; remove the publish-specific code path; SKILL + spec become the canonical contract. Downstream effect: `publish.ts` becomes a thin alias for `approve(uuid)` when the entry is at Final.
- **(b) Keep the refusal as design-intentional.** Fix SKILL.md to call `/deskwork:publish` explicitly for Final → Published; amend `DESKWORK-STATE-MACHINE.md` Commandment II with the carve-out.
- **(c) Split the semantic.** Approve is universal across the *editing* pipeline; publish is the *release* verb. Both verbs are universal in their own surface. Update spec + skills accordingly.

**Blocks:** #61 (calendar/workflow auto-advance — depends on which states approve graduates to), #230 (studio Publish button — needs to know what to copy to the clipboard).

---

### [#266](https://github.com/audiocontrol-org/deskwork/issues/266) — DraftWorkflowState uses retired ReviewState union

**Where it lives:** `@deskwork/core` lane.

**The divergence:** Commandment III retires `reviewState`. `DraftWorkflowState` in `packages/core/src/schema/*` still types its workflow state with the retired union.

**Operator picks one:**

- **(a) Drift — fix the schema.** `DraftWorkflowState` should use the current vocabulary (currentStage + iteration metadata); migrate the union; doctor rule for legacy sidecars.
- **(b) Intentional separation.** Workflow-state and entry-reviewState are different concerns; the union name is just inherited and harmless. Document why in the schema.

**Blocks:** scope-discovery's audit-barrage lane's eventual schema-audit work.

---

### [#222](https://github.com/audiocontrol-org/deskwork/issues/222) — Architectural: single document evolves + scrapbook accumulates approved snapshots

**Where it lives:** `@deskwork/core` lane (touches approve + iterate + studio render).

**State:** Phase 11 Task 1 work — Option B + hybrid refinement fix-landed per the open-issue-tranche-cleanup workplan. Pending v0.17.0+ marketplace verification.

**Operator picks one:**

- **(a) Confirm Option B+hybrid suffices.** Walk an iteration cycle against this project's PRDs; verify the studio renders `index.md` correctly + scrapbook accumulates `<priorStage>.md`. Close #222.
- **(b) Find a gap.** Document it; file a follow-up issue with the specific scenario; #222 stays open.

---

### [#142](https://github.com/audiocontrol-org/deskwork/issues/142) — Pipeline stages don't fit project-internal feature docs

**Where it lives:** `@deskwork/core` lane (vocabulary / UX).

**The friction:** The pipeline metaphor (Ideas → Planned → Outlining → Drafting → Final → Published) maps to article-shaped editorial content. Feature PRDs / specs / plans get shoehorned into Drafting and stay there for months.

**Operator picks one:**

- **(a) New content kind.** `internal-design` with its own stages (`drafting → review → applied → archived`). Sidecars carry kind; doctor / dashboard render in own section.
- **(b) Pipeline stages are renderer-agnostic.** Treat as UX/labeling concern; rename Drafting; surface `kind` on dashboard rows.
- **(c) Accept as-is.** Pipeline is editorial-shaped by design; project docs use it via convention; no code change.

**Blocks:** #60 (content-type vocabulary), #57 (mandatory SEO keywords in `/deskwork:plan`), the deskwork-plugin feature's own self-categorization.

---

### [#56](https://github.com/audiocontrol-org/deskwork/issues/56) — Phase 24: Content collections (not websites)

**Where it lives:** `@deskwork/core` lane (architectural rename).

**State:** Partial — `host` field is optional (shipped v0.8.2); the broader vocabulary migration (`sites` → `collections`) is not.

**Operator picks one:**

- **(a) Ship the full vocabulary migration.** Per the v2-applied plan; renamer + doctor migration rule + CLI flag aliases (`--site` → `--collection`).
- **(b) Stop at host-optional.** The friction is solved; the rename is cosmetic; leave it.
- **(c) Per-sub-phase.** 24a (schema) + 24b (install + CLI) + 24c (studio) + 24d (docs) — ship one per release.

**Blocks:** #60 (hardcoded content-type vocabulary), #72 (hardcoded shortform platform list).

---

## Cross-cutting design decisions

### [#314](https://github.com/audiocontrol-org/deskwork/issues/314) — Canonicalize visual-verification gate in dw-lifecycle

**Where it lives:** dw-lifecycle + scope-discovery + studio lanes.

**The shape:** Multiple sessions have surfaced the "I claimed a UI fix was verified but didn't actually walk it" failure mode. The `.claude/rules/ui-verification.md` rule names the discipline; this issue asks for a structural enforcement.

**Operator picks one:**

- **(a) New skill.** `/dw-lifecycle:verify-ui` dispatches a Playwright-driven gate against named surfaces; failure aborts the commit/PR.
- **(b) Pre-push hook.** Same shape as scope-discovery's pre-push gates; runs the Playwright probe on changed CSS/markup paths.
- **(c) Rule update only.** Tighten the existing rule; no structural enforcement. The agent is responsible for verbatim compliance.

**Blocks:** scope-discovery's audit-barrage lane if visual-verification is part of the barrage payload.

---

### [#173](https://github.com/audiocontrol-org/deskwork/issues/173) — Entry-keyed reject semantics for the decision strip

**Where it lives:** `@deskwork/studio` lane.

**State:** Reject is `disabled` in the entry-keyed decision strip, tooltipped with a link to this issue.

**Operator picks one:**

- **(a) Append rejection annotation; entry stays at current stage.** Same as a marginalia comment with kind `rejection`.
- **(b) Auto-induct to Blocked.** Reject = "move to Blocked with a reason."
- **(c) Reject is moot in the entry-centric model.** Remove the button.

---

### [#174](https://github.com/audiocontrol-org/deskwork/issues/174) — Entry-keyed edit-in-browser save semantics for longform Save button

**Where it lives:** `@deskwork/studio` lane.

**State:** Save is `disabled` in the entry-keyed surface; legacy save POSTed new markdown.

**Operator picks one:**

- **(a) Save mints a new revision via iterateEntry.** The studio is a thin client over the iterate skill.
- **(b) Save writes directly to disk + appends a journal entry.** Bypass iterate; faster turnaround.
- **(c) Save is moot in the entry-centric model.** Remove the button; operators iterate via CLI.

**Couples to:** #84 (iterate Step 2 path), #267 (pending-annotations CLI).

---

## Reading order for triage sessions

1. **#246 first.** It blocks #61 + #230 and clarifies the verb model that every other approve-related issue depends on.
2. **#142 + #56 together.** Both are vocabulary calls; resolve in one session so downstream issues (#60, #72, #57) get aligned at once.
3. **#173 + #174 in a frontend-design pass.** Same surface, same gating, similar trade-offs.
4. **#266 + #222 separately.** Both are schema/architectural and individually scoped.
5. **#314 last.** Lower-priority because the existing rule prevents the worst of the failure mode; structural enforcement is a polish step.
