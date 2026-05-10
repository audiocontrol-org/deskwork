# Studio Design Proposal Archive

Durable history of design decisions for `@deskwork/studio`. Companion to `DESIGN-STANDARDS.md` (top-level): the standards doc records *what is settled*; this archive records *what was considered* — including directions that were rejected, with the reasoning. Future sessions read both before drafting new mockups so we don't relitigate decisions that already had their fair hearing.

## Layout

```
docs/studio-design/
├── README.md                                # this file
├── ACCEPTED/
│   └── <YYYY-MM-DD>-<slug>/
│       ├── brief.md                          # required
│       ├── mockup.html                       # optional — the canonical visual
│       └── …                                 # any supporting assets
└── REJECTED/
    └── <YYYY-MM-DD>-<slug>/
        ├── brief.md                          # required
        ├── mockup.html                       # optional — the canonical visual
        └── …
```

Date prefixes are the date of the decision (acceptance or rejection), not the date the entry was filed retroactively. The slug is short and describes the proposal, not the rationale.

## What goes in `brief.md`

Every brief contains the same four pieces, in order:

```markdown
---
proposal: <short description>
status: ACCEPTED | REJECTED
date: YYYY-MM-DD
feature: <relative path to motivating feature dir, or N/A>
visual: <relative path to mockup file, OR "self-contained: ./mockup.html", OR "N/A — non-visual decision">
---

# <proposal>

## What

<one paragraph: what the proposal is. What pattern, what shape, what affordance.>

## Why <accepted | rejected>

<one to three paragraphs: the rationale. For ACCEPTED, what made this the right pick. For REJECTED, what made this the wrong direction or what made another direction better. Cite the operator's framing if it shaped the decision.>

## When

<commit SHA + date if known. The implementation commit for ACCEPTED; the decision-to-retire commit for REJECTED.>

## Feature reference

<link to the motivating feature dir, e.g. docs/0.19.0/001-IN-PROGRESS/studio-mobile-first/. The brief is a checkpoint; the feature dir is the working context.>
```

The frontmatter is the searchable index; the body is the explanation. Keep briefs short — a brief that runs to multiple pages is doing the standards doc's job by accident.

## The visual reference contract

Each entry MAY have a visual (HTML/CSS mockup, screenshot, diagram). Two valid shapes:

1. **Self-contained:** the visual file lives inside the entry directory (e.g. `mockup.html`). This is the default when the visual is unique to this proposal.
2. **Reference to elsewhere in the tree:** the brief's `visual:` frontmatter points at a relative path elsewhere in the repo. Use this when the same visual file backs multiple archive entries (e.g. a single mockup that proposed several decisions, only some of which were picked).

**Never copy the file into the entry directory and ALSO leave a copy elsewhere.** A copy creates two sources of truth that drift. The single source of truth lives at one path; the brief points at it.

Some decisions are non-visual (a removal, a verb-naming choice, a schema decision). For those, the `visual:` frontmatter is `N/A — non-visual decision`. Keep the brief; skip the visual.

## When to file an entry

Per `.claude/rules/design-standards.md`:

- **ACCEPTED:** every operator-approved design pick. File at the time of acceptance — same commit as the implementation or the mockup-pick commit.
- **REJECTED:** every alternative the operator declined OR that was retired during exploration. File at the time of rejection.

Single-pass rejections — mockup variants the operator passed over in favor of one direction — get an entry too. The single-pass rejections are arguably the most important entries: they're the durable record that prevents next session's agent from re-proposing the same direction. The 2026-05-09 dashboard sessions repeatedly resurrected retired patterns because nothing was written down; the archive exists so that doesn't happen again.

## What this archive is NOT

- **Not the standards spec.** The standards spec (`DESIGN-STANDARDS.md`) records *what is settled* — vocabulary, deltas, retired patterns. The archive records *what was explored*. They are complementary, not duplicates.
- **Not a replacement for feature documentation.** Feature dirs (`docs/<version>/<status>/<slug>/`) are the working context for a feature; the archive is the design-decision checkpoint. A feature can ship multiple ACCEPTED entries (one per global-impact decision); a feature is not itself an archive entry.
- **Not a code-change log.** Implementation commits are tracked in git history. The archive is for *design* decisions — the why, not the what.
