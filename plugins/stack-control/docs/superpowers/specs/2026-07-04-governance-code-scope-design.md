# Design — governance code scope (restrict implement-time governance to code)

- Roadmap item: `impl:feature/governance-code-scope`
- Date: 2026-07-04
- Design backend: `superpowers:brainstorming`, driven via `/stack-control:design`
- House rules injected: `stack-control-design-v1` (capture-over-yagni; ≥2 solution-space alternatives; required sections; operator-approval marker; handoff to `/stack-control:define`; installation-anchored record)

## Problem Domain

During `/stack-control:execute`, implementation-time governance (the cross-model
audit-barrage that fires as the `after_implement` step) audits the **whole
committed feature diff** — code *and* documentation alike. This produces two
concrete harms the operator has hit repeatedly while dogfooding:

1. **Documentation-trivia obsession.** Auditors ring on wording/phrasing corners of
   forward-looking prose (PRDs, specs, journals, READMEs) — the "near-infinite
   phrase-more-precisely surface." The shipped severity-determinism/dampener
   machinery does not stop prose nitpicking; it defeats convergence and forces
   overrides. (Same pain the roadmap item `multi:gap/govern-doc-aware-audit-lens`
   names from the other direction.)
2. **Context-window blowout.** Large documentation files inflate the audit payload,
   overflowing the context window of smaller models in the fleet — degrading or
   knocking out fleet members precisely when the payload is doc-heavy.

The operator's framing resolves *why* this is safe to cut: **by the time
implementation governance runs, documentation feedback is not wanted** — the docs
are reviewed by the operator directly, not by the barrage. Governance at implement
time should concern itself with **code**.

### The load-bearing definition (governing classification rule)

> **Code is anything that defines the runtime environment. Documentation is
> meta-information *about* the code that does not affect the runtime environment.**

Consequences of this definition, specific to stack-control:

- A `SKILL.md` skill body **is code** — it defines agent runtime behavior (per the
  project's own `enforcement-lives-in-skills` rule, enforcement *lives in* skill
  bodies). It must stay in the audited payload.
- `WORKFLOW.md` (governed lifecycle gates), and context-injected rule files
  (`.claude/rules/**/*.md`, `CLAUDE.md`, `AGENTS.md`) that shape agent runtime
  behavior, are likewise **code**.
- PRDs, `spec.md`, `plan.md`, journals, `DEVELOPMENT-NOTES.md`, design records,
  READMEs are **documentation** — meta-information about the code.

So the feature is not "exclude markdown." It is **"exclude documentation"** from the
implement-time audit payload. Extension (`.md`) is only the cheap first cut; the
real boundary (runtime-defining vs meta) is encoded by an operator-tunable
include/exclude policy.

### Scope facts (from the payload-assembly recon)

- `--phase` is **retired** (030). Implement mode audits the whole committed feature
  diff (`base..HEAD`, base = merge-base with the default branch), chunked to fit
  the fleet envelope, reconciled once. `/stack-control:execute` fires this path
  non-discretionarily at the end of `implementing`.
- Every implement-mode file funnels through **one seam**: the `scopeDiff` closure at
  `src/govern/end-govern-runtime.ts:245`, which composes
  `filterDiffScope(scopeCommittedDiff(...), excludeDiffPaths)`. It is called in
  exactly two places — the initial scope and the mid-fix re-scope
  (`end-govern-pipeline.ts:98,192`) — so a filter added here cannot be bypassed.
- There is **no file-type awareness anywhere** in payload assembly today. All
  existing filtering is *path*-based (`resolveImplementExclusion` /
  `filterDiffScope`), never extension/glob-based.
- The implement lens (`CODE_AUDIT_LENS`, `src/govern/audit-constants.ts:18`)
  explicitly instructs auditors to check *documentation drift* — an instruction
  that becomes un-anchorable once docs leave the payload.
- Empty scope is **FATAL** (`end-govern-pipeline.ts:105`) — a genuinely doc-only
  diff would trip it under a code-only policy.
- Prior art: the clone-detection sub-step is already code-only by construction
  (TS/TSX only, `clone-detector.ts:3`) — "governance may legitimately scope to
  code" already exists in the codebase.

## Solution Space

### Chosen — input-side exclusion via a glob include/exclude policy at the single scope seam

Add a `DiffScope → DiffScope` glob filter (`applyCodeScope`), a sibling of the
existing path-based `filterDiffScope`, living in `src/govern/payload-diff-scope.ts`.
Compose it at the one `scopeDiff` seam (`end-govern-runtime.ts:245`):

```
scopeDiff = applyCodeScope(
  filterDiffScope( scopeCommittedDiff(...), excludeDiffPaths ),
  codeScopePolicy,
)
```

