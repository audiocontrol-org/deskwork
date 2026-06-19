---
id: TASK-295
title: >-
  govern clone-step is TypeScript-only — fatally blocks per-phase governance on
  non-TS (Bash/PHP/WordPress) adopter codebases
status: To Do
assignee: []
created_date: '2026-06-19 05:05'
labels:
  - 'type:imported-issue'
  - bug
  - customer-blocking
dependencies: []
references:
  - gh-487
ordinal: 295000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

`stackctl govern` (implement mode) cannot run on a **non-TypeScript** adopter codebase. The advisory clone-detection step is hardcoded to `--format typescript,tsx`, so on a Bash/PHP/WordPress project jscpd matches zero files, writes no report, and the resulting throw **aborts govern before the (language-agnostic) cross-model barrage ever runs**. This makes per-phase governance — and therefore `/stack-control:execute` — unusable on any non-TS adopter repo.

Found while running `/stack-control:execute` on a WordPress site repo (the `change-runbook` feature: Bash runbooks, zero TypeScript).

## Environment

- stack-control `0.51.1` (`@deskwork/plugin-stack-control`)
- Adopter repo: Bash + PHP + WordPress, **no `.ts`/`.tsx` files**
- jscpd resolved fine from the plugin's `node_modules`; `.gitignore` correctly scopes the tree (≈660 tracked files; 22 GB media gitignored)

## Repro

```
node <plugin>/node_modules/jscpd/bin/jscpd <repo-root> \
  --min-tokens 50 --format typescript,tsx --reporters json \
  --output <tmp> --ignore '**/*.test.ts,**/dist/**,**/node_modules/**,**/.runtime-cache/**,**/coverage/**,**/.specify/**' \
  --absolute --gitignore --silent
```

→ exits without writing `jscpd-report.json` (no files match the TS-only format).

Then `stackctl govern --mode implement --phase 1 --feature <slug> --diff-base HEAD`:

```
govern clone-step: clone detection error — jscpd ran over <repo> but did not write jscpd-report.json.
govern: FATAL — jscpd ran over <repo> but did not write jscpd-report.json.
govern: terminal-outcome=fatal
```

## Root cause

- `src/scope-discovery/jscpd-runner.ts` — `const FORMATS = 'typescript,tsx'` (plus a TS-only `BASE_IGNORE` like `**/*.test.ts` and a TS-tuned `--min-tokens`). No matching files ⇒ no report ⇒ `jscpd-runner` throws "jscpd ran over `<root>` but did not write jscpd-report.json".
- `src/subcommands/govern.ts` (~L813-815) calls `runCloneDetectionStep(...)` **un-wrapped**, so that throw propagates and FATALs govern — *before* the cross-model barrage (~L829+) runs.
- This contradicts the documented contract: the clone step is **advisory** ("does not override the convergence gate", #432). An advisory step should never be able to pre-empt the gate.

## Impact

`customer-blocking`: per-phase governance is impossible on any non-TypeScript adopter codebase, so `/stack-control:execute` cannot complete its govern boundary. The only workarounds are to skip governance entirely or hand-patch the cached plugin.

## Proposed fixes (any one unblocks; (a) is the minimal, contract-faithful one)

- **(a)** Make the advisory clone step non-fatal: wrap the `runCloneDetectionStep` call so an infra failure is logged and govern continues to the gate. The advisory contract should guarantee it can never abort the barrage.
- **(b)** Make `FORMATS` language-aware / configurable (per-installation config or a `--clone-format` flag), defaulting from the detected project languages.
- **(c)** Treat "no files matched the format" as `ran:false` (empty result) — the same advisory-skip path `clone-step.ts` already uses for `InstallationError 'not-found'`.

## Other frictions observed in the same `/stack-control:execute` session (lower priority)

1. **No verb records the `analyze-clean:` node-marker.** The `specifying → implementing` exit gate (read by `workflow compass --intent execute`) requires `analyze-clean:` on the roadmap node, but no `stackctl roadmap` verb sets it, and `workflow/effects.ts` has no node-marker effect. Its sibling `design-approved:` is also set by hand-edit per `design/SKILL.md`. So closing the specifying phase requires hand-editing a doc whose header says "do not hand-edit," and no skill documents recording it after a clean `/speckit-analyze`. Suggest an `analyze-clean` marker verb (or a `workflow advance` effect) + doc.
2. **Per-phase `govern --item` is wrongly refused mid-`implementing`.** `execute/SKILL.md` step 3.3 shows `govern --mode implement --phase <id>` with no `--item`. Adding `--item <id>` trips the lifecycle precondition (`govern.ts` ~L609-619): the compass runs with intent `govern` → targets the `governing` phase → REFUSED `ahead` because implementing isn't complete. `--feature <slug>` works. Suggest: when `--phase` is present, evaluate per-phase readiness (not whole-feature `governing` readiness), or warn in docs that `--item` is for the `governing`-phase call only.
<!-- SECTION:DESCRIPTION:END -->
