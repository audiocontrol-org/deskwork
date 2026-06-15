I walked the full diff against `0391a0c0` — the design-language module (`schema.ts`, `link-liveness.ts`, `selector-canon.ts`, `rule-attempt.ts`, `check-spec-file.ts`, `types.ts`), the CLI/shim layer, the SKILL.md, the new test corpora, and the docs/bookkeeping changes. I cross-checked the audit-log to avoid re-reporting the 34 triaged findings (the committed `.stack-control/audit-runs/` dirs are a prior explicit disposition in `da2ed12c`; the skipped-non-CSS-scope stance was triaged as AUDIT-21), and confirmed every candidate empirically by executing the shipped module against fixtures (since removed). Four findings, none blocking; one is the silent-green direction.

### Liveness ignores the leading simple-selector discriminator — a dot-omission typo (`btn-primary` for `.btn-primary`) is guaranteed green, and type-selector queries match class/id/attribute-name occurrences

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:139-159 (`cssDefinesSelector` boundary check at :154); plugins/design-control/src/design-language/selector-canon.ts:27-29 (`isIdentChar`)

The match acceptance at `link-liveness.ts:154` checks only that the characters flanking the substring hit are not ident characters — it never checks that the *kind* of simple selector matches. `.`, `#`, and `[` are all non-ident, so a query that begins with a bare ident (a type selector — or, far more likely, a class selector whose author dropped the leading dot) is satisfied by a class, an id, or a bare attribute *name* in source. Verified empirically against the shipped module: query `btn-primary` vs source `.btn-primary { }` → `true`; query `header` vs `.header { }` → `true`; query `header` vs `#header { }` → `true`; query `ghost` vs `[ghost] { }` → `true` (the AUDIT-round2 value-blanking in `blankAttributeValues` covers attribute *values* only — the attribute *name* position is unguarded, since `[ghost]` carries no value to blank). The schema side compounds this: `recordField` (schema.ts:168-198) applies no shape validation to the selector remainder of `css: <path> <selector>`, so `css: studio.css btn-primary` parses cleanly and sails through liveness green.

Blast radius: medium — this is the silent-green direction, the worst direction in this module by its own stated philosophy, and the dot-omission trigger is *self-pairing*: dropping the `.` from any real class name guarantees the bare ident exists in a prelude, so every such typo is green by construction, with no finding, no note, and no count discrepancy. The shipped artifact then tells an unattended downstream consumer that `btn-primary` is a live selector when it selects nothing in any browser. It stops short of high because the defective selector text remains human-visible in the spec and the surrounding link (path, neighboring rules) is still mostly right. Fix: when the canonical query begins with an ident character, reject a match whose preceding haystack character is `.` or `#`; and in the no-`[`-in-query mode, blank attribute *names* as well as values (`[ghost]` → `[]`), mirroring the existing `blankAttributeValues` pass. RED tests: the four probes above, plus the sanity directions (`.btn` vs `.btn` stays green; `ghost` vs `.real[data-ghost]` stays dead — both verified correct today).

### CSS-nesting sources fail composed-selector queries — preludes are matched flat, and the nesting approximation is undocumented

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:69-109 (`collectSelectorPreludes`); module doc :18-33; plugins/design-control/skills/translate-design-language/SKILL.md:44-48

`collectSelectorPreludes` collects each prelude as flat text at its own nesting depth and never composes it with its ancestors, so native CSS nesting — now ordinary authoring (browser-native, Sass default, Prettier-formatted) — only matches leaf-shaped queries. Verified empirically: query `.btn .icon` vs source `.btn { .icon { } }` → dead, and query `.btn:hover` vs source `.btn { &:hover { } }` → dead, while both selectors are live in the file; devtools and stylelint render exactly the composed forms an author would copy into the spec. The module's doc comment carefully states the at-rule descent rule and the accepted approximations list in `selector-canon.ts:14-23`, but neither mentions nesting — the contract reads as if any selector "defined in the file" matches.

