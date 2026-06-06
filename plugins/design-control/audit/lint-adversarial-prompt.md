# design-control lint — adversarial validation prompt

> **Re-runnable.** This is the committed instruction header for the `check-mockup-lofi`
> adversarial validation. To run it, assemble the actual barrage prompt =
> **this header + the current lint source concatenated below the marker** (so the
> models always see live code, never a stale paste), then fire it cross-model:
>
> ```bash
> # from the worktree root
> PROMPT=$(mktemp)
> cat plugins/design-control/audit/lint-adversarial-prompt.md > "$PROMPT"
> echo "\n\n===== LIVE LINT SOURCE (read-only, current) =====\n" >> "$PROMPT"
> for f in plugins/design-control/src/lint/types.ts \
>          plugins/design-control/src/lint/allowlist.ts \
>          plugins/design-control/src/lint/codepoint.ts \
>          plugins/design-control/src/lint/stylesheet-pin.ts \
>          plugins/design-control/src/lint/check-mockup-lofi.ts; do
>   printf '\n----- %s -----\n' "$f" >> "$PROMPT"; cat "$f" >> "$PROMPT"; done
> dw-lifecycle audit-barrage --feature design-control --prompt-file "$PROMPT"
> ```
>
> This is the adversarial-validation **process** for the lo-fi lint (per the
> stack-control lifecycle philosophy: policy enforced by a *process*, not a
> hand-authored fixture set). Re-run it whenever the lint changes; codify every
> genuine defeat into the deterministic vitest corpus (the "crib") and register
> the leakage class via `dw-lifecycle scope-widen`.

## The guarantee under test

`lintWireframe(html)` (in `@/lint/check-mockup-lofi`) exists to make ONE promise
trustworthy:

> **lint green ⇒ the wireframe is genuinely LO-FI.** A wireframe that passes the
> lint cannot masquerade as finished visual design.

A "genuinely lo-fi wireframe" conveys **structure and flow only**. It is
deliberately unfinished. It must NOT be able to carry: designed typography,
color/visual polish, imagery, hidden or inline styling, external resources of any
kind, or any channel that lets a polished/finished-looking surface render while
the lint reports green. The single visual source of truth is the one identity-
pinned `sketch-kit.css`; arbitrary `class` values are permitted only because they
are *inert* under that pinned stylesheet.

The lint is an **allowlist on two axes** (element/attribute + text codepoints)
plus a stylesheet identity-pin. Read the live source below for the exact rules.

## Your task: defeat the guarantee

You are an adversary. Find wireframe HTML inputs that **break the promise**, in
either direction. Prioritize direction (A) — it is the dangerous failure.

- **(A) FALSE NEGATIVE (leak) — highest priority.** A wireframe that is NOT
  genuinely lo-fi — it carries designed typography, visual polish, an image, an
  external/loaded resource, hidden or effective styling, or otherwise *could read
  as finished design* — yet `lintWireframe(html)` returns `ok: true` (or emits no
  finding for that channel). Each such input is a hole in the lo-fi guarantee.
- **(B) FALSE POSITIVE (over-rejection).** A genuinely lo-fi, legitimate wireframe
  input (the kind a real operator would author for structure-and-flow) that the
  lint wrongly rejects. Over-rejection erodes trust and pushes authors off the
  tool.

Think about channels an allowlist structurally cannot see, parser differentials
(the lint uses parse5; browsers may differ), entity/encoding tricks, namespace
confusion (SVG/MathML foreign content), CSS reachable without `<style>`/`style=`,
text that renders as designed type without leaving the codepoint allowlist,
stylesheet-identity edge cases, and anything the rule set's own comments claim is
closed (verify the claim).

## Rules of engagement

- Inputs must be **realistic wireframe HTML** a human or an `author-wireframe`
  engine might plausibly emit — not absurd payloads. The threat model is
  author-side polish leakage, not a malicious attacker, but parser-differential
  and encoding tricks are in scope because an engine could emit them.
- Do **not** invent rules the lint does not claim. Test the guarantee as written.
- For each finding, give the **exact HTML**, predict the **`lintWireframe` result**
  (which rule fires or that it returns `ok:true`), and explain **why it defeats
  the guarantee** (what a browser would actually render vs. what the lint saw).
- If you find nothing in a category after a genuine search, say so explicitly and
  name what you checked — a grounded CLEAN is a valid result.

## Output format (so findings lift cleanly into the audit-log)

For each finding, emit a block exactly in this shape:

```
### <one-line title>

Finding-ID: <model>-NN
Status:     open
Severity:   high | medium | low | informational
Direction:  false-negative | false-positive
Surface:    plugins/design-control/src/lint/<file>.ts (<rule or gap>)

Defeating-input:
<the exact wireframe HTML>

<why it defeats the guarantee: what the browser renders vs. what the lint reported,
and the leakage class / channel name>
```

Severity guide: a **false-negative that ships polished design as "verified lo-fi"
is HIGH**; a narrow/contrived leak is MEDIUM; a false-positive on legitimate input
is MEDIUM/LOW; a documentation or rare-edge note is informational.
