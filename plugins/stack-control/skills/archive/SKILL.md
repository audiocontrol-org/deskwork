---
name: archive
description: "Keep a live governed document lean by moving its terminal-status items into a sibling archive file (with an in-archive provenance ledger). Dry-run first, then apply on confirmation. Wraps `stackctl archive`."
---

# /stack-control:archive

Move the **settled** items out of a live governed document into its sibling archive, so the live surface stays crisp. An item is settled when its status is one of the grammar's **terminal** statuses (e.g. a roadmap row marked `shipped`, an inbox entry marked `promoted`/`dropped`). The moved items land in `<doc>-archive.md`; a provenance ledger recording what moved and when lives **in that archive file**, never in the live document.

> Per `.claude/rules/enforcement-lives-in-skills.md`, the discipline lives in this skill body + the `stackctl archive` verb it calls — it travels with the plugin install, not a git hook.

## Preconditions

- The document is **governable**: it declares a block-level grammar (embedded `<!-- doc-grammar: … -->` comment, or a `doc-grammar: <id>` frontmatter reference resolving to a project-override or built-in grammar). A document with no resolvable grammar is not governable — `archive` fails loud, and the fix is to declare a grammar, not to work around it.
- The document is committed (version control is the recovery path if an apply is interrupted — commit before a mutating `--apply`).

## Steps

1. **Dry-run first (always).** Report what *would* move; write nothing:

   ```bash
   plugins/stack-control/bin/stackctl archive --doc <path>
   ```

   It lists each terminal-status Unit (identifier, status, line span) and the archive target. Read the list to the operator. Zero terminal-status Units → there is nothing to do; stop.

2. **Confirm with the operator.** Show the planned moves. Only proceed when the operator confirms — `archive` mutates the live document.

3. **Apply.**

   ```bash
   plugins/stack-control/bin/stackctl archive --doc <path> --apply
   ```

   The moved Units are cut from the live document and appended to `<doc>-archive.md` (created if absent), each ledger entry keyed by identifier. The live document keeps zero bookkeeping.

4. **Report the outcome.** State which Units moved and the archive path. To bring one back, use `/stack-control:unarchive`.

## Fail-loud cases (exit non-zero, zero writes)

- Ungovernable document, an ambiguous grammar declaration, a parse failure, or an identifier-invariant violation → usage/config error (exit 2). Fix the document; do not work around it.
- A write failure → exit 1; the live document is recoverable from version control.