Filter semantics: a file **drops** iff it matches an `exclude` glob **and** matches
no `include` glob (**include wins**); everything else stays. The policy is resolved
once in `runImplementArm` (where `resolveImplementExclusion` already runs) and
threaded into the runtime alongside `excludeDiffPaths`, so `end-govern-pipeline.ts`
stays untouched and vendor-neutral — it simply receives an already-code-only scope,
and the mid-fix re-scope inherits the filter for free.

Configuration lives in a new `InstallationConfig.govern` block (default ON). The
implement lens drops its documentation-drift bullet when the policy is active.

**Why chosen:** it is the *only* option that addresses **both** harms — excluding
at the input removes the doc-trivia surface *and* the doc bytes that blow out the
context window. It reuses the existing single chokepoint (`DiffScope.files`) and the
existing `DiffScope → DiffScope` filter shape, so the blast radius is one new pure
function + one composition + one config block + one lens variant. Encoding the
boundary as include/exclude globs lets the operator (not hardcoded logic) own the
runtime-vs-meta judgment, honoring the governing definition.

### Rejected — post-audit dampening of documentation findings

Keep docs in the payload but filter/suppress *findings* that pertain to doc files
after the audit runs (extending the severity dampener / slush machinery).

**Rejected because:** it does nothing for the **context-window blowout** — the doc
bytes are still shipped into every model, so smaller models still overflow. It only
addresses the trivia-obsession half, and even then only after paying the token cost.
Wrong layer: the harm is at the input, so the fix belongs at the input.

### Rejected — lens-only "review documentation more gently" (the doc-aware-lens shape)

Keep docs in the payload but instruct auditors (via a prose-aware lens) to flag only
substantive doc defects and suppress wording nits — the approach
`multi:gap/govern-doc-aware-audit-lens` proposes.

**Rejected because:** same input-side blindness as post-audit dampening — the docs
still enter the payload, so the context-window blowout is unaddressed. It also relies
on the model *honoring* a soft instruction, which the observed prose-ringing shows is
unreliable. This feature supersedes the **implement-time** half of that item (see
Decisions / cross-cut).

### Rejected — allowlist by code extension (audit only known source extensions)

Invert to an allowlist: include only `.ts/.tsx/.js/.sh/.py/...` and drop everything
else.

**Rejected because:** it is an inverted-denylist maintenance burden that silently
drops non-source-but-runtime-relevant files (config, schema, `.json`/`.yaml`) and
would *also* drop runtime-defining markdown (`SKILL.md`) unless every product
extension is enumerated — the opposite of the governing definition, which says the
boundary is runtime-vs-meta, not source-extension membership.

### Rejected — path/directory-based exclusion (drop `docs/`, `specs/`)

Exclude documentation *directories* rather than a glob predicate.

**Rejected because:** brittle across adopter layouts (doc locations vary), and it
misses documentation that lives *next to* code (a README or PRD in a code dir) while
risking dropping runtime markdown that lives under a `specs/`-adjacent tree. A glob
include/exclude policy subsumes path exclusion (a directory glob is expressible) without
the layout coupling.

## Decisions

1. **Restrict implement-mode governance to code.** The whole-feature `end-govern`
   implement payload is filtered to code before chunking. Documentation is excluded
   and is the **operator's** review responsibility — never a barrage concern. No
   doc-governance venue is built.

2. **Governing classification rule:** code = defines the runtime environment; docs =
   meta-information about the code that does not affect the runtime. Encoded via
   include/exclude globs; extension is the cheap first cut, not the definition.

3. **Mechanism:** a new pure `applyCodeScope(scope, policy): DiffScope` in
   `payload-diff-scope.ts`, composed at the single `scopeDiff` seam
   (`end-govern-runtime.ts:245`), threaded from `runImplementArm`. `end-govern-pipeline.ts`
   is untouched.

4. **Filter semantics:** drop iff (matches `exclude`) AND (matches no `include`).
   **Include wins.** Everything unmatched by `exclude` stays.

5. **Config surface:** new `InstallationConfig.govern` block (`src/config/types.ts`,
   the first govern-tuning field), snake_case YAML at `.stack-control/config.yaml`:
   - `govern.code_only: boolean` — master toggle, **default `true`**.
   - `govern.code_scope.exclude: string[]` — **default `["**/*.md", "**/*.markdown"]`**.
   - `govern.code_scope.include: string[]` — **default** the runtime-defining
     markdown set: `["**/SKILL.md", "**/WORKFLOW.md", "**/.claude/rules/**/*.md",
     "**/CLAUDE.md", "CLAUDE.md", "**/AGENTS.md", "AGENTS.md"]`.
   - Absent block → defaults apply (dogfood repo + adopters get the benefit with zero
     config). `code_only: false` → `applyCodeScope` is an identity no-op (today's
     behavior returns exactly).
   - Operator-supplied `exclude`/`include` **replace** the defaults (not merge) — for
     auditability, so the effective lists are fully readable from the config file.

