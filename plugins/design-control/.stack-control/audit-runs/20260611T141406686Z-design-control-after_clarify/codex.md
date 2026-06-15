### Closing ATX hashes become part of the rule id

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:53-54, plugins/design-control/src/design-language/schema.ts:310-325

`HEADING_RE` captures the raw text after the opening hashes, and `parseDesignSpec` immediately feeds `heading[1].trim()` into `RULE_HEADING_RE`. That means a valid Markdown ATX heading with a closing sequence, such as `### rule: ink-primary ###`, parses as rule id `ink-primary ###` instead of `ink-primary`. The tests only cover headings without closing hashes, so this common Markdown spelling is not pinned.

Blast radius is medium: the spec can go green while downstream consumers of `spec.rules` receive the wrong stable rule id, and the duplicate-id guard can be bypassed by mixing `### rule: ink` with `### rule: ink ###`. A reasonable correction is to normalize ATX heading text before rule parsing by stripping a valid closing hash sequence per Markdown rules, then add regression coverage for both id extraction and duplicate detection.
