---
name: check-front-door
description: "Assert the stack-control front door has not silently regressed (stackctl check-front-door). Over the derived fronted-operations registry it checks four invariants: every operation's sanctioned /stack-control:* skill exists, every verb/sub-action emits working --help, every mutating operation is mediation-registered (read-only ops exempt), and skill↔verb parity holds in both directions. Read-only; exits 0 on a clean surface, non-zero naming each gap."
---

# /stack-control:check-front-door

Thin adapter over the `stackctl check-front-door` verb. It is the mechanical guard that prevents the front door from silently regressing: it reads the **fronted-operations registry** (derived from the command tree + capability declarations — built, never stored) and asserts the four contract invariants over every registered operation.

> Per `.claude/rules/enforcement-lives-in-skills.md`, this guard lives in this skill body + the `stackctl check-front-door` verb + the plugin-shipped PreToolUse hook — never a git hook.

## When to use

- **`session-start`** runs it as a non-blocking advisory (reports the gap count).
- **`execute` / review** run it as a gate (refuse to proceed when RED).
- **Before a PR**, via `scripts/smoke-front-door.sh` (local pre-PR smoke; not CI).
- Any time you add a verb, sub-action, or skill — to confirm the new surface is discoverable, documented, and (where mutating) mediated.

## The four assertions (per fronted operation)

- **C2a — Skill exists.** The operation's `requiredSkill` resolves to `skills/<name>/SKILL.md`. A deleted skill → gap naming the missing skill.
- **C2b — Working `--help`.** The verb and each sub-action emit `--help` at exit 0 with a usage body. A broken/missing `--help` → gap naming the verb.
- **C2c — Mutating ops mediation-registered.** A `read-only` operation is conformant **without** one (the read-only exemption is mechanical, read from the registry's declared mediation class). For a `mutating` operation, what "mediation-registered" means depends on whether it is a **fronted backend** (an identity the 026 interceptor mediates), derived from `CAPABILITY_REGISTRY` backend identities — not from "has a skill document":
  - **Command-tree op that IS a fronted backend** (its verb is a `CAPABILITY_REGISTRY` `cliArgv0` backend identity — today `backlog`): it is reach-around-able, so it MUST be genuinely covered by the capability registry. A verb named as a backend identity but not actually covered → gap.
  - **Command-tree op that is NOT a fronted backend** (a first-class `stackctl` verb — `roadmap`, `inbox`, `scope-*`): no capability claims it as a reach-around-able backend, so mediation is **N/A** — conformant. A verb you reach only through `stackctl` cannot be reached around.
  - **Skill-declaration op** (a capability id, e.g. `spec-execution`): verified against the capability's backend-identity union in `CAPABILITY_REGISTRY`.

  An unfronted mutating verb — a brand-new mutating verb that is named/claimed as a backend but has no covering registration — → gap.
- **C2d — skill↔verb parity (both directions).** Every fronted verb/sub-action has a documenting skill (verb → skill); every verb a skill documents exists in the command tree (skill → verb). A deprecated alias is not a gap.

## Steps

1. **Run from inside the installation:**

   ```bash
   stackctl check-front-door          # human report
   stackctl check-front-door --json   # machine-readable { ok, gaps, checked }
   ```

2. **Read the exit code:** `0` = the complete surface passes all four assertions; non-zero = at least one gap (the message names each failing operation + which assertion). `2` = a usage error (unexpected flag).

3. **On a gap, fix the surface — never weaken the check.** A gap is a real regression: a deleted/renamed skill, a broken `--help`, an unfronted mutating verb, or a doc/tree parity break. Restore the missing surface; do not relax the assertion to make it pass.

## Notes

- The registry is **built on every invocation** from the command surface + `CAPABILITY_REGISTRY` — there is no `fronted-operations.yaml` to drift. Adding a verb that has a matching skill changes what `check-front-door` checks with no manifest edit.
- A verb with no matching `/stack-control:*` skill is an operator/internal tool **outside** the fronted invariant (mirroring how `CAPABILITY_REGISTRY` keeps scope-discovery / audit-barrage / roadmap outside its v1 invariant) — it is not a gap.
