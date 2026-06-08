# Design inbox — interim low-friction insight-capture convention (SUNSETS at the `design/insight-capture` feature)

> **This is an INTERIM convention with a defined sunset.** It is the stopgap for low-friction out-of-sequence idea capture **until stack-control's `design/insight-capture` feature ("Low-friction insight capture") ships the capability natively.** When `design/insight-capture` lands, **this rule and the `design-inbox.md` file convention are RETIRED**, and capture moves to whatever mechanism the plugin provides (a `stackctl` capture verb / inbox surface — "we use whatever mechanisms the plugin demands"). This is explicitly NOT a "just for now" nucleation site (cf. `agent-discipline.md` § *"Just for now is bullshit"*): the sunset trigger is concrete and tracked — the **`design/insight-capture` feature in `stack-control-roadmap.md`** — and the successor mechanism is named. **If `design/insight-capture` has shipped and this rule still exists, deleting it is overdue.**

## Why this exists (thesis link)

Low-friction insight capture is a direct expression of the stack-control thesis — *invest heavily in up-front design and tooling; industrialize execution* (see [`stack-control-thesis.md`](../../docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/stack-control-thesis.md)). Design and scoping are **not serial**; capturing an idea must never require finishing the current thread. Treating them as serial loses hard-won insight while it's fresh.

## The convention (until `design/insight-capture`)

1. **Capture is instant and append-only.** When an out-of-sequence design idea surfaces mid-thread, append it to the **single, governed inbox** [`plugins/stack-control/DESIGN-INBOX.md`](../../plugins/stack-control/DESIGN-INBOX.md) (declares `doc-grammar: design-inbox`) in one move. Do **not** stop the current thread to scope it. *(The former ungoverned source at `docs/1.0/001-IN-PROGRESS/pluggable-lifecycle-providers/design-inbox.md` was retired to a pointer on 2026-06-08 — there is one source of truth now; never re-fork capture back into the docs tree.)*
2. **Capture ≠ scope.** The inbox is a pre-triage parking lot. **Triage is a separate, deliberate pass** that promotes an entry to a spec / roadmap feature / GitHub issue, or drops it with a reason. Never let "capture this" expand into "scope this now."
3. **Hold multiple threads.** Several design threads live at once is fine and expected. Capture keeps them from being lost; it does not force serialization.
4. **Entry format stays minimal** — title + Surfaced / Context / Idea / Provisional home / Status — so appending stays a one-move act.
5. **Don't reach for a heavier mechanism at capture time.** GitHub issues = triaged, tracked work; the roadmap = scoped/sequenced features; the inbox = the instant pre-triage surface. Promote upward at *triage*, not at *capture*.

## How to apply

- Mid-thread idea → append to the inbox, keep going. Default to **capturing** rather than serializing; if unsure whether something is in scope, capture it and continue.
- A triage pass (periodic, or when an entry is clearly ready) promotes entries and updates their `Status` (`captured` → `promoted` / `dropped`).

## Sunset checklist (run when `design/insight-capture` ships)

- [ ] Migrate any un-triaged inbox entries from the governed `plugins/stack-control/DESIGN-INBOX.md` into the plugin's native capture surface.
- [ ] **Delete this rule.**
- [ ] Retire the governed `plugins/stack-control/DESIGN-INBOX.md` into the native surface. *(The ungoverned docs-tree source was already retired to a pointer on 2026-06-08.)*
- [ ] Update `stack-control-roadmap.md` (the vision § + `design/insight-capture` row) to reflect the native mechanism is live.
