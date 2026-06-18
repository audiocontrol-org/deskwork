---
id: TASK-242
title: >-
  roadmap CLI has no edge-mutation verb for existing nodes — clustering existing
  items forces hand-editing the governed ROADMAP.md (offing dogfood)
status: To Do
assignee: []
created_date: '2026-06-18 14:15'
labels:
  - agent-found
  - 'type:gap'
dependencies: []
references:
  - >-
    offing session d98fc4fe-cbc8-41e2-941c-50c9c6505954 (2026-06-18);
    ~/work/offing ROADMAP.md commit 6ba8603
ordinal: 242000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dogfood evidence — the 'offing' project (WordPress dev-env lab), Claude Code session
d98fc4fe-cbc8-41e2-941c-50c9c6505954, 2026-06-18. After seeding its roadmap, the operator
asked, in plain language: "group the cluster you noticed. the change-runbook is probably what
everything depends on. then env-promotion, then behavior-validation." This is the canonical
clustering operation — group N existing items under a parent + chain their dependencies.

WHAT WENT WRONG
The stack-control roadmap CLI (stackctl roadmap) has verbs to CREATE nodes (add) and to
advance/decompose/reclassify/defer — but NO verb to add, remove, or move an EDGE (part-of /
depends-on) on an EXISTING node. The agent probed this live:

  $ stackctl roadmap add design:feature/behavior-validation --depends-on impl:feature/multi-variant-lab
  roadmap: identifier invariant violation: 'design:feature/behavior-validation' is not unique
  across the document ∪ its archive (FR-005)

So `add` correctly refuses an existing id (FR-005 uniqueness), and there is no edge-edit path.
The agent's own conclusion (verbatim): "add refuses existing ids and there's no edge-edit/remove
verb — so the CLI can create the parent node, but adding part-of edges to the existing three
nodes and re-pointing behavior-validation's dependency has no CLI path. The only mechanism is
editing the governed markdown directly."

The clustering the operator asked for required THREE edge mutations on existing nodes:
  1. add `part-of: change-pipeline` to change-runbook   (node had no part-of edge at all)
  2. add `part-of: change-pipeline` to env-promotion     (ditto)
  3. add `part-of: change-pipeline` + re-point depends-on (lab → env-promotion) on behavior-validation

WORKAROUND USED (and why it's a governance violation)
The agent created the parent epic via the sanctioned `roadmap add`, then HAND-EDITED ROADMAP.md
with four Edit calls to attach the part-of edges and re-point the depends-on — directly
contradicting the governed document's own header: "manage the graph with stackctl roadmap — do
not hand-edit." It then re-ran `roadmap order` to revalidate (acyclic / no dangling), which
passed. The CLI forced the agent to break the document's stated discipline to perform a routine
clustering request, then leaned on the loader's read-side validation as the only safety net.

ROOT CAUSE
The roadmap mutation surface is create-only for nodes and absent for edges-on-existing-nodes.
The governed-doc contract ("do not hand-edit") is only credible if every graph mutation the
operator can ask for in words has a CLI path. Clustering — the most natural roadmap-curation
verb an operator reaches for — has none.

REMEDIATION NEEDED
- Edge-mutation verbs on existing nodes: add-edge / remove-edge for part-of and depends-on
  (dry-run then --apply; graph-revalidating: refuse cycle / dangling / self / dup; zero-write
  on failure — same guarantees the loader gives on read).
- A one-move `roadmap cluster` (a.k.a. group) convenience that does the whole operator request
  atomically: create-or-reuse a parent epic + attach part-of on N existing children
  (+ optional --chain to wire a depends-on sequence among them) in a single governed,
  revalidating call. This is the literal shape the operator asked for.

RELATIONSHIP TO EXISTING ROADMAP
impl:gap/roadmap-reparent-verb (TASK-137) is the nearest existing item but is NARROWER — it
only MOVES an existing edge between nodes. The offing case needed to ADD a brand-new part-of
edge to nodes that had none, plus the high-level cluster convenience. Operator decision needed:
fold the broader edge-mutation + cluster surface into the reparent gap, or keep this as a
sibling that supersedes it. Flagging the merge decision rather than making it (capture ≠ scope).
<!-- SECTION:DESCRIPTION:END -->
