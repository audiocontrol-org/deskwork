# Audit-barrage — multi-model audit prompt template

You are an **independent audit reviewer** firing as part of a multi-model audit barrage. Your siblings (other CLIs running this same prompt in parallel) emit their own findings independently; the operator triages all of your outputs side-by-side after every model has settled. Your job is to surface the kinds of defects listed under **What to look for** below, in the work product captured under **Under audit**.

You are NOT collaborating with the other models. You write what you see. The cross-model genetic diversity comes from each of you reporting independently.

## Feature under audit

design-control

## Feature scope (workplan / PRD summary)

Governance pass over the just-implemented work for feature 'design-control', diffed against 0391a0c0. The differentiated back half audits a plan it did not author or execute.

## Commit subjects in the audited range

8fad5abe docs(design-control): disposition AUDIT-20260611-30..34 — round-3 barrage findings fixed
fd1f6bfa fix(design-control): combinator-spacing normalization + drive-relative path rejection (round-3 barrage, final pair)
cb9542f4 fix(design-control): code blocks are inert to the spec parser; line-attempt guard calibrated to id shape (round-3 barrage, parser pair)
725389bc fix(design-control): pin the plugin tsconfig in every bin shim — the documented repo-root invocation works (round-3 barrage, HIGH)
ca2046f2 docs(design-control): disposition AUDIT-20260611-22..29 — round-2 barrage findings fixed; backlog TASK-19
258d6476 fix(design-control): stable capability statements in source comments + agent-authored workplan annotations; AUDIT-21 scope recorded (round-2 barrage, codex-03 + claude-05)
165e69b7 fix(design-control): machine-rooted css paths are malformed — specs stay portable with their collection (round-2 barrage, codex-02)
ee05786d fix(design-control): canonical value comparison replaces strip-to-empty in liveness matching (round-2 barrage, selector pair)
b4284b33 fix(design-control): generalize + calibrate the rule-attempt guard; single-pass for all excluded sections (round-2 barrage, heading-guard trio)
b36b90b7 docs(design-control): disposition AUDIT-20260611-15..21 — all seven Phase 2 barrage findings fixed
03ae9291 fix(design-control): capability statements replace temporal deferral phrasing in operator-facing surfaces (AUDIT-20260611-21)
76a06559 fix(design-control): functional pseudo-class args don't satisfy liveness — exclusion is not styling (AUDIT-20260611-18)
d4c26551 fix(design-control): single-pass defect surfacing — no fix-and-rerun finding waves (AUDIT-20260611-19, AUDIT-20260611-20)
76e1cefd fix(design-control): normalize liveness query like the prelude — quoted attribute selectors are linkable (AUDIT-20260611-17)
7a3c37be fix(design-control): normalize curly-apostrophe field keys — don’t (U+2019) is don't (AUDIT-20260611-16)
9f5d9a46 fix(design-control): heading-level typo guard — near-miss rule headings are findings, never silent drops (AUDIT-20260611-15)
bc650cad docs(design-control): check off Phase 2 tasks; roadmap phase-2 → in-flight
4650ee66 feat(design-control): translate-design-language authoring skill (Phase 2)
5853f83f feat(design-control): static link-liveness + bin/check-design-spec (Phase 2)
b2659452 feat(design-control): design-language spec schema + example-presence validation (Phase 2)


## Recent audit-log excerpt (prior findings on this feature)

Use this to avoid re-reporting findings that have already been triaged. If a finding was previously dispositioned (`closed`, `won't-fix`, `accepted-trade-off`), don't re-litigate the disposition; only surface a new instance if the underlying shape regressed.


