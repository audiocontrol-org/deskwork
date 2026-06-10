---
id: TASK-22
title: approve leaves journal/sidecar drift + calendar not updated to Final lane
status: To Do
assignee: []
created_date: '2026-06-10 19:00'
labels:
  - agent-found
  - 'type:bug'
dependencies: []
references:
  - gh-215
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Imported from https://github.com/audiocontrol-org/deskwork/issues/215

## Summary

Hit several inter-related issues running through the full `ingest → iterate → approve` flow against a fresh project on `deskwork@0.16.0`. Filing them together because they appear to share a root cause around how `approve` reconciles state with the journal and the calendar.

Repro environment: macOS 14 (Apple Silicon), `node --version` ≥ 20, fresh `/deskwork:install` against a non-website engineering-docs collection (single site, `contentDir: docs`, `calendarPath: docs/design-spec-calendar.md`).

## Repro sequence

```sh
# Bootstrap
/deskwork:install
# (single-site config, contentDir: docs, calendarPath: docs/design-spec-calendar.md)

# Ingest a markdown file with status: draft frontmatter
deskwork ingest . --state-field status docs/.../some-spec.md --apply
# → entry lands in Drafting; deskwork.id added to frontmatter; OK

# Operator leaves two comments in deskwork-studio's review surface
# (writes annotation files under .deskwork/review-journal/history/...)

# Iterate: agent edits the file, then runs:
deskwork iterate --dispositions .deskwork/.iterate-dispositions.json <slug>
# → reports addressed comments, flips state=in-review; OK

# Approve to advance Drafting → Final
deskwork approve <slug>
# → reports fromStage=Drafting, toStage=Final; sidecar.currentStage=Final
```

Now `deskwork doctor`:

```
Doctor: clean (no findings across 1 site(s))

Entry-centric validation: 1 failure(s)
  journal-sidecar [entry=09f42ab3-...]: latest review-state-change.to=in-review
    does not match sidecar reviewState=null (.deskwork/entries/09f42ab3-....json)
```

And the calendar (`docs/design-spec-calendar.md`) STILL shows the entry under `Drafting`, not anywhere else. There is no `Final` section in the calendar template.

## Issue 1 — `approve` leaves journal/sidecar drift (review-state)

**Trigger:** `iterate` appended a `review-state-change` journal event with `to=in-review`. `approve` correctly cleared `sidecar.reviewState` (per the approve skill's step 7: `reviewState: undefined`) but did NOT append a counterpart `review-state-change` journal event to record the clear. The doctor's `journal-sidecar` rule then fails because the latest journal event still asserts `to=in-review`.

**Reproducer:** after the `approve` call above, run `deskwork doctor`. The "Entry-centric validation" line surfaces the drift.

**Expected:** `approve` either appends a `review-state-change.to=null` (or `to=cleared`) event before transitioning, OR the `journal-sidecar` rule treats stage-transition events as implicitly clearing the prior review state.

**Workaround:** none found. `deskwork doctor --fix all` says `Entry-centric repair applied: calendar-regenerated` but the validation failure persists on subsequent runs.

**Severity:** medium. State reaches the desired terminal stage; the drift is purely audit-trail-flavored. But the doctor-failure means CI / pre-commit hooks running doctor will fail forever after any approve-following-iterate sequence — which is the normal happy path.

## Issue 2 — Calendar not updated by `approve` (no `Final` lane?)

**Trigger:** After `approve` flips `sidecar.currentStage = Final`, the calendar markdown file still shows the entry under the `Drafting` section. There is no `Final` section in the calendar template.

**Expected (one of):**
- Calendar template includes a `Final` lane between `Drafting` and `Published` (or wherever Final fits).
- Final-stage entries get rendered into an existing lane (Published? Review?) by the calendar regenerator.
- `approve` advances Final → Published implicitly when no further stages exist.

**Actual:** Final-stage entries are invisible on the calendar. The entry "exists" in `.deskwork/entries/<uuid>.json` with the right state, but there's no surface that shows it. The studio dashboard would presumably also miss it.

**Workaround:** none found. `deskwork doctor --fix all` reports `calendar-regenerated` but the calendar still shows the entry under `Drafting`.

**Severity:** high. After the approve step, the operator can't see the entry's true state on the canonical surface (the calendar markdown). The sidecar holds the truth but the calendar lies.

**Possible cause:** the calendar template is hardcoded to a fixed lane set (Ideas / Planned / Outlining / Drafting / Review / Paused / Published / Distribution) that doesn't include `Final`. The regenerator either drops Final entries or falls back to the previous lane.

## Issue 3 — `deskwork doctor --help` returns "Unknown flag"

Minor UX issue. Other subcommands accept `--help`-style probing; doctor doesn't.

```
$ deskwork doctor --help
Unknown flag: --help
```

`deskwork doctor --fix` (no value) returns `Flag --fix requires a value` — that's a usable hint, but the `--help` rejection is dead-end.

## Issue 4 — Misleading "clean" first line on doctor output

```
Doctor: clean (no findings across 1 site(s))

Entry-centric validation: 1 failure(s)
  ...
```

The first line says "clean" but the next line says "1 failure(s)". An automation script grepping for "clean" would report success when there are real findings. Suggest rephrasing the first line to scope it explicitly: `Calendar-level validation: clean (no findings across 1 site(s))`.

## What I expected for a happy-path approval

```
$ deskwork approve <slug>
{
  "fromStage": "Drafting",
  "toStage": "Final"
}

$ deskwork doctor
Doctor: clean (no findings across 1 site(s))
Entry-centric validation: clean

$ cat docs/design-spec-calendar.md
... entry appears under "Final" or "Published" or wherever the regenerator routes it ...
```

Instead I got `currentStage=Final` on the sidecar, calendar entry still under `Drafting`, and a permanent doctor failure.

## Test-case fixture

The repro sequence above is reproducible against any non-website single-site project. Happy to share the actual git history of the worktree where this surfaced if useful (audiocontrol monorepo, branch `feature/midi-macro-bridge-packaging`, commits `432b9b8b` (install + ingest), `c4d752ff` (iterate v2), and the approve I just ran).

## Severity summary

| Issue | Severity |
|---|---|
| 1 — journal/sidecar drift after approve | medium (breaks doctor in CI) |
| 2 — calendar not updated to Final | high (hides truth on canonical surface) |
| 3 — doctor --help missing | low (minor UX) |
| 4 — misleading "clean" first line | low (scriptability footgun) |

---

*Filed by an AI assistant (Claude) at the user's direct request after hitting these issues during a real session. Earlier related issue: #214.*
<!-- SECTION:DESCRIPTION:END -->
