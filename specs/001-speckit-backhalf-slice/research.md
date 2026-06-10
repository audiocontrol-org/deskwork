# Phase 0 Research: governance-as-`after_implement`-extension

All Technical-Context unknowns resolved below. Findings cross-reference the feature `tooling-feedback.md` (TF-05/06/07/08), which is the live evidence base.

## Decision 1 — How a local (non-catalog) extension is installed

- **Decision**: author the extension under `.specify/extensions/deskwork-governance/` and install it with `specify extension add .specify/extensions/deskwork-governance --dev`.
- **Rationale**: `specify extension add --help` documents `--dev` = "Install from local directory." No catalog publish, no ZIP-URL needed for dogfood. `--force` re-installs after edits.
- **Alternatives considered**: ZIP-URL `--from <url>` (needs hosting; rejected for local dogfood); hand-editing `.specify/extensions.yml` + `.registry` directly (brittle, bypasses the supported install path — rejected, violates "use the public path").

## Decision 2 — How `after_implement` invokes the governance command

- **Decision**: register `hooks.after_implement → speckit.deskwork.govern` in the extension manifest; the command body is a Claude skill that the agent runs (Spec Kit emits `EXECUTE_COMMAND` for it at the end of `/speckit-implement`).
- **Rationale**: confirmed in the `speckit-implement` skill body — its "Mandatory Post-Execution Hooks" section reads `hooks.after_implement` and dispatches each as a slash-command. Granularity is whole-run (TF-06), accepted per spec FR-006.
- **Alternatives considered**: a `before_implement` hook (wrong moment — no diff yet); intercepting the implement loop per-task (no such hook point exists, TF-06).

## Decision 3 — How the command obtains the implemented-work context (the diff)

- **Decision**: the command's `govern.sh` captures the diff with `git diff` (and `git diff --stat`) over the range the implement run produced, plus the plan/spec paths, and feeds them as the audit-barrage `diff` var.
- **Rationale**: deskwork's `audit-barrage-render` already takes a `diff` var (verified when we audited the docs). `git` is present; the working tree after `/speckit-implement` holds the changes. Whole-run granularity means one diff for the whole run — matches the hook cadence.
- **Alternatives considered**: parsing `tasks.md` completion state for per-task diffs (out of scope; per-task governance is not required, FR-006/FR-008).

## Decision 4 — Command-name resolution across the deskwork/Spec-Kit namespaces (TF-05/06 seam)

- **Decision**: the extension registers its command in Spec Kit's own namespace (`speckit.deskwork.govern` → `/speckit-deskwork-govern`). The command BODY shells out to deskwork's CLI (`dw-lifecycle audit-barrage …`) via `govern.sh`. deskwork's colon-namespaced *skills* (`/dw-lifecycle:audit-barrage`) are NOT invoked by the hook — only the deskwork *CLI verbs* are, from bash.
- **Rationale**: dissolves the dot→hyphen vs colon-namespace mismatch (TF-05/06). Spec Kit owns the hook command name; deskwork's CLI is just a subprocess the command runs. Clean separation, no naming collision.
- **Alternatives considered**: trying to make the hook invoke `/dw-lifecycle:audit-barrage` directly (Spec Kit's dot→hyphen mapping can't produce a colon; rejected).

## Decision 5 — How findings are lifted into the finding store

- **Decision**: reuse `dw-lifecycle audit-barrage-lift --feature pluggable-lifecycle-providers --run-dir <run-dir> --apply` to lift the barrage output into `audit-log.md` with stable IDs + `Status: open`.
- **Rationale**: that verb already exists (referenced in the audit-barrage skill); reusing it honors "compose existing verbs, don't rebuild." Keeps the slice to wiring.
- **Alternatives considered**: a new TS lift helper (only if the existing verb can't target this feature's `audit-log.md`; deferred to implementation if needed, test-first).

## Net-new code assessment

The slice is predominantly **wiring**: extension manifest + a markdown command body + `govern.sh` composing existing `dw-lifecycle` verbs. New TypeScript is added ONLY if diff-context assembly or the findings-lift can't be expressed by composing existing verbs in bash — and if added, it is written test-first under `plugins/dw-lifecycle/src/governance-bridge/`. This keeps the slice honest to its research purpose (learn the seam) rather than building the durable bridge prematurely.
