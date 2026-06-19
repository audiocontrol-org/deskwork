# Contract: Command Surface (descriptor, `--help`, verb reference, descriptor artifact)

**Feature**: `028-front-door-completeness` | **Phase**: 1 | Satisfies FR-001/002/003/004/052; SC-001.

This is a CLI tool: contracts are command signatures + exit codes + output shapes,
not REST endpoints. The single source is the commander command tree
(`src/cli-help/command-surface.ts`, Decision 1), generalizing the proven
`roadmap-command.ts` + `roadmap-help.ts` pattern to all 46 verbs.

---

## C1 — `stackctl <verb> --help` (every verb)

**Signature.** `stackctl <verb> --help` (also `-h`).

**Inputs.** A verb name from the 46-verb surface.

**Success output (exit 0).** A usage body to stdout containing:
- a one-line **description** of the verb,
- the **sub-actions** (for a multi-action verb) each with a one-line summary,
- every verb-level **flag** with `name`, argument placeholder, and description,
- a usage line (`Usage: stackctl <verb> <subaction> [flags]` or `Usage: stackctl <verb> [flags]`).

Body MUST be non-empty (a flag list, not a bare verb echo). **Exit 0.**

**Satisfies.** FR-001, FR-003; SC-001 (today only `roadmap`/`govern` pass).

**Behavioral notes.**
- The help is rendered from the descriptor, never a hand-written string (FR-003) — `--help` and `check-front-door` read the same node and cannot disagree.
- A deprecated verb (`speckit-guard`, `check-editor-symmetry`) emits `--help` noting its deprecation + the replacement; it is a documented alias, not a gap (Edge Cases).

---

## C2 — `stackctl <verb> <sub-action> --help` (multi-action verbs)

**Signature.** `stackctl <verb> <sub-action> --help`.

**Inputs.** A multi-action verb (`backlog`, `roadmap`, `inbox`, `workflow`, …) + one of its sub-actions.

**Success output (exit 0).** A usage body listing **that sub-action's** flags
(name/arg/description), its positional (if any), value-vocabularies where applicable
(e.g. the status grammar on `roadmap advance --to`), and a one-line summary. **Exit 0.**

**Satisfies.** FR-002; SC-001.

**Behavioral notes.**
- A verb that accepts only a subset of a shared status vocabulary shows the subset, not the full grammar (Edge Cases) — the descriptor carries the per-sub-action vocabulary, as `roadmap-help.ts` already does for `advance`/`add`.
- A help request never trips flag/arity validation: `verb sub --help` renders help even with otherwise-invalid flags present (the `roadmap-command.ts` precedent — help before preflight).

---

## C3 — Auto-generated verb reference

**Signature.** `stackctl <reference-verb>` (or the build emitter in `src/cli-help/verb-reference.ts`).

**Success output (exit 0).** A complete reference of all 46 verbs + sub-actions +
flags, derived by walking the command tree. **Exit 0.**

**Error output.** A reference that omits a live verb, or lists a verb the tree no
longer exposes, is a derivation bug — caught by C5's round-trip test (the reference
is derived, never hand-maintained, FR-004).

**Satisfies.** FR-004.

---

## C4 — Generated descriptor artifact (FR-052)

**Signature.** An emitter in `src/cli-help/verb-reference.ts`
(`emitDescriptorArtifact()`), surfaced as a CLI/build artifact.

**Output shape.** oclif-manifest-style JSON (Decision 2):

```
{
  "id": "stack-control-command-surface-v1",
  "commands": {
    "<verb>": {
      "description": "<string>",
      "mediationClass": "mutating" | "read-only",
      "flags": { "<flag>": { "arg": "<placeholder>|null", "required": <bool>, "description": "<string>" } },
      "subActions": {
        "<sub>": {
          "description": "<string>",
          "positional": "<placeholder>|null",
          "mediationClass": "mutating" | "read-only",
          "flags": { "<flag>": { "arg": …, "required": …, "description": … } }
        }
      }
    }
  }
}
```

**Contract.** Generated from the command tree (FR-041 — never authored). It is a
downstream artifact; its only invariant is the round-trip below.

**Satisfies.** FR-052.

---

## C5 — Round-trip test (FR-052)

**Contract.** A test asserts the descriptor artifact (C4) contains **exactly** the
verbs, sub-actions, and flags the live command tree exposes:
- every verb in the tree appears in `artifact.commands` (no missing),
- every sub-action and flag in the tree appears under it (no missing),
- `artifact.commands` contains no verb/sub-action/flag absent from the tree (no extra).

**Pass.** Structural equality between the walked command tree and the emitted
artifact. **Fail loud** on any asymmetry, naming the divergent verb/sub-action/flag.

**Satisfies.** FR-052; the FR-041 "derived, never authored" guarantee.

---

## Exit-code summary

| Outcome | Exit |
|---|---|
| `--help` / sub-action `--help` / reference renders | 0 |
| Unknown verb (dispatcher) | 2 (existing `cli.ts` contract) |
| Unknown sub-action | 2 (existing `roadmap-command.ts` contract — `roadmap: unknown subaction …`) |
| Missing required positional/flag on an executed (non-help) call | 2 (usage error) |
