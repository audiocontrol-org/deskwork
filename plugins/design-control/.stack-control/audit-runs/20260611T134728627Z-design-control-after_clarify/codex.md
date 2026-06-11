### Combinator spacing is not canonicalized, so equivalent CSS selectors can be reported dead

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/selector-canon.ts:179-191; plugins/design-control/src/design-language/link-liveness.ts:129-147

`cssDefinesSelector` compares the query and source prelude after `normalizeSelectorWhitespace`, but that normalizer only collapses whitespace and trims inside parentheses / around commas. It does not normalize optional whitespace around CSS combinators such as `>`, `+`, `~`, or `||`. CSS treats `.masthead>nav`, `.masthead > nav`, and `.masthead  >  nav` as the same selector, but this checker compares different strings and can emit `dead-link-selector` for a live selector if the spec and source use different formatter spacing.

Blast radius is low: the failure is visible and blocks presentation rather than producing a false green, but it is a realistic authoring trap for hand-written specs and formatted CSS. A reasonable correction is to canonicalize optional whitespace around non-descendant combinators in both query and haystack before the substring check, while preserving a single space for descendant combinators.

### Drive-relative Windows CSS paths slip past the portability guard

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   low
Surface:    plugins/design-control/src/design-language/schema.ts:69-73; plugins/design-control/src/design-language/schema.ts:122-150; plugins/design-control/src/design-language/types.ts:25-32

The type contract says machine-rooted drive-letter paths never enter `CssLink`, but `NON_PORTABLE_CSS_PATH_RE` only rejects drive-letter paths when the colon is followed by `/` or `\`. A path like `C:styles.css` is not caught, so `recordField` accepts it into `cssLinks`. On Windows that spelling is drive-relative and machine-contextual; on POSIX it can even resolve as a literal filename under the spec directory, producing a green result for a spec link that does not travel cleanly across platforms.

Blast radius is low because this is an uncommon spelling and the main absolute-path cases are covered. It is still a portability leak in the same boundary the schema claims to enforce. A reasonable correction is to reject any leading single-letter drive prefix (`^[A-Za-z]:`) and add a regression case for `css: C:styles.css .btn`.
