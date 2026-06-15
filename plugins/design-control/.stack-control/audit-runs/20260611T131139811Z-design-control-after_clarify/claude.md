Suite is green post-fix (15 files, 439 tests, typecheck included), and all five of my behavioral hypotheses reproduced against the shipped modules. Findings below, strongest first — each verified by executing the actual code, not by reading alone.

---

### A setext `rule:` heading parses silently green — the rule vanishes and its fields merge into the preceding rule

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:36 (`HEADING_RE = /^#{1,6}\s+(.*)$/` — ATX only), :228-241 (near-miss guard fires only inside the ATX-heading branch)

The AUDIT-15 fix added a heading-level typo guard, but the guard lives entirely inside the ATX-heading branch — a markdown **setext** heading (`rule: beta` underlined with `---` or `===`) renders as a real heading to the author yet never matches `HEADING_RE`. Verified empirically: a spec with valid `### rule: alpha` followed by setext `rule: beta\n----------` and beta's field bullets returns `ok: true, findings: []` with ONE rule — alpha — now carrying **beta's css link and example merged into it** (`css: [.alpha, .beta]`, `examples: 2`). This is worse than a plain silent drop: the intended rule disappears with zero findings AND the surviving rule's parsed content is corrupted, so a dead `.beta` selector would later be misattributed to alpha, and a live one yields a fully green verdict (`spec green — 0 findings (1 rule(s))`) for a spec the author believes declares two rules. This is exactly the silent-green direction the module's headline guarantee ("never silently kept or dropped") and the just-landed near-miss guard exist to kill — one heading syntax over.

Blast radius: medium. The convention doc says ATX, which caps plausibility below the capitalized-`Rule:` case (rated high last round), but setext is legal CommonMark that renders identically to the author, the failure is invisible (green verdict, no count discrepancy beyond a rule-count the author must hand-check), and the corruption direction (field accrual into a neighboring rule) can survive into downstream consumers of `spec.rules`. Fix: detect setext underlines (a line of only `-`/`=` following a non-blank line) as headings in the line loop, or at minimum run the `RULE_NEAR_MISS_RE` guard against any *non-bullet* paragraph line matching `/^rule\b/i` so the attempted declaration surfaces as `malformed-rule-heading` instead of inert prose.

### The heading near-miss guard over-triggers: any prose heading whose first word is "Rule" can no longer appear in a green spec

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:43 (`RULE_NEAR_MISS_RE = /^rule\b/i`), :228-241 (offence classification)

The AUDIT-15 guard classifies every heading whose first word is `rule` (any case) as an *attempted* rule heading. Verified empirically: `## Rule of thumb` alongside one valid rule yields `malformed-rule-heading@1`, `ok: false` — exit 1. Ordinary documentation headings (`## Rule kinds`, `## Rule-based exceptions`, `## Rule of thirds` in a design doc about composition) are now structurally forbidden, and the finding's message compounds the confusion by asserting the heading is "missing the ':' after 'rule'" when no colon was ever intended. The classifier also misdescribes `### rule :x` (colon present, preceded by a space) as colon-missing. Neither the SKILL.md convention section nor the schema doc tells authors that headings beginning with the word "rule" are reserved.

Blast radius: low — the failure direction is a loud false refusal, not a silent wrong outcome; the operator sees the finding and can reword, though the misleading message costs a confused round-trip. The trade-off is inherent to near-miss detection, but the current net is wider than the test corpus admits (only `Ruler settings` is pinned inert). Fix options: narrow the trigger (e.g. require a colon somewhere in the heading, or `rule` followed by a single id-shaped token), make the message name the actual mismatch, and document the reserved prefix in SKILL.md's convention section.

### A near-miss heading's section body is dropped uninspected — the single-pass surfacing built in the same fix round doesn't cover it

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:227-243 (near-miss branch leaves `current` undefined; no throwaway section)

AUDIT-19/-20's fix (d4c26551) established the pattern: sections excluded from `spec.rules` are still parsed into throwaway sections so field-level defects and auxiliary css links surface in the same run. The near-miss branch added by AUDIT-15's fix (9f5d9a46) doesn't follow it — `current` stays `undefined`, so every bullet under a `### Rule: masthead` heading is skipped entirely. Verified empirically: a near-miss section containing both a misspelled `- exmaple:` and a `- css: studio.css .ghost` link produces only `["malformed-rule-heading"]` with `auxiliaryCssLinks: []` — the typo guard never fires and the link never reaches liveness. The author fixes the heading casing, reruns, and only then receives the next wave of findings — precisely the fix-and-rerun shape the same commit series eliminated for duplicate and structurally-invalid sections.