Blast radius: low — the failure direction is a loud exit-1 false refusal with an actionable message, and the author can converge by anchoring the rule to the leaf selector (`.icon`), which does match (verified: leaf queries pass even against `&`-joined preludes). The cost is a confusing reword round-trip plus a contract that quietly under-delivers on nested codebases. Minimal fix: add nesting to the stated approximations in both the module doc and SKILL.md ("link the leaf selector for nested rules"); fuller fix: maintain a prelude ancestor stack in `collectSelectorPreludes` and emit composed preludes with `&` substitution, pinned by the two probes above as RED tests.

### `+`-marker field bullets are silently inert — the resulting missing-* findings misattribute the cause, the exact no-invisible-cause failure the module's own doc names

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:61 (`FIELD_BULLET_RE = /^[-*]\s+…/`), :91 (`BULLET_SHAPE_RE = /^[-*]\s/`)

CommonMark defines three bullet list markers — `-`, `*`, and `+` — but both bullet regexes admit only `-` and `*`. A rule authored with `+` bullets parses with every field dropped as inert prose: verified empirically, a complete rule (`+ kind:`, `+ css:`, `+ example:`, `+ do:`) returns `findings: [missing-kind, missing-css-link, missing-example, missing-guidance]` and zero rules. The verdict is loud, but every finding names a *false cause* — the author is told the rule "has no kind: field" while staring at one. This is precisely the failure shape the module's own header rules out for field keys (schema.ts:29-31: silently dropping a misspelled `example:` "would otherwise fabricate a missing-example rejection with no visible cause") and that the AUDIT-15/-31/-32 series killed for headings and declarations — one syntax level over, at the list-marker. The `+`-bullet lines also bypass the `unknown-field` typo guard and, on ≥4-space-indented lines, the `BULLET_SHAPE_RE` carve-out (schema.ts:302), so an indented `+ css:` bullet is treated as indented code.

Blast radius: low — always loud, never a silent wrong outcome; the cost is a baffling diagnostic and a guaranteed round-trip for authors (or formatters) that prefer `+` markers. Fix is one character in each class (`[-*+]`), plus corpus pins for a `+`-bulleted rule parsing identically to a `-`-bulleted one.

### Keyframe step selectors (`from` / `to` / `0%`) are collected as matchable preludes

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   informational
Surface:    plugins/design-control/src/design-language/link-liveness.ts:69-109 (`collectSelectorPreludes` descends into all at-rule blocks uniformly)

The at-rule descent that correctly makes `@media`-housed rules count also descends into `@keyframes`, whose inner blocks are step selectors, not element rules — so `from`/`to`/percentage preludes enter the matchable set. Verified empirically: query `from` vs `@keyframes spin { from { } to { } }` → `true`. Note this instance would survive the AUDIT-BARRAGE-claude-01 discriminator fix (the `from` prelude genuinely begins with a bare ident), so it's worth one exclusion line (`@keyframes` blocks contribute no preludes) whenever that fix lands.

Blast radius: effectively nil as-written — no plausible design-language rule anchors to `from`, `to`, or `0%` as a selector, so this is context for the prelude-collection contract rather than a defect a consumer would hit. Recorded so the scope of "selector prelude" is stated rather than discovered.

---

**Summary for triage:** 4 findings, 0 blocking, 0 high, 1 medium. The medium (claude-01) is the round's one silent-green: the boundary check validates *that* an ident sits at a selector boundary but never *which discriminator* introduces it, so every dropped-dot typo self-certifies green — the same unanchored-text root the AUDIT-17/-18/round-2 canonicalization series has been chipping at, one axis (selector-kind) over. Claude-02 and claude-03 are loud false-refusal hygiene with misleading or missing contract statements; claude-04 is scope context that should ride along with the claude-01 fix. All four were confirmed by executing the shipped module against fixtures, not by reading alone, so RED-first regression tests are cheap for each. Everything else I checked came back clean: the round-3 fixes hold as committed (fence inertness, line-attempt id-shape calibration, combinator normalization including `||` and the `~=` guard, drive-relative path rejection, tsconfig-pinned shims across all three bins), the tasks.md check-offs match the shipped behavior, and the committed audit-run artifacts follow the prior `da2ed12c` disposition.
