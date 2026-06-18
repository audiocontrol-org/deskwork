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

SECOND FRICTION — DISCOVERABILITY (agents burn cycles probing the surface every session)
Before it could even hit the capability wall, the agent spent a run of turns just trying to
LEARN how to mutate the roadmap — and so does every fresh agent. Observed in the same session:
  - ran `stackctl roadmap --help` and `stackctl roadmap add --help` → both error
    ("unknown flag --help"); there is no help surface.
  - added a node with a bogus status deliberately "to surface the vocabulary" — the only way to
    discover the valid status set is to trip the error.
  - tested `add` on an existing id and `reclassify` on a no-op just "to see behavior."
  - read the governed doc's grammar BY HAND (the `- depends-on:` / `- part-of:` metadata-line
    format) because nothing tells an agent how the edges are written.
Compounding it: a no-subaction `stackctl roadmap` prints only `usage: roadmap <next|blocked|add>`,
yet the real subaction set is next / blocked / blocks / order / graph / add / advance / decompose
/ reclassify / defer / reconcile / close-related — discoverable only by triggering an
unknown-subaction error. The mutation surface is effectively undocumented at the point of use.

REMEDIATION NEEDED
- Edge-mutation verbs on existing nodes: add-edge / remove-edge / move-edge (reparent) for
  part-of and depends-on (dry-run then --apply; graph-revalidating: refuse cycle / dangling /
  self / dup; zero-write on failure — same guarantees the loader gives on read). This absorbs
  the former reparent gap (TASK-137 = the move-edge case).
- A one-move `roadmap cluster` (a.k.a. group) convenience that does the whole operator request
  atomically: create-or-reuse a parent epic + attach part-of on N existing children
  (+ optional --chain to wire a depends-on sequence among them) in a single governed,
  revalidating call. This is the literal shape the operator asked for.
- Self-documenting discoverability so adopting agents stop probing: working `roadmap --help`
  and per-subaction `--help` that enumerate the full verb + flag set and the status vocabulary;
  a COMPLETE top-level usage line (not the truncated `<next|blocked|add>`); and a governed
  ROADMAP.md header that names the mutation verbs with a worked clustering example instead of a
  bare "manage with stackctl roadmap — do not hand-edit." It should be super-obvious to a fresh
  agent how to use AND mutate the roadmap without probing.

RELATIONSHIP TO EXISTING ROADMAP — FOLD DECIDED (2026-06-18)
impl:gap/roadmap-reparent-verb (TASK-137) was the nearest existing item but NARROWER — it only
MOVES an existing edge. Operator decision (this session): FOLD it in. The standalone reparent
roadmap node was retired and TASK-137 re-pointed to impl:gap/roadmap-edge-mutation-and-cluster,
which now carries all three parts above (move-edge = part 1). This task (TASK-242) is the
backing evidence for that node.
<!-- SECTION:DESCRIPTION:END -->
