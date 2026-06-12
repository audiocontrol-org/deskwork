---
id: TASK-97
title: >-
  Studio review surface: agent-reply margin notes (capsule responses paired to
  operator comments)
status: To Do
assignee: []
created_date: '2026-06-10 19:31'
labels:
  - 'type:imported-issue'
  - enhancement
dependencies: []
references:
  - gh-54
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## The gap

The unified review surface gives the operator a margin-note channel back to the agent, but there's no symmetric channel for the agent to reply back into the margin. The current iteration shape:

1. Operator leaves a margin note ("Why do we need a default collection?")
2. Operator clicks Iterate
3. Agent reads the comment, can either (a) change the document or (b) ignore the note (record disposition `deferred` / `wontfix`)
4. v2 ships; operator sees the change (or absence of change) in the document

What's missing: agent-side acknowledgments / clarifications / counter-questions that the operator can read at-leisure on the same review surface where they made the original comment.

## Why it matters

Operator review is a fundamentally **conversational** activity, not a one-shot. Many margin notes are not "make this change" — they're "I'm not sure about this, talk me through it" or "is this premise right?" or "did you consider X?". A real editor leaves comments expecting dialogue, not just edits.

Today the only conversation channel between agent and operator is the chat interface. Two costs:

1. **Loss of spatial locality.** The margin note lives next to the prose it refers to. The chat reply lives detached, anchored only to the time it was sent. To find "what did the agent say about my Phase 4 comment?", the operator scrolls chat history hoping context survived.

2. **Loss of perusal ergonomics.** The studio is a typeset document on a wide screen — the operator can scan many comments at once, see disposition badges, navigate by margin marker. The chat interface is a vertical conversation in a terminal/IDE pane — different shape, different rhythm. For multi-comment review rounds, the operator wants to *peruse* agent responses, not *thread through* them.

Worked example from the dogfood session that surfaced this (2026-04-28):

- Operator left one margin note: *"Why do we need a default collection?"* on the line `defaultSite → defaultCollection`.
- Agent's iteration response: rewrote the bullet to surface three candidate treatments (rename / eliminate / re-term) and defer the decision to Phase 10.
- That's a substantive engagement with the question. But:
  - The operator now has to read v2 to find what happened.
  - The agent's reasoning ("I think the right move is to defer rather than pre-decide because…") doesn't live anywhere in the review surface — it's only in chat.
  - The disposition badge says `addressed` but the operator can't see the agent's framing for *how* it was addressed without reading both versions.

For a single comment, the loss is small. For a 12-comment review round on a long plan, it accumulates fast.

## Proposed shape

Add an **agent-reply margin note** affordance — short capsule responses the agent writes alongside the operator's notes, viewable in the same column. Constraints baked into the design:

1. **Capsule-length, not essay-length.** Hard cap (e.g., ~280 chars or a 3-line soft limit). The studio sidebar is for perusal, not deep argument. Long discussion still happens in chat; the agent's margin reply summarizes the chat outcome.
2. **Paired to a specific operator comment** (not free-floating). Threading model: each operator comment has 0..N agent replies anchored to it.
3. **Renders with disposition** so the operator scanning the sidebar sees `addressed: <agent capsule>` / `deferred: <reason>` / `wontfix: <reason>` inline, without having to read v2 to know.
4. **Written by the agent** during iteration — when running `deskwork iterate --dispositions <path>`, the dispositions file already accepts `reason`. Extend that mechanism: alongside (or replacing) the dispositions file, allow the agent to attach reply text per comment that the studio renders in the sidebar.
5. **Optionally surfaces a "reply-and-see-more" link** for cases where the agent's reasoning legitimately exceeds the capsule limit. The full reasoning could live in the workflow journal; the link routes to a detail view.

## Concrete implementation sketch (leaving for a future commit)

- **Workflow record**: comments already carry `id`, `range`, `text`, `category`. Add an optional `agentReplies?: AgentReply[]` field. `AgentReply` has `at` (timestamp), `text` (capsule), and optional `disposition` (matches the disposition decision).
- **`deskwork iterate`**: extend `--dispositions <path>` (or add a parallel `--replies <path>`) so the agent can pass capsule replies in addition to dispositions. Helper writes them onto the workflow record.
- **Studio sidebar**: render each operator comment as a card that includes (a) the operator's text, (b) any agent replies stacked beneath, (c) the latest disposition badge. Visual rhythm: operator on the left margin in italic; agent replies indented and in roman type with a stamp-purple accent (the editorial-press visual language deskwork already uses).
- **Reply-on-iterate UI**: at iterate time, the agent's flow is "read comments → decide dispositions → optionally compose capsule replies → run `deskwork iterate`". The studio shows v2 with the new replies threaded onto v1's comments (history is preserved across versions — the comments thread anchored to v1 stay visible when reviewing v2).

## Out of scope for the first cut

- Full multi-turn threading (agent replies → operator counter-replies → agent counter-counter-replies). v1 is "agent replies once per iteration round." Multi-turn can come later if the pattern warrants it.
- Live "agent is typing…" indicators. The studio polls; agent replies appear when iterate completes.
- Automatic chat-to-margin syncing (the agent's chat reply auto-distilled into a margin capsule). Useful but adds magic; v1 is explicit composition by the agent.

## Surfaced by

The "Source-shipped deskwork plugins (drop the bundles)" iteration session, 2026-04-28. Captured in `USAGE-JOURNAL.md` iteration #16 (next session-end). Original margin note: comment id `70d3c466-baaf-4e72-882d-241f7930d4ab` on workflow `4180c05e-c6a3-4b3d-8fc1-2100492c3f38`.
<!-- SECTION:DESCRIPTION:END -->
