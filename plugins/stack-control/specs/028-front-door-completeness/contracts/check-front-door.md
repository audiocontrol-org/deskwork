# Contract: `check-front-door` Guardrail Verb

**Feature**: `028-front-door-completeness` | **Phase**: 1 | Satisfies FR-030/031/032/033/034; SC-006.

The mechanical guard that prevents the front door from silently regressing. Verb:
`src/subcommands/check-front-door.ts` (NEW); doctor rule + `/stack-control:check-front-door`
skill wrap it (FR-032). It reads the fronted-operations registry (derived from the
command tree + capability declarations) and asserts both surfaces.

---

## C1 — `stackctl check-front-door`

**Signature.** `stackctl check-front-door [--json]`.

**Inputs.** None required; resolves the command tree + capability registry + the
`/stack-control:*` SKILL.md frontmatter.

**Success output (exit 0).** A clean report: every registered operation passes all
four assertions. `--json` emits the structured result. **Exit 0.**

**Error output (exit non-zero).** A report naming **each specific gap** (the failing
operation + which assertion failed). **Exit non-zero** (a single non-zero code; the
gap detail is in the message). Never a silent pass on a gap (Principle V).

---

## C2 — The four assertions (FR-031)

For every operation in the fronted-operations registry:

- **C2a — Skill exists.** A sanctioned `/stack-control:*` skill (the entry's `requiredSkill`) exists in `skills/<name>/SKILL.md`. A deleted skill → gap.
- **C2b — Working `--help`.** The verb and each sub-action emit working `--help` (exit 0 with a usage body), derived from the command tree. A broken/missing `--help` → gap.
- **C2c — Mutating ops mediation-registered.** A `mutating` entry (per its declared `mediationClass`, FR-050) has a mediation registration (its identity is in the capability registry's backend identities OR the operation is a marker-bracketed fronted op). A `read-only` entry is conformant without one. An unfronted **mutating** verb → gap.
- **C2d — skill↔verb parity (both directions).** Every fronted verb/sub-action has a documenting skill (verb → skill); every skill's documented verbs/sub-actions/flags exist in the command tree (skill → verb). A skill documenting a verb the tree lacks, OR a verb no skill documents → gap.

**Behavioral notes.**
- A deprecated verb (`speckit-guard`, `check-editor-symmetry`) is treated as a documented alias (its descriptor's `deprecatedAliasOf`), not a gap (Edge Cases).
- C2c's check applies ONLY to `mutating` ops (FR-050) — the read-only exemption is mechanical, read from the registry's mediation class.

**Satisfies.** FR-031.

---

## C3 — RED regression cases (FR-033)

A RED test MUST prove `check-front-door` exits non-zero naming the gap for each of:

| Case | Injected defect | Expected |
|---|---|---|
| Deleted skill | remove a `skills/<name>/SKILL.md` a registered op requires | exit ≠ 0; message names the missing skill (C2a) |
| Broken `--help` | make a verb's `--help` exit non-zero / emit no usage | exit ≠ 0; message names the verb (C2b) |
| Unfronted verb | add a new **mutating** verb with no skill + no mediation registration | exit ≠ 0; message names the unfronted verb (C2c + C2d) |

**Satisfies.** FR-033; SC-006.

---

## C4 — Firing surfaces (FR-034)

Per `enforcement-lives-in-skills` (NEVER a git hook), `check-front-door` fires from:
- **`session-start`** — advisory snapshot (reports gap count; never refuses).
- **`implement` / `review`** — skill-body gate (refuses to proceed when RED).
- **local pre-PR smoke** — `scripts/smoke-front-door.sh` (run by hand; not a CI job — project rule "no test infrastructure in CI").

**Satisfies.** FR-034.

---

## Exit-code summary

| Outcome | Exit |
|---|---|
| Complete surface, all assertions pass | 0 |
| Any gap (deleted skill / broken help / unfronted mutating verb / parity break) | non-zero, naming the gap |
| Usage error (unexpected flag) | 2 |
