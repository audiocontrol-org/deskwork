# Contract: `stackctl workflow compass` CLI

The compass orientation + enforcement surface (FR-001/FR-002/FR-003/FR-005). A new
subaction on the existing `workflow` dispatcher (`src/subcommands/workflow.ts`), mirroring
the thin shape of `workflow next`/`status` (resolve installation → load governed doc + item
→ build derivation context → format). Read-only and deterministic.

## Synopsis

```
stackctl workflow compass <item> [--intent <action>] [--json]
```

- `<item>` — a roadmap item id (`<phase>:<codename>`), as `workflow next`/`status` accept.
- `--intent <action>` — the action the agent is about to take (a name from the fixed intent
  vocabulary, see contracts/intent-vocabulary.md). Omitted ⇒ orientation mode only.
- `--json` — emit the machine-readable `Verdict` (for non-Claude-Code adapters).

## Mode 1 — Orientation (no `--intent`), FR-001

Derives the item's current phase, names the single legitimate next action (the phase's
`work:` skill + the next transition), and reports the current gate state. Read-only.

```
workflow compass <item>
  current phase: <phase>
  legitimate next action: <work-skill>  (transition <codename>: <from> → <to>)
  exit gate: <m> of <n> met
    [ ] <unmet criterion>            # when any unmet
```

Exit `0`. At a terminal `shipped` phase: report `shipped (terminal); no legitimate forward
move`. At a terminal side-state: report the side-state + `induct back to resume` (exit `0` —
orientation is always allowed).

## Mode 2 — Intent diff (`--intent <action>`), FR-002/FR-003

Classifies the intent's phase and returns a verdict against the live state:

| Verdict | Condition | Exit code |
|---|---|---|
| `on-course` | intent phase == the legitimate next phase | `0` |
| `behind` | intent phase ≤ the current phase (re-entry / redundant) | `0` (allow-with-note) |
| `ahead` | intent phase is later than the legitimate next phase (a step is skipped) | non-zero (e.g. `3`) |
| `off-rail` | no roadmap node, or a terminal side-state | non-zero (e.g. `4`) |

```
workflow compass <item> --intent <action>
  current phase: <phase>
  intent: <action> (phase <intent-phase>)
  verdict: <outcome>
  skipped step: <phase>             # ONLY when ahead
  → <reason>                        # actionable; names the violated invariant
```

- `ahead` MUST name the **first** skipped step (SC-001) in `skipped step:` and the reason.
- `off-rail` MUST name the missing node (orphan) or the side-state.

## Exit codes

- `0` — `on-course` or `behind` (proceed).
- non-zero `ahead` code — a later-phase action; a step is skipped.
- non-zero `off-rail` code — no node / terminal side-state.
- `2` — usage / parse / validation (unknown subaction, missing `<item>`, unknown item,
  **unknown `--intent`** per FR-004, ungovernable doc). Reuses `workflow.ts`'s `failUsage`.

The two refusal codes (`ahead`, `off-rail`) are distinct so an embedding skill can name the
precise violated invariant without parsing prose (FR-003). `2` (usage) is distinct from both.

## Read-only & determinism (FR-005)

The verb writes nothing. Two invocations with no intervening on-disk change produce
byte-identical stdout and the same exit code (SC-001, acceptance scenario US1.4).

## `--json` shape

Emits the `Verdict` entity (data-model.md): `{ outcome, currentPhase, intentPhase,
legitimateNext, skippedStep, reason, exitCode }`. The process exit code still mirrors
`exitCode` so a shell/skill can gate without parsing JSON.

## Out of scope for this verb

- Performing any transition (that is `workflow advance`).
- Mutating the roadmap or any artifact (capture-fusion lives in the authoring path, not here).
