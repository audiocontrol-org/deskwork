I walked the round-3 tip state (rule-attempt guard, selector-canon two-mode matcher, portability rejection) and verified every behavioral hypothesis by driving the shipped `bin/check-design-spec` against real-fs fixtures before reporting. Cleared hypotheses I do NOT report: the throwaway-section single-pass surfacing now covers near-miss headings (pinned by tests); machine-rooted paths are rejected at the schema level and the liveness seam fail-louds on hand-built ones; attribute-value canonicalization correctly distinguishes `[data-state="open"]` from `"closed"` across all quote-style pairs; the setext probe no longer merges fields into the preceding rule; the `### rules:` plural hole and the `Rule masthead` capital-no-colon hole are inside the calibration trade-off the `rule-attempt.ts` header explicitly documents, so I treat them as a recorded decision, not a finding. Findings below, strongest first.

### The documented gate command crashes: the bin shim resolves tsx but not the `@/` path alias when invoked from anywhere but the plugin directory

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    plugins/design-control/bin/check-design-spec:9-26 (tsx walk-up + bare `exec "$TSX" …` with no `--tsconfig`); plugins/design-control/skills/translate-design-language/SKILL.md:77-78 (the documented invocation)

SKILL.md step 4 — "the non-negotiable step" — tells the operator to run `plugins/design-control/bin/check-design-spec <path/to/design-language.md>`, i.e. from the repository root. Verified empirically: that exact invocation crashes with `ERR_MODULE_NOT_FOUND: Cannot find package '@/design-language' imported from .../check-design-spec-cli.ts` and exits 1. The shim walks parent directories to find a `tsx` binary (it finds the workspace root's) but `tsx` resolves `tsconfig.json` — and therefore the `@/*` path mappings every module in this plugin uses — from the **current working directory**, and the repo root has no `tsconfig.json` (verified: `ls` fails). The same command run with cwd inside `plugins/design-control/` works. The tasks.md claim "shim smoke-verified both directions" was evidently verified with a plugin-local cwd, which is not the invocation the skill documents.

Blast radius: high — this is the enforcement seam every draft MUST pass through, the skill hands an unattended agent a verbatim command whose natural execution context (repo root, where the path `plugins/design-control/bin/...` makes sense) crashes, and the failure exits 1 — the same code the contract assigns to "findings present" — so a workflow that branches on exit code reads a loader crash as spec findings. The failure is loud (stack trace on stderr), which keeps it below blocking, but nothing in the artifact corrects the wrong cwd; an agent's likeliest recovery is confusion or a re-run from a different directory by accident. Fix: pass the plugin's own tsconfig explicitly — `exec "$TSX" --tsconfig "$PLUGIN_ROOT/tsconfig.json" "$PLUGIN_ROOT/src/design-language/check-design-spec-cli.ts" "$@"` — and add a smoke that runs the shim from the repository root (the documented direction), not only from the plugin directory.

### The parser is markdown-context-blind: a fenced example rule parses as a REAL rule and the spec reports green with an inflated rule count

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:45 (HEADING_RE applied line-by-line with no code-fence/indented-block state), :197-265 (parse loop), :289-296 (line-attempt guard, same blindness)

`parseDesignSpec` walks raw lines with no awareness of fenced (``` ```` ```) or indented code blocks, so markdown that *renders as an inert code example* is parsed as live spec structure. Verified empirically through the CLI: a spec with one real rule plus a fenced ```markdown example containing `### rule: phantom` (the SKILL.md-style authoring example, css link pointing at a live selector) reports **`spec green — 0 findings (2 rule(s))`** — the documentation example becomes a real parsed rule, silently. The same blindness drives the loud direction: an *indented* code line `rule: sample` inside an authoring example produces a false `malformed-rule-heading` (verified, exit 1). Note the trap is self-modeling: SKILL.md's own convention section teaches the format via exactly such a fenced example; an author who pastes that preamble into their spec for future maintainers gets either a phantom rule (if the example's selector happens to be live, as SKILL.md's `.btn-primary` would be in this very project) or spurious dead-link findings on documentation text.

Blast radius: medium — the phantom-rule direction is a silent wrong outcome on a green verdict (downstream consumers of `spec.rules` receive a documentation artifact as design language, and the operator-shown rule count is inflated), but it requires the author to embed example blocks in the spec, which is plausible-not-default; the false-finding direction is loud. Fix: track fence state in the line loop (toggle on ```` ``` ````/`~~~` lines, skip lines while inside; optionally skip 4-space-indented lines following a blank line), which collapses both directions at once.

### The line-level declaration guard fires on ordinary lowercase prose — any sentence starting "rule: …" is now structurally forbidden

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/rule-attempt.ts:40 (`LINE_ATTEMPT_RE = /^rule\s*:\s*\S/` — no id-shape constraint), :78-88; plugins/design-control/src/design-language/schema.ts:289-296

The heading-level near-miss trigger was carefully calibrated (colon required, or exact-lowercase `rule` + exactly one id-shaped token, per the `rule-attempt.ts` header), but the line-level trigger accepts *any* text after the colon. Verified empirically: a spec whose prose includes the line `rule: never introduce raw hex blues outside the tokens.` exits 1 with `malformed-rule-heading: Line "rule: never introduce raw hex blues outside the tokens." looks like a rule declaration but is not a heading — declare it as an ATX heading: "### rule: never introduce raw hex blues outside the tokens."` — advising the author to convert a prose sentence into a rule heading with a nine-word id. In a document whose whole subject is design *rules*, line-initial lowercase "rule: …" prose is a realistic authoring shape, and the existing test corpus only pins the mid-line case as inert.

Blast radius: low — a loud false refusal with a clear (if absurd) message, costing a reword round-trip, never a silent wrong outcome. Fix: apply the same id-shape constraint the heading guard uses (`/^rule\s*:\s*[\w-]+\s*$/` — a single id-shaped token and nothing after), so multi-word prose after the colon stays inert while `rule: beta` setext/paragraph declarations still flag; pin both directions in the corpus.

### Combinator spacing still fabricates dead-links — `.a > .b` cannot match a source written `.a>.b` (and vice versa)

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/selector-canon.ts:185-192 (normalizeSelectorWhitespace handles parens + commas only); plugins/design-control/src/design-language/link-liveness.ts:172-194 (cssDefinesSelector)

`normalizeSelectorWhitespace` collapses runs, paren-adjacent spaces, and comma spacing — but not spacing around the child/adjacent/sibling combinators `>`, `+`, `~`. Verified empirically through the CLI in both directions: query `.a > .b` against source `.a>.b` → `dead-link-selector`, and query `.c+.d` against source `.c + .d` → `dead-link-selector`, both on selectors that are live in the file. This is the same shape as the AUDIT-17/AUDIT-round2 quote-style fixes (delimiter-insensitive equality the author reasonably expects), one token class over: Prettier and most formatters write spaced combinators, so a formatting commit on the CSS flips previously-green spaced-vs-tight links to dead, and the test corpus's "regardless of whitespace" coverage pins descendant selectors only.

Blast radius: low — a loud exit-1 false refusal with an actionable message, and the common authoring path (copying the selector verbatim from the CSS) avoids it until a reformat lands; no silent wrong outcome. Fix: extend `normalizeSelectorWhitespace` with `.replace(/\s*([>+~])\s*/g, '$1')` — safe against the `~=` attribute operator (post-canonicalization it carries no surrounding spaces) and it additionally unifies `:nth-child(2n + 1)`/`(2n+1)`, shrinking a documented approximation — pinned by a RED test per combinator.

---

**Summary for triage:** 4 findings, 0 blocking, 1 high. The high (claude-01) is an environment-coupling defect in the gate's own entry point — the exact command SKILL.md documents crashes from the repo root because the shim locates the workspace tsx but never pins the plugin's tsconfig; the "smoke-verified" claim in tasks.md was true only for a plugin-local cwd. Claude-02 and claude-03 share a root: the parser and the just-landed declaration guards operate on raw lines with no markdown-context (fence/indent) or prose-shape awareness, producing one silent-green direction (phantom rule from a fenced example, the worst direction in the module) and two loud false-refusal directions. Claude-04 is the combinator residual of the AUDIT-17/round-2 delimiter-normalization series. All four were confirmed by executing the shipped `bin/check-design-spec` against temp fixtures (since removed), not by reading alone, so RED-first regression tests are cheap for each.
