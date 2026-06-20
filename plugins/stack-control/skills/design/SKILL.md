---
name: design
description: "Open the designing phase for a roadmap item — an opinionated frontend that drives a swappable design backend (default superpowers:brainstorming) IN-SESSION, sets the design: pointer on entry, re-injects capture-over-YAGNI, routes the handoff to /stack-control:define, and writes the installation-anchored design record the design-to-spec gate checks"
---

# /stack-control:design

Open the **designing** phase for a roadmap item (022 US5). This is an opinionated
**frontend over a swappable backend**: it drives a capability-selected design
backend (default [`superpowers:brainstorming`](../../../..)) **in-session** and
bends it at the seam — its output contract plus the mechanical exit gate — so the
backend's generic opinions never override stack-control's. The design backend
does the exploration; this skill owns the *opinion injection*, the *pointer*, the
*installation-anchored record*, and the *handoff*.

> Per `.claude/rules/enforcement-lives-in-skills.md`: the discipline lives in this
> skill body + the `stackctl workflow` verbs it calls, never in a git hook.

> Capability, not vendor (Principle III / FR-021): the backend is selected by the
> capability contract below, NEVER by branching on which tool it is. Any backend
> that satisfies the contract drives without a code change.

## Compass precondition (024 — the un-skippable lifecycle)

**Before doing ANY of this skill's work**, consult the compass for the roadmap item this invocation operates on, declaring this skill as the intent:

```bash
stackctl workflow compass <item> --intent design
```

A **non-zero exit is a hard refusal**: print the compass's reason (it names the violated invariant and, for an `ahead` verdict, the skipped step) and **STOP — perform none of this skill's work**. Proceed only on exit 0 (`on-course` / `behind`). If no item resolves (a spec dir with no roadmap node is `off-rail`), refuse loud and direct the operator to capture it first. The lifecycle rules live in one place (the compass + the governed `WORKFLOW.md`), not re-encoded here; per `.claude/rules/enforcement-lives-in-skills.md` the gate lives in this skill body + the `stackctl workflow compass` verb, never a git hook.

## Preconditions

- An interactive coding-agent session (the design conversation is interactive — it
  MUST run in-session, never a non-interactive sub-agent or a shell-out; FR-022).
- A stack-control installation (`stackctl setup` has run) and a roadmap item to
  design. With no enclosing installation the workflow verbs refuse loud.

## The backend contract (capability-selected)

A design backend is usable here when it can: (a) conduct a **structured
exploration** that surfaces a problem domain and a solution space with **≥2
alternatives**; (b) emit a **design record** at the path this skill names with the
required sections; (c) support an **approval gate**; (d) be **driven in-session**.
The default is `superpowers:brainstorming`, which already supplies the
2–3-alternatives method, the user-review gate, and the self-review; this frontend
adds the mechanical required-section exit gate and the stack-control opinion
overrides on top.

## Steps

1. **Resolve the item + set the `design:` pointer on entry (FR-025c).** Take the
   roadmap item id as the argument. Compute the record path
   `docs/superpowers/specs/<date>-<slug>-design.md` (installation-anchored; the
   `<slug>` is the item's slug, `<date>` today). Set the pointer immediately —
   BEFORE the backend writes anything — so phase-derivation reports `designing`
   from this moment (it keys on the pointer, not on the file existing, D3):

   ```bash
   stackctl workflow link-design <item> docs/superpowers/specs/<date>-<slug>-design.md --apply
   ```

2. **Inject the house rules, then drive the backend in-session.** Open the design
   backend (default `superpowers:brainstorming`) in THIS session and inject the
   single-source house-rules block (`src/workflow/house-rules.ts`,
   `renderHouseRules()`) into the conversation. The load-bearing overrides
   (FR-025):
   - **(a) Capture over YAGNI.** Re-inject *"capture everything; scoping is a
     separate later pass"* AT the backend's scope-check / YAGNI step — the moment
     the backend would otherwise cut scope. The exit gate mechanically requires a
     solution-space section with **≥2 alternatives**.
   - **(b) Handoff to Spec Kit.** When the design completes, route the terminal
     handoff to **`/stack-control:define`** — NEVER the backend's hardcoded
     `writing-plans`.
   - **(c) Anchored record.** The backend writes the design record (via the Write
     tool) at the path from step 1, inside the installation domain — never the
     adopter repo root (FR-030).

3. **Write the design record with all required sections (FR-026).** The record
   MUST contain: **problem-domain**, **solution-space** (incl. the rejected
   alternatives, ≥2), **decisions**, **open-questions**, **provenance**. Use the
   Write tool to persist it to disk.

4. **Record operator approval (the judgment gate, FR-009/D5).** The design is not
   done until the operator records approval — a recorded fact, not a gate-time
   judgment. The operator sets the `design-approved:` marker on the node:

   ```bash
   stackctl roadmap advance <item> --to in-flight --apply   # if not already
   # operator records approval (e.g. via roadmap add/edit) — the design-approved: node marker
   ```

5. **Verify the design-to-spec exit gate, then hand off.** Confirm the gate is met
   (all required sections, ≥2 alternatives, the approval marker) before handing
   off — the gate is reported, not enforced in v1, so the agent checks it and does
   not advance on an unmet gate:

   ```bash
   stackctl workflow status <item>   # designing exit criteria: M of N met
   ```

   When the gate is met, hand off to **`/stack-control:define`** to author the
   Spec Kit spec from the design record (the `design-to-spec` transition).

## What this skill does NOT do

- It does not reimplement the design backend (it drives `superpowers:brainstorming`
  or any contract-satisfying backend in-session).
- It does not branch on the backend's vendor identity (capability only — Principle
  III / FR-021).
- It does not author the spec (that is `/stack-control:define`, the handoff target).
- It does not enforce the exit gate as a refusal in v1 (gates are reported; FR-010).
