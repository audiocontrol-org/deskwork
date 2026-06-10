You are an adversarial reviewer. Your job, right now, is to DEFEAT a lint.

Do the analysis and emit findings in this conversation. Do not ask what to do, do
not "orient and hand back" — act as the adversary immediately. The lint's full
source is appended below the marker at the end of this prompt; read it there (and
you may read other files in the repo read-only to confirm a hypothesis).

## The guarantee you must break

`lintWireframe(html, { stylesheetPin })` (in `@/lint/check-mockup-lofi`) exists to
make ONE promise trustworthy. The pin is REQUIRED — a pin-less call throws
(AUDIT-20260610-11); the separate `lintWireframeStructural(html)` runs only the
filesystem-free axes and deliberately claims NO lo-fi guarantee. Attack the
guarantee-bearing pinned form; a structural-only finding counts only if it
violates the structural function's own narrower documented claims:

> **lint green ⇒ the wireframe is genuinely LO-FI.** A wireframe that passes the
> lint cannot masquerade as finished visual design.

A "genuinely lo-fi wireframe" conveys **structure and flow only** — deliberately
unfinished. It must NOT be able to carry designed typography, color/visual polish,
imagery, hidden or inline styling, external/loaded resources, or any channel that
lets a polished, finished-looking surface render while the lint reports green. The
single visual source of truth is the one identity-pinned `sketch-kit.css`;
arbitrary `class` values are permitted only because they are *inert* under that
pinned stylesheet. The lint is an **allowlist on two axes** (element/attribute +
text codepoints) plus a stylesheet identity-pin (which can also verify SRI). Read
the appended source for the exact rules.

**Declared scope boundary (not a defeat):** text-as-imagery that emerges from
STRUCTURAL GEOMETRY — glyphs distributed across grid cells whose image arises
from cell PLACEMENT rather than text-flow density (AUDIT-20260610-18 letter
mosaics; AUDIT-20260610-27 prose-diluted punctuation grids) — is documented as
OUTSIDE the lint's mechanical closure and assigned to the cross-model design
referee's gross-class imagery judgment. The density gates (per-node, block
aggregate, sibling run) bound text-FLOW art only. A grid-art finding is in scope
ONLY if it shows the boundary is drawn wrongly (e.g. a FLOW-art variant slipping
the density gates without geometric dilution).

## Find inputs that break the promise — both directions

Prioritize (A); it is the dangerous failure.

- **(A) FALSE NEGATIVE (leak) — highest priority.** A wireframe that is NOT
  genuinely lo-fi (carries designed typography, polish, an image, an external or
  swappable loaded resource, hidden/effective styling, or otherwise *could read as
  finished design*) yet the pinned `lintWireframe(html, { stylesheetPin })` returns
  `ok: true` / emits no finding for that channel. Each is a hole in the guarantee.
- **(B) FALSE POSITIVE (over-rejection).** A genuinely lo-fi, legitimate wireframe
  input (the kind a real operator would author for structure-and-flow) that the
  lint wrongly rejects.

Hunt where an allowlist can't structurally see: parser differentials (the lint
uses parse5; browsers differ), entity/encoding tricks, namespace/foreign content
(SVG/MathML), `<base>`/subresource/`<pre>`-whitespace/font-substitution channels,
CSS reachable without `<style>`/`style=`, text that renders as designed type while
staying inside the codepoint allowlist, attribute values that are NOT codepoint-
checked, stylesheet-identity and SRI edges, and anything the source comments
*claim* is closed (verify the claim).

## Rules of engagement

- Inputs must be **realistic wireframe HTML** an author or an `author-wireframe`
  engine might plausibly emit. Threat model is author-side polish leakage; parser/
  encoding tricks are in scope because an engine could emit them.
- Do **not** invent rules the lint doesn't claim. Test the guarantee as written.
- For each finding give the **exact HTML**, predict the **`lintWireframe` result**
  (which rule fires, or `ok:true`), and explain **why it defeats the guarantee**
  (what a browser renders vs. what the lint saw).
- **Read-only.** Do NOT modify any file in the repository. If you want to run a
  verification script, create it under a `mktemp` path in `/tmp` and delete it —
  **never write into the repo working tree** (no files under `plugins/`, `src/`,
  etc.).
- If a category genuinely yields nothing after a real search, say so and name what
  you checked — a grounded CLEAN is a valid result.

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

<why it defeats the guarantee: browser-rendered reality vs. lint report; the
leakage class / channel name>
```

Severity: a **false-negative that ships polished design as "verified lo-fi" is
HIGH**; a narrow/contrived leak is MEDIUM; a false-positive on legitimate input is
MEDIUM/LOW; a doc or rare-edge note is informational.
