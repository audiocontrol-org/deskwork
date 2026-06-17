---
slug: 025-unskippable-workflow-protocol
targetVersion: ""
---

# Audit log — 025-unskippable-workflow-protocol

## 2026-06-16 — audit-barrage lift (20260616T232510951Z-025-unskippable-workflow-protocol-phase-1)

### AUDIT-20260616-01 — Fixture silently inherits a digit-led phase-id constraint from PHASE_HEADER_RE, undocumented on FixturePhase

Finding-ID: AUDIT-20260616-01
Status:     open
Severity:   medium
Per-lane:   claude=medium
Decision:   single-model (gate-counted medium)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:31-35 (FixturePhase.id) + 88-90 (renderTasks) coupled to src/govern/incremental-audit.ts:28 (PHASE_HEADER_RE)

`renderTasks` emits each header as `` `## Phase ${phase.id}: fixture phase ${phase.id}` `` (line 89), and `governedPathsFor` (lines 65-74) re-parses that text with `parsePhases`, whose `PHASE_HEADER_RE = /^##\s+Phase\s+([0-9][0-9A-Za-z.]*)\b.*$/` requires the id to be **digit-led**. A test author who passes a non-numeric phase id — `{ id: 'setup', ... }` or `{ id: 'a', ... }`, both natural choices — produces a header (`## Phase setup: …`) that the regex does **not** match. `parsePhases` then finds zero phases for that id, so `governedPathsFor('setup')` throws `phase 'setup' not in fixture tasks.md`, and worse, `checkpointPhase('setup')` will happily write a checkpoint keyed `phase-setup` (lines 81-92) that the resolver-under-test can never rediscover. The `FixturePhase.id` doc-comment (line 32) says only "its id" — nothing signals the constraint.

Blast radius: this is test infrastructure, so the consequence is a confusing/misleading test failure rather than a shipped defect — but the failure points the author at "phase not in tasks.md" when the real cause is "id wasn't digit-led," which costs debugging time and could mask a genuine resolver bug. The current two consumers use `'1'/'2'/'3'` so they're unaffected; the trap is latent for the next author. Fix: document the digit-led requirement on the `id` field, or assert `/^[0-9]/.test(phase.id)` in `makeUnskippableFixture` with a message that names the grammar.

---

### AUDIT-20260616-02 — FixturePhase path contract ("must contain `/`, no `:`") is promised in a comment but never enforced; violation fails with a misdirecting message

Finding-ID: AUDIT-20260616-02
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:33 (doc) + 65-74 (governedPathsFor) coupled to src/govern/incremental-audit.ts:73-90 (extractScopedPaths)

