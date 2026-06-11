# Contract: deskwork-governance Spec Kit extension

The interfaces this slice exposes. Three contracts: the extension manifest, the `after_implement` hook behavior, and the governance command's I/O.

## Contract A — Extension manifest (`.specify/extensions/deskwork-governance/extension.yml`)

```yaml
schema_version: "1.0"
extension:
  id: deskwork-governance
  name: "deskwork Governance"
  version: "0.1.0"
  description: "Runs deskwork's cross-model audit-barrage + finding lift after Spec Kit implements"
  author: deskwork
requires:
  speckit_version: ">=0.9.0"
  tools:
    - name: dw-lifecycle
      required: true
    - name: git
      required: true
provides:
  commands:
    - name: speckit.deskwork.govern
      file: commands/speckit.deskwork.govern.md
      description: "Govern the just-implemented work: cross-model audit-barrage + lift findings"
hooks:
  after_implement:
    command: speckit.deskwork.govern
    optional: false
    description: "Run deskwork governance over the implemented work"
```

**Conformance:** `specify extension add .specify/extensions/deskwork-governance --dev` succeeds; `specify extension list` shows `deskwork-governance` enabled; `.specify/extensions.yml` gains an `after_implement` entry naming `speckit.deskwork.govern`.

## Contract B — `after_implement` hook behavior

- **Precondition:** `/speckit-implement` has completed (possibly partially); a working-tree diff may exist.
- **Trigger:** Spec Kit's implement skill, in its Mandatory Post-Execution Hooks step, emits `EXECUTE_COMMAND: speckit.deskwork.govern`.
- **Postcondition:** an audit run-dir exists for this feature; ≥1 finding lane produced output; findings are appended to `audit-log.md` with `Status: open`.
- **Failure mode:** if `dw-lifecycle` is absent, the command FAILS LOUDLY (no silent skip; Constitution V). A partial implement still gets governed over whatever landed.

## Contract C — Governance command I/O (`speckit.deskwork.govern` → `govern.sh`)

**Inputs** (gathered by the command, not passed by Spec Kit):
- `git diff` + `git diff --stat` of the implemented changes (the "plan under audit").
- feature slug: `pluggable-lifecycle-providers`.
- plan/spec paths under `specs/001-speckit-backhalf-slice/`.

**Process** (compose existing verbs):
1. assemble a vars JSON `{ feature_slug, diff, workplan_summary, audit_log_excerpt, commit_subjects }`.
2. `dw-lifecycle audit-barrage-render --feature <slug> --vars-file <vars> --output <prompt>`.
3. `RUN_DIR=$(dw-lifecycle audit-barrage --feature <slug> --prompt-file <prompt> --output-run-dir)`.
4. `dw-lifecycle audit-barrage-lift --feature <slug> --run-dir "$RUN_DIR" --apply`.

**Outputs:**
- run-dir at `.dw-lifecycle/scope-discovery/audit-runs/<ts>-<slug>/`.
- findings appended to the feature `audit-log.md`.

**Invariants (test/grep-gated):**
- The command's code path contains **zero** string matches on an authoring/execution tool name (SC-003) — it keys on diff + feature slug only.
- At least **two** model lanes are spawned (SC-004) — inherited from deskwork's barrage config (claude + codex).
