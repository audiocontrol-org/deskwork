# Contract: Anchor Resolution (`resolveAnchor`)

The one seam every stackctl verb (and every govern sub-step) resolves its domain through. Normative for FR-001, FR-002, FR-013; pinned by the isolation probe (FR-011).

## Signature (behavioral)

Input: optional explicit directory (`--at <dir>`), else the invocation's cwd.
Output: the single resolved domain (root + validated config) — or one of three loud failures.

## Rules

1. **Explicit beats ambient.** When `--at <dir>` is given, the walk starts at `<dir>`; cwd plays no role anywhere in the invocation.
2. **Whole-walk scan.** The walk-up continues to the filesystem root and counts every `.stack-control/config.yaml` marker — it never stops at the first hit.
3. **Exactly one marker → resolve.** Config is loaded and validated; a malformed config is its own loud error (not the not-found class, not a fall-through).
4. **Zero markers → `not-found`.** Rendered by every verb in the frozen wording class: `<verb>: FATAL — … run \`stackctl setup\` …` (exit semantics unchanged per verb).
5. **Two or more markers → `overlap`.** Loud error naming every discovered root. Never resolved nearest-first. `stackctl setup` is NOT offered as remediation (it cannot fix overlap); the message names the roots and states that overlapping domains are invalid.
6. **Resolved once, passed as a value.** A verb resolves its anchor exactly once per invocation; sub-steps receive it as data. No sub-step may call cwd-based resolution independently. (This is the mechanical retirement of the "two sub-steps disagree" defect class.)
7. **Out-of-domain access prohibited.** Given a resolved anchor, no stack-control read or write may target a path outside `domainRoot` — except the explicit `STACKCTL_BACKLOG_DIR` operator override (the only sanctioned pierce; see resolver-error-wording.md for its reporting duty).

## Creation-side counterpart (`stackctl setup`)

- Before scaffolding, setup runs the same whole-walk scan from the target directory.
- Any existing marker at OR above the target → refusal with the no-overlap diagnostic (names the existing root). Exit 2, zero writes.
- Successful setup seeds `<root>/.stack-control/audit-barrage-config.yaml` from the plugin template (owned copy; FR-004).

## Consumers (complete at time of writing)

govern (incl. exclude-paths + slush sub-steps), backlog dispatcher (capture / import-github / import-slush / promote / list), session-start, session-end, setup, install-scope-discovery, scope-widen, scope-inventory, slush-findings, audit-barrage, audit-barrage-lift. A new verb consuming anything stack-control-owned MUST resolve through this seam (constitution 1.4.0 inheritance clause).
