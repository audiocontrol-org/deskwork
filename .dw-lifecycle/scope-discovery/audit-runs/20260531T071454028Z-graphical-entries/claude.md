I've now grounded my analysis: I read the full `renderSwimCompact`, both unbucketed renderers, the `.swim-compact` CSS, and the test setup. Here are my findings.

---

### Dead variable `swimCompactClose` in the new compact-strip test — computed then explicitly discarded

Finding-ID: AUDIT-BARRAGE-claude-01
Status:     open
Severity:   low
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (the AUDIT-20260531-01 test, the `swimCompactClose` line + its `void swimCompactClose;`)

The new test computes `const swimCompactClose = editorialBlock.indexOf('</div>', swimCompactOpen);` and then never uses it — the actual end of the `.swim-compact` element is located by the hand-rolled depth-matching loop that advances `cursor`, and the slice uses `cursor`, not `swimCompactClose`. The author noticed the variable was unused and silenced the linter with `void swimCompactClose;` rather than deleting the line.

`indexOf('</div>', swimCompactOpen)` returns the position of the *first* nested `</div>` (the close of the first inner `.sc-stage`), which is not the boundary of the compact strip at all — so the value is not only unused but semantically misleading if a future editor mistakes it for "the close of swim-compact." Per the project's hygiene guidance (no dead code, names that reveal intent), delete both the declaration and the `void` discard. The depth-matching loop is the sole, correct mechanism for finding the boundary; the leftover line is scaffolding that should not have survived to commit.

---

### Compact-strip test asserts DOM presence but never exercises the collapsed state its name claims — CSS reveal path is unverified

Finding-ID: AUDIT-BARRAGE-claude-02
Status:     open
Severity:   informational
Surface:    `packages/studio/test/dashboard-swimlane-unbucketed-render.test.ts` (`renders unbucketed compact cell in swim compact strip when lane is collapsed (AUDIT-20260531-01)`); CSS at `plugins/deskwork-studio/public/css/dashboard-swimlane-shell.css:197-206`

The test name and comments say the cell renders "when lane is collapsed," but the test is a server-render integration test that only asserts the cell is present in the emitted HTML. `.swim-compact` is **always** server-rendered for every swim — it is `display: none` by default (`:197-202`) and revealed only by the CSS rule `.swim.collapsed .swim-compact { display: flex }` (`:204-206`). The test never sets the lane to `.collapsed`, never toggles the client-side collapse handler, and cannot observe CSS visibility from a string-match assertion. So the assertions prove "the server now emits the `is-unbucketed` `.sc-stage` cell into the compact strip" — which is the real fix — but not "the cell is visible in collapsed view."

This is acceptable for an HTML-presence test, but per `.claude/rules/ui-verification.md` the collapsed-view *visibility* (the CSS-gated reveal, the equal-flex distribution of the now-9th cell, the `align-items: stretch` row height when the longer `(unrecognized stage)` label wraps) is the kind of claim that rule asks to verify by actually toggling collapse in a browser at a real viewport. The operator should know the DOM is covered and the CSS-reveal path is not. A precise test name (`…emits unbucketed cell into the compact strip`) plus a one-line note that collapse visibility is CSS-only and unverified by this test would make the scope auditable.

---

### New `.sc-stage.is-unbucketed` compact cell has no dedicated CSS and a label far longer than real stage names — only the inline glyph distinguishes it

Finding-ID: AUDIT-BARRAGE-claude-03
Status:     open
Severity:   informational
Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:135-139` (`renderUnbucketedCompactCell`); CSS at `dashboard-swimlane-shell.css:208-246`

The docstring (`swimlane-unbucketed.ts:113-117`) claims the existing flex layout "handles the trailing cell with no template changes" — verified true: `.swim-compact` is `display: flex` and `.sc-stage { flex: 1 }` (`css:208-209`), so the appended cell flows and the `:last-child` border rule (`:217-219`) correctly moves to the new last cell. No layout defect.

Two consistency gaps worth the operator's eye, neither a bug: (1) there is **no** `.swim-compact .sc-stage.is-unbucketed` rule — the cell inherits generic `.sc-stage` styling, so unlike the kanban tail (`.stage-col.is-unbucketed`, which carries distinct chrome) the *only* signal that this cell is the routing-drift bucket is the `⊘ (unrecognized stage)` text in `.sc-name`. The regular compact cells render their glyphless stage name; this cell inlines `⊘` directly into `.sc-name` rather than in a separate `aria-hidden` glyph span the way the kanban (`:102`) and list (`:181`) tails do, so a screen reader will voice the raw `⊘`. (2) `.sc-name` (`:221-227`) has `text-transform: uppercase` + `0.14em` letter-spacing and no `white-space: nowrap`/`text-overflow`; "(UNRECOGNIZED STAGE)" is much wider than a one-word stage name, so in the editorial lane's ~9 equal-flex cells it will wrap to multiple lines (tolerable because `align-items: stretch` levels the row). If visual parity with the other two unbucketed surfaces matters, add a scoped `.swim-compact .sc-stage.is-unbucketed` rule and move the glyph into an `aria-hidden` span to match the kanban/list precedent the docstring says it mirrors.

---

I walked the production change (`renderSwimCompact` + `renderUnbucketedCompactCell`), the reconciliation invariant, escaping, the CSS layout, and the strengthened count-consistency test. The core fix is **correct**: the compact cell is count-only (the right shape for a summary strip), the `data-row-shell` counts the strengthened test relies on are genuinely emitted by both the kanban (`swimlane-unbucketed.ts:58`) and list (`:163`) unbucketed rows, the empty-input guard returns `unsafe('')` so callers append unconditionally, no `currentStage` value reaches the compact cell so there's no new escaping surface, and the `.swim-compact` flex layout absorbs the trailing cell as the docstring claims. The three findings above are hygiene/informational, not correctness defects.