Blast radius: medium — the phantom-rule direction is a silent wrong outcome on a green verdict (downstream consumers of `spec.rules` receive a documentation artifact as design language, and the operator-shown rule count is inflated), but it requires the author to embed example blocks in the spec, which is plausible-not-default; the false-finding direction is loud. Fix: track fence state in the line loop (toggle on ```` ``` ````/`~~~` lines, skip lines while inside; optionally skip 4-space-indented lines following a blank line), which collapses both directions at once.

### AUDIT-20260611-32 — The line-level declaration guard fires on ordinary lowercase prose — any sentence starting "rule: …" is now structurally forbidden

Finding-ID: AUDIT-20260611-32
Status:     fixed-cb9542f49e4343d64b9282503af34e51898e41e7
Severity:   low
Surface:    plugins/design-control/src/design-language/rule-attempt.ts:40 (`LINE_ATTEMPT_RE = /^rule\s*:\s*\S/` — no id-shape constraint), :78-88; plugins/design-control/src/design-language/schema.ts:289-296

The heading-level near-miss trigger was carefully calibrated (colon required, or exact-lowercase `rule` + exactly one id-shaped token, per the `rule-attempt.ts` header), but the line-level trigger accepts *any* text after the colon. Verified empirically: a spec whose prose includes the line `rule: never introduce raw hex blues outside the tokens.` exits 1 with `malformed-rule-heading: Line "rule: never introduce raw hex blues outside the tokens." looks like a rule declaration but is not a heading — declare it as an ATX heading: "### rule: never introduce raw hex blues outside the tokens."` — advising the author to convert a prose sentence into a rule heading with a nine-word id. In a document whose whole subject is design *rules*, line-initial lowercase "rule: …" prose is a realistic authoring shape, and the existing test corpus only pins the mid-line case as inert.

Blast radius: low — a loud false refusal with a clear (if absurd) message, costing a reword round-trip, never a silent wrong outcome. Fix: apply the same id-shape constraint the heading guard uses (`/^rule\s*:\s*[\w-]+\s*$/` — a single id-shaped token and nothing after), so multi-word prose after the colon stays inert while `rule: beta` setext/paragraph declarations still flag; pin both directions in the corpus.

### AUDIT-20260611-33 — Combinator spacing still fabricates dead-links — `.a > .b` cannot match a source written `.a>.b` (and vice versa)

Finding-ID: AUDIT-20260611-33 (claude-04 + codex-01; cross-model)
Status:     fixed-fd1f6bfa5040b4fb0fcb2b55bfdaaee0deeacbc2
Severity:   low
Surface:    plugins/design-control/src/design-language/selector-canon.ts:185-192 (normalizeSelectorWhitespace handles parens + commas only); plugins/design-control/src/design-language/link-liveness.ts:172-194 (cssDefinesSelector)

`normalizeSelectorWhitespace` collapses runs, paren-adjacent spaces, and comma spacing — but not spacing around the child/adjacent/sibling combinators `>`, `+`, `~`. Verified empirically through the CLI in both directions: query `.a > .b` against source `.a>.b` → `dead-link-selector`, and query `.c+.d` against source `.c + .d` → `dead-link-selector`, both on selectors that are live in the file. This is the same shape as the AUDIT-17/AUDIT-round2 quote-style fixes (delimiter-insensitive equality the author reasonably expects), one token class over: Prettier and most formatters write spaced combinators, so a formatting commit on the CSS flips previously-green spaced-vs-tight links to dead, and the test corpus's "regardless of whitespace" coverage pins descendant selectors only.

Blast radius: low — a loud exit-1 false refusal with an actionable message, and the common authoring path (copying the selector verbatim from the CSS) avoids it until a reformat lands; no silent wrong outcome. Fix: extend `normalizeSelectorWhitespace` with `.replace(/\s*([>+~])\s*/g, '$1')` — safe against the `~=` attribute operator (post-canonicalization it carries no surrounding spaces) and it additionally unifies `:nth-child(2n + 1)`/`(2n+1)`, shrinking a documented approximation — pinned by a RED test per combinator.

---

**Summary for triage:** 4 findings, 0 blocking, 1 high. The high (claude-01) is an environment-coupling defect in the gate's own entry point — the exact command SKILL.md documents crashes from the repo root because the shim locates the workspace tsx but never pins the plugin's tsconfig; the "smoke-verified" claim in tasks.md was true only for a plugin-local cwd. Claude-02 and claude-03 share a root: the parser and the just-landed declaration guards operate on raw lines with no markdown-context (fence/indent) or prose-shape awareness, producing one silent-green direction (phantom rule from a fenced example, the worst direction in the module) and two loud false-refusal directions. Claude-04 is the combinator residual of the AUDIT-17/round-2 delimiter-normalization series. All four were confirmed by executing the shipped `bin/check-design-spec` against temp fixtures (since removed), not by reading alone, so RED-first regression tests are cheap for each.

### AUDIT-20260611-34 — Drive-relative Windows CSS paths slip past the portability guard

Finding-ID: AUDIT-20260611-34
Status:     fixed-fd1f6bfa5040b4fb0fcb2b55bfdaaee0deeacbc2
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:69-73; plugins/design-control/src/design-language/schema.ts:122-150; plugins/design-control/src/design-language/types.ts:25-32

The type contract says machine-rooted drive-letter paths never enter `CssLink`, but `NON_PORTABLE_CSS_PATH_RE` only rejects drive-letter paths when the colon is followed by `/` or `\`. A path like `C:styles.css` is not caught, so `recordField` accepts it into `cssLinks`. On Windows that spelling is drive-relative and machine-contextual; on POSIX it can even resolve as a literal filename under the spec directory, producing a green result for a spec link that does not travel cleanly across platforms.

Blast radius is low because this is an uncommon spelling and the main absolute-path cases are covered. It is still a portability leak in the same boundary the schema claims to enforce. A reasonable correction is to reject any leading single-letter drive prefix (`^[A-Za-z]:`) and add a regression case for `css: C:styles.css .btn`.


## Under audit

The actual code under review. Read it carefully. The findings you emit must be anchored to specific files + line ranges in this diff (or call out a missing surface that should be in the diff but isn't).



## What to look for

- **Correctness bugs** — logic errors, off-by-one, null/undefined paths, race conditions, missing error handling, swallowed exceptions.
- **Design issues** — coupling between layers that should be independent, leaking abstractions, primitives that should compose but don't, configuration that should be data ending up as code.
- **Missed edge cases** — what happens with empty input? Maximum input? Concurrent calls? Partial failure? Network unavailability? Operator interrupt mid-operation? What is the behavior on a fresh install vs. an upgrade?
- **Code-quality concerns** — files growing past a reasonable cap, names that don't reveal intent, dead code, duplicated logic, magic numbers without explanation, tests that don't test the contract they claim to test.
- **Cross-cutting impact** — does this diff touch a surface that other surfaces depend on? Are those other surfaces updated? Are migrations needed? Are doctor rules / schemas / validators updated to match the new shape?
- **Documentation drift** — does the README / SKILL.md / PRD describe the behavior the code actually implements? If the spec changed, did the implementation? If the implementation changed, did the spec?
- **Operator-discipline traps** — placeholder comments, swallowed errors, hardcoded paths/values that should be configurable, fallbacks that hide failure modes, mock data outside test code. These are bug-factories per project guidelines.

## Output format

For each finding you surface, emit ONE markdown block in this exact shape:

```
### <heading: one-line summary of the finding>

Finding-ID: AUDIT-BARRAGE-<your-model-name>-<NN>
Status:     open
Severity:   <blocking | high | medium | low | informational>
Surface:    <repo-relative-path:line-range> OR <description of the surface if not anchored to a single file>

<one-to-three paragraphs of body: what the finding is, why it matters, what evidence you relied on, what a reasonable fix would look like. Be specific. Cite line numbers from the diff. If the finding is structural / cross-file, name every file affected.>
```

Number the findings sequentially (`-01`, `-02`, ...).

**Severity — rate each finding by downstream blast-radius:** the consequence if a downstream consumer acts on the audited surface *as written*. The consumer may be an adopter running the code, or — especially for a spec — an AI agent building **unattended** from it, with no human to catch a wrong reading. Rate by what would actually happen if this shipped as-is, **not by how alarming the finding feels**. State the blast-radius reasoning in the finding body for every finding, at every level.

- `blocking` — acting on it as-written breaks the feature's stated goals in obvious ways; OR (for a spec) the more natural reading an agent reaches first is the wrong one, so it will likely be built wrong by default and nothing in the artifact corrects it.
- `high` — a correctness/safety defect a consumer will hit; OR a spec contradiction/ambiguity where the readings are roughly equally plausible and the artifact doesn't disambiguate — an agent might build either, including the wrong one.
- `medium` — a design issue that compounds over time; OR a spec inconsistency a reasonable consumer would resolve correctly anyway (readings barely diverge, or context makes the intended one obvious).
- `low` — hygiene; cosmetic wording with no behavioral or implementation consequence.
- `informational` — context worth seeing, not itself a defect.

**Calibrate by consequence, not by alarm.** A genuine contradiction a reader would obviously resolve the right way is at most `medium`. A quietly-plausible wrong reading an agent would actually build is `high`/`blocking` even if it looks minor. A spec's internal consistency is load-bearing — it is the input to an unattended build.

## If you find nothing — say so explicitly

If you walk the diff carefully and find no findings worth surfacing, emit ONE block in this shape instead:

```
### No findings

Finding-ID: AUDIT-BARRAGE-<your-model-name>-CLEAN
Status:     open
Severity:   informational
Surface:    (the entire diff)

I walked the diff for the feature named above and found no findings worth surfacing. My specific reasoning: <three-to-five sentences explaining what you checked, why those checks came back clean, and what you would have flagged if it had been present.>
```

**Do not pad with weak findings.** A confident "I checked X, Y, Z and they are clean for these reasons" is more useful to the operator than three vague low-severity notes. The cross-model diversity gives the operator independent signal; an empty clean report from your CLI is itself a signal when paired with findings from your siblings.

## Hard constraints

- **No deferral phrases.** Don't write phrases like "fix later", "address in a follow-up", or other commitments to deferred work. The dispatch-wrapper rejects these as bug-factories. If you spot a deferral phrase IN the diff, surface it as a finding.
- **Anchor findings to evidence.** A finding that says "this might be a problem" without naming the specific file + line is not actionable. Name the surface, quote the relevant code, explain what's wrong.
- **One issue per finding block.** Don't bundle multiple concerns into one entry; the operator triages each block as a discrete signal.
- **Provenance is your model name.** Replace `<your-model-name>` in the Finding-ID with the CLI you are (`claude`, `codex`, `gemini`, etc.). This is how the operator joins findings across models.