The `files` doc-comment (line 33) states paths "must contain `/`, no `:`", but `makeUnskippableFixture` validates neither. A path lacking `/` is silently skipped by `extractScopedPaths` (line 77: `if (... !raw.includes('/')) continue`); a path bearing a residual `:` is dropped at line 86. Either drop makes the affected phase parse to `files: []`, so `governedPathsFor` throws `phase '<id>' has no governed files` (lines 70-72) — a message that misdirects the author to "I forgot to add files" when the real cause is a malformed path. The contract is load-bearing (it's what keeps the fingerprint scope non-empty), so silently relying on a doc-comment is fragile.

Blast radius: test-only, fail-loud, so low — but the loud failure names the wrong cause. A two-line guard in `makeUnskippableFixture` (reject any `file.path` not matching the documented shape, with a message quoting the offending path and the rule) converts a misdirecting failure into a self-explaining one and makes the contract executable rather than aspirational.

---

### AUDIT-20260616-03 — research.md records hard line-number anchors into code the same feature is about to refactor — they rot on the first extraction

Finding-ID: AUDIT-20260616-03
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    specs/025-unskippable-workflow-protocol/research.md:114-160 (Implementation anchors section)

The anchors pin precise line numbers — `govern.ts:401`, `govern.ts:412`, `govern.ts:439`, `govern.ts:767`, `gate-eval.ts:105`, `workflow-types.ts:44` — and in the same breath declare those very symbols "TO EXTRACT" into a new `src/govern/phase-checkpoint-status.ts` (line 130-133) and add a `case` to the `gate-eval.ts` switch (line 153). The moment T-series extraction/insertion lands, every one of those line numbers is wrong. The project's own documentation rule warns against rot-prone specifics; though it scopes that to adopter-facing docs and this is an internal research artifact (hence low, not higher), a future agent reading these anchors after the refactor will be sent to the wrong lines.

Blast radius: low — internal doc, and the symbol names remain searchable even when the line numbers drift. Recommend anchoring by symbol name only (`resolvePhaseCheckpointStatuses` in `govern.ts`) and dropping the `:NNN` suffixes, or explicitly stamping the section "line numbers point-in-time as of 3dc01a42, pre-extraction."

---

### AUDIT-20260616-04 — editPhaseFile performs no phase-membership check and its "goes stale" promise is conditional on content actually differing

Finding-ID: AUDIT-20260616-04
Status:     open
Severity:   low
Per-lane:   claude=low
Decision:   single-model (gate-counted low)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts:93 (editPhaseFile) + 38 (doc-comment)

`editPhaseFile: (path, content) => base.write(path, content)` (line 93) is documented as "Overwrite a phase file's content → its checkpoint fingerprint goes stale" (line 38). Two unstated preconditions make that promise leaky: (a) it accepts any `path`, with no check that the path is actually a governed file of some checkpointed phase — a typo'd path silently writes a stray file and no fingerprint changes, so a staleness-asserting test fails for an invisible reason; (b) if `content` equals the file's current content, the fingerprint is unchanged and the phase stays *current*, contradicting the doc's unconditional "goes stale."

Blast radius: low and test-only; the one current consumer (`graduate-gate.test.ts`, the "editing phase 2 … stale" case) passes a real path with genuinely different content, so it's correct today. The risk is the next author trusting the doc-comment literally. A cheap hardening: assert the target path resolves to a known phase file and (optionally) that the new content differs, failing loud otherwise.

---

### AUDIT-20260616-05 — Checked-clean: fixture/parser grammar match, fail-loud guards, and fingerprint coupling are sound

Finding-ID: AUDIT-20260616-05
Status:     open
Severity:   informational
Per-lane:   claude=informational
Decision:   single-model (gate-counted informational)
Surface:    src/__tests__/fixtures/workflow/unskippable-fixtures.ts (whole file)

Items I checked that came back clean: (1) the rendered header `## Phase 1: fixture phase 1` **does** match `PHASE_HEADER_RE` for digit-led ids (the `.*$` swallows the `: title`), so the common path parses correctly — my initial suspicion of a grammar mismatch was unfounded. (2) `governedPathsFor` correctly mirrors real govern by deriving scope from the *parsed* tasks.md rather than the raw input, so the fixture's fingerprint matches what `govern --phase` would compute. (3) The empty-scope guards are present and fail loud (lines 67-72), consistent with `computeScopeFingerprint`'s throw-on-empty and FR-004. (4) `checkpointPhase` keys `checkpoint`/`auditLogSection` as `phase-<id>` exactly as the 021 shape requires, so the staleness test's stale-detection is exercising the real currency predicate, not a fixture-local shortcut. The fixture is structurally correct for its documented (digit-led, slash-bearing) usage; my findings above are all robustness/documentation hardening, not correctness defects in the current consumers.

---

These findings are the audit deliverable — the diff under review is test/doc infrastructure with no shipped-product surface, so all severities are calibrated accordingly (one `medium` latent footgun, the rest `low`/`informational`). No `blocking` or `high` findings: the fixture is correct for its current consumers, and the RED tests that depend on it (`composed-record.test.ts`, `graduate-gate.test.ts`) use only digit-led ids and well-formed paths.

### AUDIT-20260616-06 — Speckit wrapper target points at a non-existent payload surface

Finding-ID: AUDIT-20260616-06
Status:     open
Severity:   high
Per-lane:   codex=high
Decision:   single-model (gate-counted high)
Surface:    specs/025-unskippable-workflow-protocol/research.md:155-157

The implementation anchor says to inject wrapper precondition blocks into `.claude/skills/speckit-{specify,plan,tasks,implement}/SKILL.md`, but this plugin tree exposes stack-control skill payloads under `skills/*/SKILL.md`; the audited repository does not have that `.claude/skills/speckit-*` surface. An unattended implementer following this anchor will naturally patch or create the wrong tree, leaving the active Codex/plugin skills unprotected.

The blast radius is high because US4’s direct backend-skill refusal is one of the feature’s core enforcement promises. A reasonable fix is to name the actual installed/vendored backend skill locations this plugin ships or consumes, and define how those wrappers are discovered during install/runtime instead of anchoring to a Claude-only path.

### AUDIT-20260616-07 — Shortcut audit excludes the wrapper surface it must enforce

Finding-ID: AUDIT-20260616-07
Status:     open
Severity:   medium
Per-lane:   codex=medium
Decision:   single-model (gate-counted medium)
Surface:    specs/025-unskippable-workflow-protocol/research.md:155-161

The research adds a wrapper/precondition surface for backend Speckit skills at lines 155-157, but the no-shortcuts audit at line 161 is scoped only to `skills/*/SKILL.md`. That means the audit contract does not cover the newly introduced wrapper blocks or backend Speckit skill bodies, even though those are exactly where a direct backend invocation could expose operator-facing shortcut language.

The blast radius is medium: the core graduate gate can still be implemented correctly, but the enforcement audit will give a false clean result for part of the protocol surface. The fix is to define the audit’s input set as data that includes both stack-control skills and the wrapped backend Speckit skill payloads, with tests proving both classes are scanned.
