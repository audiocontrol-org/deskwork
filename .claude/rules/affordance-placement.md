## Affordance Placement Standard

When designing or implementing a UI affordance (button, toggle, handle, control) for a specific UI component, the affordance lives ON the component, not in a generic toolbar. This rule codifies the principle the codebase already follows in its best examples (the outline drawer, the scrapbook drawer) so future affordance work matches.

### Principles

1. **Component-attached over toolbar-attached.** When an affordance controls *one specific component's state* (visibility, mode, expansion), it lives ON that component's chrome — its header, its edge, or its body — not in a generic toolbar row.

2. **Symmetric reveal/hide pattern.** A component that can be stowed and unstowed needs *two paired affordances*:
   - **Visible state** carries a stow control inside its own chrome (chevron in the header, close button in the body).
   - **Stowed state** leaves a thin rail / pull tab on the edge it vanished into. The tab IS the affordance to bring it back.
   Both affordances dispatch through the same client-side handler. They share `aria-pressed` state.

3. **Toolbars are for cross-component / app-level actions.** Save, Cancel, Source/Split/Preview, Focus mode — these are about the application's *mode* or actions that span the whole surface. They belong in toolbars. Per-component visibility toggles do not.

4. **Identical physical position across modes.** If a component is visible in both read and edit modes, its affordance is at the *same coordinates* in both modes. The operator's muscle memory for "where do I click to stow this" must transfer between modes without recalibration.

5. **Do not duplicate an affordance into multiple toolbars to compensate for a placement mistake.** Two buttons in two toolbars (read mode + edit mode) is a code smell that signals the affordance belongs on the component, not in either toolbar.

### Reference patterns in this codebase

- **`.er-outline-tab`** (`editorial-review.css:2192`) — a vertical pull tab on the LEFT viewport edge that appears when the outline drawer is closed; clicking it expands the drawer. This is the canonical "stowed-state affordance is a tab on the edge it vanished into" pattern.

- **`.er-marginalia-tab`** (`editorial-review.css`) — mirrors the outline-tab pattern on the RIGHT edge for the marginalia column. Paired with `.er-marginalia-stow` (chevron inside the marginalia head when visible). Same handler dispatches both.

- **`.er-scrapbook-drawer`** — its own peek-line + Expand/Collapse button live as part of the drawer chrome. The toggle is on the drawer, not in the strip.

When designing a new affordance, **find the existing pattern in this list that matches and mirror it**. Deviation requires an explicit reason that survives operator review.

### Pre-implementation gate

Before writing markup or CSS for a new affordance, write down (in the implementation thread, the workplan, or the commit message) the answers to these three questions:

1. **What existing project pattern does this mirror?** Reference the class name from the list above (or the file path of another precedent). If nothing matches, this is a design conversation that has to happen *before* code is written, not after the operator pushes back on a shipped wrong shape.
2. **Where is the affordance physically placed and why?** Component-attached or toolbar-attached? If toolbar, why is this app-level state and not component-level state? If component, where exactly on the component (header, edge, body)?
3. **What direct-manipulation principle is in play?** Is the affordance close to what it affects? Does its position make the operator's mental model match the spatial outcome (a left-pointing chevron stows the right-side column)? Does the stowed-state affordance live on the edge the component vanished into?

If any of these is "I don't know" or "I'll figure it out later", the work isn't ready to start.

### Anti-patterns to refuse

- A toolbar button that toggles a single component's visibility, when no other toolbar button in the same toolbar manipulates that component.
- A "duplicate this control into the other toolbar" patch when the original control is invisible in some mode.
- An affordance whose label/glyph doesn't relate spatially to the action (e.g., a button that hides a right-side column but has no right/left directional cue).
- A "we'll add the discoverability later" stance that ships a hidden control with only a keyboard shortcut.

### When this rule conflicts with shipping speed

It doesn't. Component-attached affordances aren't more expensive to write than toolbar buttons; they require the same CSS + one DOM placement decision. The cost is in the *thinking before the code* — which is the work this rule exists to make non-skippable.

### Why this rule exists

This rule was written after the 2026-05-02 session in which the agent shipped two iterations of the marginalia toggle as toolbar buttons before the operator pushed back with the right design question — *"why is the affordance disconnected from the component it affects?"* Three commits were needed to converge on the on-component pattern. The conversation about affordance shape should have happened *before* the first iteration was written, not after the third.

The rule applies forward to every affordance the agent touches in this codebase. When in doubt, look at `.er-outline-tab` and mirror it.
