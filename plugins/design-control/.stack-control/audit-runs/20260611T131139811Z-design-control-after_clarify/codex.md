### Selector argument normalization makes distinct state selectors interchangeable

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/link-liveness.ts:157-180

`cssDefinesSelector` strips string contents and functional pseudo-class arguments from both the query and source prelude before matching. The comment explicitly states the consequence: a query for one quoted attribute value matches a source rule with a different value, and a full functional-pseudo selector can match a source rule with different arguments. That means `.chip[data-state="open"]` can be accepted when the CSS only defines `.chip[data-state="closed"]`, and `.real:not(.ghost)` can be accepted when only `.real:not(.other)` exists.

Blast radius is medium: this creates a false green for common component-state selectors, so the checker can say a design-language rule is linked to live CSS when the exact state anchor is absent. The user-facing skill still says the selector must be defined in the source, so a downstream agent will not know that state values are ignored. A reasonable correction is to keep string and functional arguments comparable in selector preludes while still excluding declaration strings such as `content: ".ghost"`.

### Absolute CSS paths can pass even though the spec contract says paths are relative

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/schema.ts:96-110; plugins/design-control/src/design-language/link-liveness.ts:211-217; plugins/design-control/skills/translate-design-language/SKILL.md:42-46

The skill contract says `css:` paths are relative to the spec file, but the parser accepts the first whitespace-free token without validating it, and liveness passes it directly to `resolve(baseDir, link.path)`. In Node, an absolute path ignores `baseDir`, so `css: /Users/.../studio.css .btn` can go green on the author’s machine while producing a nonportable design-language spec.

Blast radius is medium because deskwork artifacts are collection content, not machine-local state. A green spec with absolute local paths will mislead downstream consumers or fail outside the original checkout. The checker should reject absolute paths as malformed, and probably reject or consciously constrain parent traversal if the intended artifact boundary is the spec directory or collection root.

### Temporal scope wording still remains in the audited diff

Finding-ID: AUDIT-BARRAGE-codex-03
Status:     open
Severity:   low
Surface:    plugins/design-control/specs/001-design-control/tasks.md:176-191; plugins/design-control/src/design-language/schema.ts:15-18; plugins/design-control/src/design-language/link-liveness.ts:9-15; plugins/design-control/src/design-language/types.ts:42-45

The operator-facing skill and CLI text were rewritten to capability statements, but the workplan and design-language source comments still retain the temporal scope phrasing called out by the audit prompt’s hard constraint. The visible task record at `tasks.md:176-191` still carries that language several times, and source comments repeat the same framing in the schema, liveness, and shared type docs.

Blast radius is low because the runtime behavior is visible and the CLI now uses stable capability language. The issue is documentation discipline: future agents reading the workplan or comments can reintroduce the same phrasing into operator-facing surfaces. A reasonable correction is to use capability wording consistently, matching the skill and CLI text.
