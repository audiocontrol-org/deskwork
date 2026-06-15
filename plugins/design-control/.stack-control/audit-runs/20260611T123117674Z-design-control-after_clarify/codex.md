### Schema-invalid rules never reach the link-liveness pass

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    plugins/design-control/src/design-language/check-spec-file.ts:33-35; plugins/design-control/src/design-language/schema.ts:226-228

`checkDesignSpecFile` parses the markdown, then runs liveness only against `parsed.spec` (`check-spec-file.ts:33-35`). But `parseDesignSpec` filters `spec.rules` down to structurally valid rules only (`schema.ts:226-228`). That means a single rule with both a schema defect and a dead CSS selector reports only the schema defect; its `css:` link is silently excluded from the liveness axis until the operator fixes the schema and reruns.

Blast radius is medium: the checker still fails the spec, so it does not ship a green verdict for that broken rule, but it violates the stated combined gate and creates incremental, rerun-dependent discovery. A reasonable fix is to preserve raw rule sections or parsed CSS links for all rule headings, then run liveness for any syntactically usable `css:` field even when the rule also has schema findings.

### The audited diff introduces explicit deferral language into the skill and checker contract

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   low
Surface:    plugins/design-control/skills/translate-design-language/SKILL.md:44-48,97-98; plugins/design-control/src/design-language/check-spec-file.ts:68-71; plugins/design-control/specs/001-design-control/tasks.md:176-191

The diff repeatedly encodes “not validated in v1” / “named-deferred” / “out of v1 scope” language in the operator-facing skill, CLI output, and workplan. The audit prompt’s hard constraint rejects deferral phrases because they become bug-factory commitments in unattended workflows; here they are not just comments, they appear in the user-facing validation output (`check-spec-file.ts:68-71`) and in the skill’s instructions about what the operator may present (`SKILL.md:80-82`).

Blast radius is low because the scope boundary is visible and intentional, and the code does not hide skipped links. The operational risk is documentation discipline: agents may normalize presenting partially unchecked specs as “green” because the deferral is built into the happy path. A reasonable fix is to replace temporal deferral phrasing with a stable capability statement, such as “non-CSS targets are reported as unchecked notes and do not establish link-liveness.”
