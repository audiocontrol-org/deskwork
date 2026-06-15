I walked the diff (schema parser, link-liveness, file-level composition, CLI shim, SKILL.md, tasks.md bookkeeping) and empirically verified each behavioral hypothesis by executing the actual modules via tsx before reporting. Cleared hypotheses I do NOT report: the engine-adapter's `ENGINE_METHODS` already registers `translate-design-language` (types.ts:30-34), so the skill's preflight gate has a real registry entry; the tasks.md test arithmetic (17 + 20, suite 397→417) reconciles against the `it`-block counts in the diff; the bin shim's tsx-walk and exit contract are consistent with its header. Findings below, strongest first.

### A heading-level typo silently drops an entire rule and the spec still reports green — contradicting the module's "never silently kept or dropped" headline

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   high
Surface:    plugins/design-control/src/design-language/schema.ts:127-137 (RULE_HEADING_RE match-or-ignore), schema.ts:32 (`RULE_HEADING_RE = /^rule:\s*(.*)$/`)

A rule heading that near-misses the convention is treated as an ordinary section heading, which **resets `current` and silently discards the entire rule plus all of its fields** — with zero findings, and `ok: true` if any other valid rule exists. Empirically verified by executing `parseDesignSpec` against `### Rule: masthead` (capitalized) and `### rule fine-but-no-colon` (missing colon) alongside one valid rule: result was `findings: []`, `rules: ["real"]`, `ok: true`. Two whole rules the author believes exist vanish from the parsed spec, and the gate prints "spec green — 0 findings". Contrast with the field level, where the diff explicitly builds an `unknown-field` typo guard and tasks.md (line "invalid rules become findings, never silently kept or dropped") claims silent drops can't happen — the guard exists one structural level down but not at the level that loses the most content per miss.

Blast radius: this is the gate every draft must pass before presentation, and its consumers act on the green verdict unattended — the SKILL.md procedure (step 4→5) presents a green spec to the operator as complete, and downstream referee/implementation steps treat the parsed rule set as the design language. A capitalized `Rule:` is among the most natural hand-authoring variations (sentence-case headings are the markdown default idiom), so the wrong outcome is reached by default and nothing in the artifact corrects it: the missing rule produces no finding, no skipped-note, no count discrepancy unless the operator hand-counts rules against the output's `N rule(s)`. Fix: add a near-miss detector — a heading whose text matches `rule` case-insensitively or `rule\b` without a colon (e.g. `/^rule\b/i`) but fails the strict form gets a `malformed-rule-heading` (or new `suspicious-rule-heading`) finding, mirroring the `unknown-field` allowlist philosophy stated in the module's own doc comment (schema.ts header: "silently dropping a misspelled `example:` would otherwise fabricate a missing-example rejection with no visible cause" — the identical argument applies to headings, with bigger loss).

### A curly-apostrophe `don’t:` field is silently inert — guidance vanishes with no finding when a `do:` is also present

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:34 (`FIELD_BULLET_RE = /^[-*]\s+([a-z][a-z']*)\s*:\s*(.*)$/`)

`FIELD_BULLET_RE`'s key character class admits only the ASCII apostrophe (`[a-z']`). The Unicode right single quotation mark `’` — what macOS smart-quotes, most prose editors, and copy-paste from any rendered document produce — fails the regex entirely, so `- don’t: never raw hex` is classified as inert prose: it doesn't reach the `unknown-field` typo guard (that guard only fires when the bullet *matches* the field shape with an unknown key). Empirically verified: a rule with `- do: keep ink` and `- don’t: never raw hex` (curly) parses with `findings: []` and `donts: []` — the prohibition silently disappears from the spec. Only when the curly `don’t` is the rule's *sole* guidance does a finding appear (`missing-guidance`), and even then the cause is invisible.

Blast radius: the spec is explicitly a hand-authorable prose artifact, so smart-quote substitution is a when-not-if input, and the lost content is specifically the *don't* side — the prohibitions that exist to stop an unattended implementation agent from doing the wrong thing. The check stays green, so nothing prompts a re-read. The same root behavior (non-matching line → inert) is by design for capitalized prose bullets, but `don’t`/`don't` homoglyph confusion is not an authoring choice — it's an editor artifact. Fix: widen the key class to accept `’` and normalize to `don't` before the `isKnownKey` check (one-line: `key.replace(/’/g, "'")`), or add `don’t` to the recognized-then-normalized set; a test pinning the curly form belongs in the corpus.

### Quoted attribute selectors are unlinkable — string-stripping rewrites the source prelude so the liveness check fabricates a dead-link on a live selector

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:46-73 (stripCommentsAndStrings strips string CONTENTS), :117-137 (cssDefinesSelector matches against the stripped prelude)

