---
id: TASK-58
title: >-
  UX: studio review surface has no Publish action at Final stage; toolbar is
  stage-blind
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
dependencies: []
references:
  - gh-230
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## UX: studio review surface has no Publish action at Final stage

### Symptom

When an entry is at `currentStage: Final`, the studio's per-entry review surface (`/dev/editorial-review/entry/<uuid>`) shows the same action toolbar it shows at every other stage: **Edit · Preview · Approve · Iterate · Reject**. There is no **Publish** button. The operator at Final has no in-studio affordance to advance the entry to `Published` — they have to know to leave the surface and run `/deskwork:publish <slug>` from the CLI.

The toolbar is stage-blind: at Final, the only correct forward action is "publish," and that action is the only one not exposed.

To make it worse: the Approve button is shown but is wrong at Final. The `/deskwork:approve` skill explicitly refuses Final → ??? transitions: *"If Final: refuse: 'use /deskwork:publish for Final → Published.'"* So if the operator clicks Approve thinking it's the next-stage advance, they'll get a refusal — and the studio doesn't tell them this in advance.

### Reproduction

1. Project with an entry at `currentStage: Final` (e.g. transitioned via `/deskwork:approve` from Drafting → Final).
2. Visit `/dev/editorial-review/entry/<uuid>`.
3. Toolbar shows: Edit · Preview · Approve · Iterate · Reject.
4. Operator looks for "Publish" — there isn't one.

In our case the entry was `midi-to-mcu-macro-bridge` (`721d5212-...`), Final v0 after 11 Drafting iterations.

### Why it's a bug

The Approve button at every stage doubles as the "advance to next pipeline stage" affordance per THESIS Consequence 2. At Final, the next stage is Published, and the dedicated verb is `/deskwork:publish` (not `/deskwork:approve`). The toolbar should reflect that — either by:

1. **Replacing Approve with Publish at Final.** Same affordance shape, different target verb. The button text + behavior switches based on `sidecar.currentStage`. At Outlining/Drafting, Approve is shown; at Final, Publish is shown.
2. **Adding Publish as a distinct button alongside Approve.** Keeps Approve's meaning consistent at every stage but disabled-with-tooltip at Final ("Final entries publish via the dedicated Publish action"). More visually noisy but more explicit.
3. **Toolbar disclosure tied to stage.** A stage-aware toolbar that hides irrelevant actions and surfaces the stage's specific affordances (Publish at Final, Block/Cancel at any non-terminal, etc.).

Option 1 is probably right — same operator-facing affordance, different downstream verb. The studio's `Approve` button is already a clipboard-copy-of-the-slash-command; at Final it'd just copy `/deskwork:publish <slug>` instead of `/deskwork:approve <slug>`.

### Acceptance

- An operator viewing a Final-stage entry's review surface sees a clear "Publish" affordance (button or relabeled Approve).
- Clicking that affordance copies `/deskwork:publish <slug>` to the clipboard (per the THESIS Consequence 2 pattern), or otherwise signals the right next step.
- The Approve button at Final either disappears or surfaces a "use Publish at this stage" message instead of silently appearing to advance.

### Related

- audiocontrol-org/deskwork#154 — "Studio review surface needs more work" (umbrella).
- audiocontrol-org/deskwork#228 — Save button stays inactive (separate review-surface bug).
- audiocontrol-org/deskwork#229 — chrome divider stacks on host-styled `<hr>` (separate review-surface bug).

### Origin

Surfaced 2026-05-06 mid-session, after running `/deskwork:approve midi-to-mcu-macro-bridge` to transition the entry from Drafting → Final. Operator viewed the Final-stage review surface, saw the standard Edit / Preview / Approve / Iterate / Reject toolbar, and asked: *"there's no 'publish' action on the studio for final drafts."* The CLI's `/deskwork:publish` works; the studio just doesn't surface it.
<!-- SECTION:DESCRIPTION:END -->