6. **Lens:** when `code_only` is active, the implement lens omits the
   `CODE_AUDIT_LENS` documentation-drift bullet (`audit-constants.ts:18`) — auditors
   are asked only about code in front of them. Realized as a code-only lens variant
   selected by the toggle (mirrors the existing mode-selected `CODE_AUDIT_LENS` vs
   `SPEC_AUDIT_LENS`).

7. **Empty code scope → clean success.** When code-only filtering empties the scope
   (a genuinely doc-only diff), convert the empty-scope FATAL
   (`end-govern-pipeline.ts:105`) into a **"nothing to govern — no code in scope"
   success** that lets the item graduate. Implication accepted: a doc-only change can
   ship without a barrage run, consistent with "docs are operator-reviewed."

8. **Including large rule files does not reintroduce the blowout.** The payload is
   diff-scoped — a rule file (`.claude/rules/**/*.md`, `CLAUDE.md`) appears only when
   a feature actually *changed* it, and in that case governing the change is correct
   (it is a runtime change). So keeping runtime markdown in `include` is safe with
   respect to the context-window concern.

9. **Scope boundaries:** implement mode only. Spec-mode govern is untouched (and
   parked regardless). The clone sub-step is already code-only — no change.

**Cross-cut (roadmap disposition, operator-owned):** this feature supersedes the
**implement-time** half of `multi:gap/govern-doc-aware-audit-lens`. Flag it for a
roadmap disposition (reframe to its non-implement scope, or retire) — not decided in
this design.

## Open Questions

1. **Replace vs merge for operator-supplied lists.** Decision 5 chooses *replace* for
   auditability. Re-confirm during implementation if an operator use-case wants
   "defaults plus my additions" ergonomics (could add a `merge: true` opt-in later —
   not in this design).
2. **Glob engine.** The design commits to glob semantics; the concrete library
   (`minimatch` / `picomatch` / git-pathspec) and whether `**/*.md` must also match a
   repo-root `CLAUDE.md` (hence the explicit `CLAUDE.md`/`AGENTS.md` root entries in
   the default `include`) is an implementation-time pin. Whichever engine is chosen
   must match at repo root as well as nested.
3. **Markdown test fixtures.** If any `.md` files exist as test *data* whose content
   should be audited as code, they drop under the default `exclude`; the operator
   rescues them via an `include` glob. Not a blocker; noted so implementation adds a
   fixture-rescue example to the docs.
4. **Default `include` breadth for rule files.** The chosen default treats
   context-injected rule files as code. If in practice this proves too broad (e.g. a
   feature that reflows many rule files floods the payload), narrow the default and
   document the trade-off — the toggle/lists make this tunable without code change.

## Provenance

- **Roadmap item:** `impl:feature/governance-code-scope` (bare placeholder added on
  branch `feature/governance-code-scope`, commit `6f201271`).
- **Operator problem statement (2026-07-04 session):** restrict execute-time
  governance to just code; the audit barrage gets gunked up on documentation trivia;
  large documentation sizes blow out the context window, especially for smaller
  models; by the time implementation governance is underway, documentation feedback
  is not wanted. Governing definition supplied by the operator: *"a skill body is
  code; documentation is meta-information about the code that doesn't affect the
  runtime environment; code is what defines the runtime environment."* Docs are
  reviewed by the operator.
- **Design dialogue decisions (operator picks):** exclude documentation (Q1);
  configurable, default ON (Q2); drop the doc-drift lens bullet (Q3); keep
  runtime-defining markdown via include, treat skill bodies + rule files as code
  (Q4/refinement); include-wins precedence + shipped sensible defaults; clean-success
  for doc-only diffs.
- **Payload-assembly recon (this session):** single `scopeDiff` seam at
  `end-govern-runtime.ts:245`; no extension-awareness today; `--phase` retired (030);
  `CODE_AUDIT_LENS:18` doc-drift instruction; empty-scope FATAL at
  `end-govern-pipeline.ts:105`; clone gate already code-only (`clone-detector.ts:3`);
  config home `InstallationConfig` (`config/types.ts:62`).
- **Architectural constraints honored:**
  `.claude/rules/audit-barrage-is-stochastic-defense-in-depth.md` — this is an
  *input-scoping* decision (what the stochastic layer looks at), and the filter itself
  is a decidable transform, so it is unit-tested on the deterministic floor, not left
  to the barrage. `enforcement-lives-in-skills.md` — motivates treating `SKILL.md` as
  code.
- **Related roadmap item:** `multi:gap/govern-doc-aware-audit-lens` (superseded at
  implement time; see cross-cut).