`stripCommentsAndStrings` deliberately empties string literals while keeping delimiters, and `collectSelectorPreludes` runs on that stripped text — so a source rule `input[type="text"] { … }` yields the prelude `input[type=""]`. No spec link can match it: verified empirically that `cssDefinesSelector` returns `false` for both the quoted query `input[type="text"]` and the unquoted `input[type=text]` against that source. Any rule anchored to a quoted attribute selector (`[type="checkbox"]`, `[data-state="open"]`, `[aria-expanded="true"]` — common anchors for exactly the component-kind rules this schema defines) is reported `dead-link-selector` even though the selector is live in the file. The module's own header promises skipped scope is "never fabricated into a dead-link verdict" — this path fabricates one inside the validated scope.

Blast radius: a hard exit-1 wall, but a *visible* one — the operator sees the finding, just gets told a true link is dead. Per SKILL.md step 4 the operator must "fix the link" or "update the rule" and is forbidden to delete the rule; neither remedy exists for this class, so the realistic outcome is re-anchoring to a class selector or a confused push-back, not silent corruption — hence medium rather than high. Fix options: strip strings only when scanning *declaration* text (the prelude/declaration boundary is already tracked via `{`/`}`/`;`), or strip string contents from the *query* with the same function before comparing so both sides normalize identically (`stripCommentsAndStrings(selector)`), which preserves the `content: ".ghost"` protections the tests pin.

### "Defined in source" is satisfied by a selector that only appears inside `:not(...)` or as a non-subject compound — liveness over-approximates definition

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:117-137 (cssDefinesSelector substring-in-prelude match)

The implemented predicate is "appears ident-boundary exact inside some selector prelude," which is weaker than the documented promise ("the selector must be **defined in that author-written CSS source**", SKILL.md line 47; tasks.md "selector/class must be *defined in author-written source*"). Verified empirically: `cssDefinesSelector('.real:not(.ghost) { … }', '.ghost')` returns `true` — a class that exists *only as an exclusion* in someone else's rule counts as a live anchor. The same holds for any appearance in `:is()`/`:where()`/combinator position. A design rule anchored to such a selector passes the gate while no styling for it exists, which is precisely the rot ("the spec cannot quietly drift into fiction") the liveness axis exists to catch.

Blast radius: low — it requires the spec author to link a selector that happens to appear only in a negation/functional-pseudo context, which is an unusual coincidence rather than a default path, and the failure direction is a missed rot signal (false green on one link), not a false refusal or data loss. The module's internal doc comment honestly describes the mechanism, so a maintainer reading the code isn't misled — only the outward-facing promise is slightly stronger than the check. Fix when worth it: exclude the contents of functional pseudo-class parentheses from the matchable prelude text the same way at-rule preludes are excluded (the paren-tracking is a small extension of the existing state machine), or soften the SKILL.md/tasks.md wording to "appears in a selector of."

### A duplicate rule heading's entire body is silently ignored — including suppression of the unknown-field typo guard inside it

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:155-163 (duplicate-rule-id branch leaves `current` undefined), :176-178 (fields skipped when `current === undefined`)

On a `duplicate-rule-id` hit the parser emits the finding but leaves `current` unset, so every field bullet under the duplicate heading is dropped without inspection — verified empirically that a duplicate section containing both a misspelled `- exmaple:` and a second `- css:` link produces only `["duplicate-rule-id"]`: the typo guard and the extra link are invisible. The likely authoring intent behind a duplicate id is a copy-paste meant to *extend or replace* the first rule; the author sees one finding, renames the id, and only then discovers the next wave of findings the section was carrying. Same wave-revelation shape exists at the compose layer (check-spec-file.ts:36-39): liveness runs only over `parsed.spec.rules`, which excludes structurally invalid rules, so a rule with a missing example *and* a dead css link reports the dead link only after the example is fixed.

Blast radius: low — every path still ends at a non-green verdict (the duplicate finding itself gates exit 1), so nothing wrong ships; the cost is extra fix-rerun round-trips and a momentarily misleading "1 finding" count, not a wrong outcome. Fix: parse the duplicate section into a throwaway `RawRuleSection` (so its field-level findings still surface, attributed to the duplicate heading's line) while continuing to exclude it from `spec.rules`; optionally run liveness over structurally invalid sections' parsed `cssLinks` too, since the two axes are independent.

---

**Summary for triage:** 5 findings, 0 blocking, 1 high. The high finding (claude-01) and the first medium (claude-02) share a root shape — the parser's "non-matching line is inert prose" stance has no near-miss detection above the field-key level, so the artifact's own headline guarantee ("never silently kept or dropped", tasks.md) holds only for one of the three structural levels; both were confirmed by executing the shipped module, not by reading alone. Claude-03 is a verified false-positive class in the liveness gate (quoted attribute selectors are unlinkable). All five reproduce with one-line probes against `parseDesignSpec`/`cssDefinesSelector`, so RED-first regression tests are cheap for each.
