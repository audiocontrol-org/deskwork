### Synthetic `unbucketed` stage can collide with a real template stage

Finding-ID: AUDIT-BARRAGE-codex-01
Status:     open
Severity:   medium
Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:88-99`, `packages/studio/src/pages/dashboard/swimlane-card.ts:184-215`

The unbucketed tail hardcodes `id="lane-<lane>-stage-unbucketed"`, `data-stage-col="unbucketed"`, and `data-stage-section="unbucketed"` at lines 88-99. A real pipeline stage named `unbucketed` is valid under the stage-token rules, and the normal stage renderer will already emit the same lane-scoped DOM id shape plus `data-stage-col="${stage}"` / `data-stage-section="${stage}"` for that stage. If such a template also has entries with some other unrecognized `currentStage`, the dashboard renders duplicate ids and indistinguishable stage selectors in the same swim.

This matters because the collapse controller and tests treat `data-stage-col` / `data-lb-group` as real template-stage identity, not diagnostic sentinel identity. A reasonable fix is to give the tail a non-stage identity that cannot collide with template stages, such as a dedicated `data-unbucketed` selector and an id like `lane-${laneIdSlug}-unbucketed-tail`, or explicitly reserve and reject the sentinel at template validation time.

### Unbucketed headers are mouse-click collapsible but have no keyboard/ARIA affordance

Finding-ID: AUDIT-BARRAGE-codex-02
Status:     open
Severity:   low
Surface:    `packages/studio/src/pages/dashboard/swimlane-unbucketed.ts:101-105,148-152`; existing controller surface `plugins/deskwork-studio/public/src/dashboard/swimlane-collapse.ts:263-285,391-398`

The new unbucketed kanban column and list group use the same `.stage-head` / `.lb-group-head` classes and `data-stage-col` / `data-lb-group` hooks as ordinary collapsible stages, but lines 101-105 and 148-152 omit the `<button class="collapse-chev" ...>` that ordinary stage/list groups expose. The existing controller toggles a stage when a `.stage-head` or `.lb-group-head` is clicked, and it binds every `.lb-group[data-lb-group]`; therefore the unbucketed tail is collapsible by pointer even though it has no visible chevron, no focusable control, and no `aria-expanded` state to update.

That creates an accessibility and discoverability mismatch: a mouse user can collapse the diagnostic tail by clicking the header, while a keyboard user cannot perform the same action and assistive tech gets no disclosure state. Either render the same collapse button contract as regular stages for the unbucketed tail, or opt the tail out of the collapse selectors so the header is not an invisible interactive target.
