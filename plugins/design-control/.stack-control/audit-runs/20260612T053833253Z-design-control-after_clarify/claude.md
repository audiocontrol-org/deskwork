Probes confirmed and the audit log shows none of these classes previously triaged. Cleaning up the probe file is done. Here is my report.

---

### AUDIT-BARRAGE-claude-01 — Escape-extended idents are treated as ident boundaries, so a query goes false-green against an escaped selector that merely starts with it

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:196-221, plugins/design-control/src/design-language/selector-canon.ts:32-34

The boundary check in `cssDefinesSelector` accepts a hit when the characters adjacent to the match are not in `[A-Za-z0-9_-]` (`isIdentChar`, selector-canon.ts:32-34). But in CSS a backslash escape *extends* the ident: `.foo\:bar {}` defines the single class `foo:bar` (the Tailwind-variant spelling), not `.foo`. Verified by executing the shipped module: `cssDefinesSelector('.foo\\:bar { color: red }', '.foo')` → `true`, and `cssDefinesSelector('.btn\\@2x { }', '.btn')` → `true`, while the unescaped control `.foox` correctly rejects. So a rule anchored to `.foo` goes green against a file in which `.foo` has no styling at all — a silent false green, the exact failure direction this gate exists to prevent, and one that would survive every fix in the AUDIT-17/-18/round-4 canonicalization series (the `\` genuinely is a non-ident character to the current test). The approximations list in selector-canon.ts:14-28 states the quoted-value escape case ("kept verbatim, not decoded") but says nothing about escapes in selector idents, so the gap is unstated as well as real.

Blast radius: medium. Escaped idents are rare in hand-written CSS but routine in compiled utility-framework output — which, per my -04 below, *is* inside the validated scope whenever its path ends `.css`. An author linking `.btn` against a file that only defines escaped variants gets a green verdict and the spec quietly rots into fiction. Reasonable fix: treat `\` as ident-extending on both sides of the boundary test (reject when `before === '\\'` is mid-escape or when the character after the match is `\\`), or decode/normalize ident escapes during canonicalization; either way pin with RED tests for `.foo` vs `.foo\:bar` and `.btn` vs `.btn\@2x`.

### AUDIT-BARRAGE-claude-02 — Namespaced attribute selectors bypass the entire canonicalize/blank pipeline, reopening the name-leak and value-leak classes for `[ns|attr]` spellings

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/selector-canon.ts:88-89 (`ATTRIBUTE_SELECTOR` name class lacks `|`), :126-140 (`blankAttributeValues` / `blankAttributeNames` key on the non-namespaced shape)

`ATTRIBUTE_SELECTOR` admits only `[A-Za-z0-9_-]+` as the attribute name, so `[xlink|href]` and `[svg|href="x"]` never canonicalize — and the two blanking helpers, which also key on that name shape, leave them live in the haystack. Verified by execution: `cssDefinesSelector('[xlink|href] { }', 'href')` → `true` (attribute *name* satisfies a type-selector query — the exact class AUDIT-round4-claude-01 just closed for `[ghost]`, whose control correctly returns `false`), and `cssDefinesSelector('[svg|href="x"] { }', 'x')` → `true` (attribute *value* satisfies a bare query — the AUDIT-20260611-18-adjacent class closed for non-namespaced values, control `[data-icon=".ghost"]` correctly `false`). The approximations note (selector-canon.ts:22-23) says namespaced attribute selectors are "left un-canonicalized (compared verbatim)", which reads as quote-style-only laxity; it does not state that they remain *matchable text* for queries that never named an attribute.

Blast radius: low. Namespaced attribute selectors essentially only appear in SVG-adjacent CSS, and the colliding query must be a bare ident echoing the attribute name or value — a narrow intersection. But the failure direction is a silent false green, and the fix is mechanical: admit `(?:[A-Za-z0-9_-]+|\*)?\|` as an optional name prefix in `ATTRIBUTE_SELECTOR` and in both blanking regexes, with RED pins for the two probes above. At minimum, the approximations list should state that namespaced forms currently evade the exclusion-is-not-styling guarantees.

### AUDIT-BARRAGE-claude-03 — A bare `###` (valid CommonMark empty ATX heading) does not terminate a rule section — following bullets silently merge into the preceding rule with zero findings

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:56 (`HEADING_RE = /^#{1,6}\s+(.*)$/`), :333-379 (heading branch is the only place `current` resets)

`HEADING_RE` requires whitespace plus text after the hashes, but CommonMark explicitly permits an empty ATX heading (`###` with nothing after it). A bare `###` therefore matches no branch — not a heading, not a bullet, not an attempt — and falls through as inert prose *without resetting `current`*. Verified by execution: in a spec reading `### rule: alpha` … `###` … `- css: stray.css .stray`, the stray link lands in **alpha's** `cssLinks` (`[{a.css .alpha}, {stray.css .stray}]`) with `findings: []` — the "merge its bullets into the preceding rule's section" outcome the module's own header (schema.ts:36-42) names as the failure this parser must never produce, here completely silent. The behavior is also internally inconsistent: `### ###` (hashes-only *text*, stripped to empty by `stripAtxClosingSequence`) DOES reset the section (verified: alpha keeps only its own link), so two spellings CommonMark renders identically diverge in section semantics.

Blast radius: low. A bare `###` as a visual separator is an uncommon authoring shape, and the wrong outcome needs content after it inside the same gap. But the direction is the bad one — wrong attribution with zero findings, and liveness then validates the stray link under the wrong rule, potentially flipping a should-fail rule green. Fix: let an empty ATX heading (`/^#{1,6}$/` after trimming, plus the `### ###` form already handled) reset `current` like any heading; pin both spellings with a regression test asserting the stray bullet does not attach to the preceding rule.

### AUDIT-BARRAGE-claude-04 — Doc drift: "utility-framework / CSS-Modules links are recorded as skipped" vs the extension-only skip predicate actually shipped

Finding-ID: AUDIT-BARRAGE-claude-04
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/link-liveness.ts:9-13 vs :259; plugins/design-control/skills/translate-design-language/SKILL.md:46-50; plugins/design-control/src/design-language/check-spec-file.ts:84

The module doc states "Utility-framework, CSS-in-JS, and hashed CSS-Modules links do not establish link-liveness — they are recorded as `skipped`", and SKILL.md repeats it ("Non-CSS targets (CSS-in-JS, utility frameworks, CSS-Modules) are reported as unchecked notes"). The only skip predicate in the code is `!link.path.toLowerCase().endsWith('.css')` (link-liveness.ts:259, reason `'non-css-target'`). But utility-framework output and compiled CSS-Modules are routinely `.css` files — a link to `dist/tailwind.css .p-4` is fully *validated*, not skipped, contradicting both docs. The conflation matters because the docs frame skipped links as "visible scope, not silent coverage" (SKILL.md:94): an operator told their utility-framework link was skipped-but-visible instead receives a real verdict from a matcher whose ident-boundary approximations are weakest exactly there (see my -01: escaped variant classes false-green).

Blast radius: low. The behavior itself is defensible — checking a real `.css` file is at worst over-eager — and a careful reader of the CLI note ("non-CSS target") can reconstruct the actual mechanism. The cost is a contract statement that doesn't match the predicate, on the surface (scope statements) this feature has repeatedly treated as load-bearing (AUDIT-20260611-38's rationale: "the scope … is stated rather than discovered"). Fix is wording: both docs should say the validated scope is "any link whose path ends `.css`" and that utility-framework/CSS-Modules *compiled* `.css` outputs are therefore checked as ordinary CSS (with the escape caveat), while only non-`.css` paths are skipped.

