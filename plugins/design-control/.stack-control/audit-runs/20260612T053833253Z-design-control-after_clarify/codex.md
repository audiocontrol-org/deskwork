### Trailing whitespace after a css path can create an empty selector link

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:192-219; plugins/design-control/src/design-language/link-liveness.ts:259-261

`recordField` only treats a `css:` value as missing its selector when `value.search(/\s/)` returns `-1`. If the author writes `- css: styles.ts   ` or `- css: studio.css   `, the first whitespace exists, so the parser records `{ path: "styles.ts", selector: "" }` at lines 216-219 instead of emitting `malformed-css-link`. That also makes `validateSection` consider the rule to have a css link because `section.cssLinks.length > 0`.

The blast radius is medium because this can become a silent green in the non-CSS path: `checkCssLinkLiveness` skips non-`.css` targets before validating selector content at lines 259-261, and skipped links do not fail the file check. A rule with `kind`, `example`, `do`, and only `css: styles.ts   ` can therefore pass schema and liveness with an empty selector, despite the documented `css: <path> <selector>` contract. The reasonable fix is to compute `const selector = value.slice(spaceAt).trim()` and reject it as `malformed-css-link` when empty, with tests for both `.css` and skipped non-CSS targets carrying trailing whitespace but no selector.
