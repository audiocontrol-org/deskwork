---
name: translate-design-language
description: Draft or maintain the project's design-language spec — the hand-authorable markdown artifact that anchors visual identity (palette/type/spacing tokens + signature components, each rule linked to live CSS + ≥1 example). Hand-authoring is the default and needs NO engine; the optional /frontend-design accelerator drafts from approved wireframe intent and is judged by the same check-design-spec gate.
---

# /design-control:translate-design-language

Author or update the **design-language spec** for this project. The spec is the
visual-*letter* artifact of the design-control discipline: the durable home for
visual identity (the lo-fi wireframe carries UX *spirit* and is structurally
incapable of carrying visual detail). Every rule binds to reality — a live CSS
file + selector, ≥1 current example — so the spec cannot quietly drift into
fiction the way a mockup's incidental polish does.

> Per the plugin thesis (`DESIGN-DISCIPLINE-THESIS.md`): policy is enforced by
> a process, not a rule. "Each rule links to live CSS" is not a convention the
> author is trusted to follow — it is mechanically enforced by the
> `check-design-spec` gate (schema + static link-liveness), which every draft
> MUST pass before it may be presented.

## Spec convention (hand-authorable markdown)

One markdown file (conventionally `design-language.md` in the operator's chosen
design docs directory). Rules are declared under ATX headings, fields are
bullets with a closed key set:

```markdown
# Design language: <project>

## Palette

### rule: ink-primary
- kind: palette
- css: styles/studio.css .btn-primary
- example: dashboard compose button uses .btn-primary
- do: Use the ink palette for every primary action.
- don't: Never introduce raw hex blues outside the palette tokens.
```

- `kind:` — one of `palette` / `type` / `spacing` / `component` (the closed
  vocabulary; `component` is the signature-component class).
- `css: <path> <selector>` — ≥1 per rule; the path is relative to the spec
  file (absolute or `~`-rooted paths are rejected as malformed — they only
  resolve on the author's machine; `../` traversal within the repository is
  fine). A rule is only **mechanically link-live** when it has at least one
  selector defined in an author-written `.css` source (checked statically —
  no app boot). Non-CSS targets (CSS-in-JS, utility frameworks, CSS-Modules)
  are reported as unchecked notes and do not establish link-liveness on their
  own. For nested CSS rules link the leaf selector — composed selectors like
  `.btn .icon` written via nesting do not match (preludes are checked flat,
  not ancestor-composed).
- `example:` — ≥1 per rule (a rule with zero examples is rejected). Presence
  is structural; whether the example still matches live UI is
  `spec-truthfulness`, a separate concern this gate does not check.
- `do:` / `don't:` — ≥1 guidance line per rule.

Headings (or line-initial paragraphs / setext headings) that look like rule
declarations but miss the strict ATX `rule: <id>` form (`Rule: x`, `rule : x`,
`rule x`) are flagged as `malformed-rule-heading`; prose headings starting
with "Rule" (e.g. `## Rule of thumb`) are fine. Fenced and indented code
blocks are inert — an authoring example like the one above never parses as a
live rule.

## Procedure

1. **Locate or create the spec file.** One spec per design language; do not
   fork per-surface copies. If the operator has no spec yet, scaffold the
   heading + one rule per obvious anchor (masthead, primary action, body type)
   directly from the live CSS — with the operator naming the files that count
   as design-language source.

2. **Author or update rules — manual path (default, requires NO engine).** The
   operator (or the agent under operator direction) writes the rules by hand:
   pick the selector in live CSS the rule is anchored to, cite ≥1 current
   example, state the do/don't. Scaffold completion never depends on engine
   presence — this path never calls the engine preflight.

3. **Optional engine accelerator.** Only if the operator asks for it: gate on
   `preflightEngine` (`@/engine-adapter`, method `translate-design-language`)
   — absence fails loud naming the remedy — then request a draft of the
   **design-language spec artifact itself** from the engine (input: the
   approved wireframe intent + the live CSS files the operator names).
   **Engine output gets zero trust:** it lands in the same file and is judged
   by the same gate as a hand-authored draft. Engine conformance
   (`@/engine-adapter/conformance`) is exercised only when the engine is
   present — never stub it to simulate presence.

4. **Validation gate — the non-negotiable step.** Run:

   ```bash
   plugins/design-control/bin/check-design-spec <path/to/design-language.md>
   ```

   - Exit `0` with **no unchecked-link notes** → the draft may be presented as
     fully link-live.
   - Exit `0` **with unchecked-link notes** → the draft may be presented only
     as structurally green with visible unchecked scope; read every `does not
     establish link-liveness` note aloud to the operator. Do not describe that
     result as fully link-live.
   - Exit `1` → fix every finding and re-run. A dead selector means either the
     rule rots (fix the link) or the CSS moved (update the rule) — NEVER
     delete the rule just to silence the finding; that decision is the
     operator's.

5. **Present and stop.** Show the operator the validated spec:
   - fully link-live path: `0 findings` output + rule count
   - unchecked-link path: `0 findings` output + unchecked-link notes + rule
     count
   The operator owns acceptance; implementation against the spec and
   refereeing are separate steps of the loop, not this skill's job.

## What this skill does NOT do

- It does not author wireframes (`/design-control:wireframe`), implement, or
  referee.
- It does not boot the app, capture screenshots, or verify that examples still
  match live UI (that is `spec-truthfulness`, which no step of this skill
  performs).
- It does not skip the gate for engine-authored drafts — same gate, same
  checker, zero findings.