Blast radius: low — the near-miss finding itself gates exit 1, so nothing wrong ships; the cost is rerun-dependent discovery and an internally inconsistent parser contract (`schema.ts`'s own doc comment now promises single-pass surfacing that one of three excluded-section kinds doesn't deliver). Fix: mirror the duplicate-id branch — parse the near-miss section into a throwaway `RawRuleSection` (id from the attempted heading text) so field findings and `auxiliaryCssLinks` surface alongside `malformed-rule-heading`.

### Attribute-selector quote-style mismatch still fabricates a dead-link on a live selector — the AUDIT-17 fix only matches identical delimiters

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:50-76 (stripCommentsAndStrings preserves delimiters), :169-177 (cssDefinesSelector strips both sides)

The AUDIT-17 fix (76e1cefd) normalizes string *contents* on both sides, so a quoted query matches a quoted source — but delimiters are preserved, so any quote-style divergence between spec and CSS still fails. Verified empirically, all three ways: query `input[type=text]` vs source `input[type="text"]` → `false`; query `input[type="text"]` vs source `input[type=text]` → `false`; query `input[type="text"]` vs source `input[type='text']` → `false` (exact-style sanity check → `true`). All four spellings select identical elements in CSS; unquoted and single-quoted attribute values are completely ordinary authoring. The module's documented "accepted over-approximation" covers only the false-green direction (`[data-state="open"]` matching `[data-state="closed"]`) — this false-dead direction is undocumented and contradicts the header's "never fabricated into a dead-link verdict" promise within validated scope.

Blast radius: low — a visible exit-1 false refusal, and the realistic authoring path (copying the selector verbatim from the CSS file) sidesteps it; it bites when the author types the selector from memory or the CSS is later reformatted by a tool that changes quote style (Prettier normalizes to double quotes — a formatting commit would flip previously-green links to dead). Fix: normalize attribute-value delimiters on both sides (e.g. rewrite `['"]?` content-stripped values to a canonical empty `""`, treating `[attr=]`, `[attr=""]`, `[attr='']` identically), pinned by a RED test per quote-style pair.

### AUDIT-21 is dispositioned "fixed" but one of its cited surfaces — tasks.md — still carries the temporal deferral phrasing

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    plugins/design-control/specs/001-design-control/tasks.md:176-191 ("is **not validated in v1** (named-deferred)", "Runtime dead-CSS + spec-truthfulness are named-deferred", "visible v1 scope"); audit-log disposition for AUDIT-20260611-21

Commit 03ae9291 replaced temporal deferral phrasing with capability statements in SKILL.md and the CLI output (verified in the final-state diff: "reported as unchecked notes and do not establish link-liveness", "outside its validated scope" — clean), and the audit log records AUDIT-21 as `fixed-03ae9291`. But the original codex finding explicitly anchored three surfaces, including `tasks.md:176-191`, and the workplan's task text retains "not validated in v1 (named-deferred)" and "named-deferred" verbatim in the final state. The workplan is the artifact the next implementing agent reads to understand the gate's contract, so the bug-factory mechanism the finding named — agents normalizing "deferred" as the contract — survives on one of the three cited surfaces while the disposition claims all seven findings fixed.

Blast radius: low — the two surfaces an operator actually touches at run time (skill body, CLI output) are fixed, and a workplan is partially version-bound history where naming v1 is defensible; the defect is disposition accuracy (a `fixed` status whose cited surface is unchanged), which matters in this project precisely because the audit log is the instrument future rounds use to decide what not to re-report. Fix: either reword the tasks.md scope sentences to the same capability framing, or amend the AUDIT-21 disposition to record the deliberate exclusion of tasks.md so the narrowed scope is auditable.

---

**Summary for triage:** 5 findings, 0 blocking/high, 1 medium. The medium (claude-01) and the two heading-guard lows (claude-02, claude-03) share a root shape: the AUDIT-15 near-miss guard fixed the capitalized-`Rule:` instance but neither generalized to the other markdown heading syntax (setext — where the failure is silent-green plus cross-rule field corruption, the worst direction in the module) nor adopted the same commit series' own single-pass surfacing pattern for the sections it rejects. Claude-04 is the symmetric residual of AUDIT-17 (delimiter-sensitive matching). All four code findings reproduce with one-line probes against `parseDesignSpec`/`cssDefinesSelector` and were confirmed by execution; the suite at tip is green (439/439, typecheck clean), so each fix can land RED-first. Claude-05 is bookkeeping accuracy, not code.