### AUDIT-BARRAGE-claude-05 — `dead-link-file` / `dead-link-selector` findings carry no source line although the bullet's line is known at parse time

Finding-ID: AUDIT-BARRAGE-claude-05
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:216-219, plugins/design-control/src/design-language/types.ts:34-37, plugins/design-control/src/design-language/link-liveness.ts:268-281

`recordField` receives the 1-based line of every `css:` bullet and uses it for `empty-field` and `malformed-css-link` findings, but the `CssLink` it pushes (schema.ts:216-219) drops the line, so by the time liveness emits `dead-link-file` / `dead-link-selector` (link-liveness.ts:268-281) the optional `line` field of `DesignSpecFinding` — documented "1-based markdown source line, when known" — is silently absent for the entire axis-B taxonomy. The information is knowable; it's discarded at the seam. For a rule with several `css:` links to the same dead-ish file, the finding names only `ruleId` + path + selector and the author has to grep the spec to find which bullet to edit.

Blast radius: low — purely a diagnostic-quality gap; the finding is loud and attributable, just less precise than the schema axis right next to it. Fix: add an optional `line` to `CssLink` (or carry it on `RuleScopedCssLink`), populate it in `recordField`, and thread it into both dead-link finding constructors; one assertion in the liveness suite pins it.

### AUDIT-BARRAGE-claude-06 — schema.test.ts is 805 lines, past the project's stated 300–500 line cap

Finding-ID: AUDIT-BARRAGE-claude-06
Status:     open
Severity:   low
Surface:    plugins/design-control/src/__tests__/design-language/schema.test.ts (805 lines)

The project's own conventions (root and plugin CLAUDE.md: "files < 300–500 lines") cap code files at 500 lines; `schema.test.ts` ships at 805, having absorbed four rounds of barrage regression pins (heading guards, fences, bullets, closing hashes) on top of the base suite. None of the other new files breach the cap (schema.ts 433, link-liveness.test.ts 486 is at the line). Verified by `wc -l`.

Blast radius: low — no behavioral consequence; the cost is the compounding-over-time kind the cap exists for, and this file is precisely the one every future barrage round appends to, so it only grows. A natural split mirrors the parse phases the file already groups: heading/declaration-attempt pins in one file, field/bullet/fence inertness pins in another, keeping `describe` blocks intact.

---

**Summary for triage:** 6 findings, 0 blocking, 0 high, 1 medium. The medium (claude-01) is this round's silent-green: the ident-boundary test doesn't know CSS escapes extend idents, so `.foo` self-certifies against `.foo\:bar {}` — confirmed by executing the shipped module, and orthogonal to every fix in the round-4 series. Claude-02 (namespaced attribute selectors evade both blanking passes) reopens the just-closed name/value-leak classes in a rarer spelling; claude-03 is a confirmed silent merge through a valid CommonMark empty heading, inconsistent with the handled `### ###` form; claude-04/-05/-06 are contract-wording, diagnostic-precision, and file-cap hygiene. Checked and clean: the round-4 fixes all hold as committed (closing-hash stripping including the glued-hash and hashes-only cases, `+`-bullet parity, keyframes prelude exclusion, leading-discriminator rejection of `.header`/`#header` for type queries), the throwaway-section single-pass design has no finding-wave regressions I could construct, fence open/close handles CRLF and indented closers, the bin shim's tsconfig pin matches its two siblings, and the machine-rooted-path rejection is consistent across schema, liveness throw, SKILL.md, and types. All three behavioral findings were confirmed by running the shipped modules against probe fixtures (probe file removed afterward), so RED-first regression tests are cheap for each.
