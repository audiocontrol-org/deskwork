---
doc-grammar: roadmap
---

# roadmap — terminal status still live (cancelled dependency)

A terminal-status item (cancelled) is still present in the document (a content
database preserves terminal states). A dependent on a cancelled item is
permanently blocked — never silently treated as ready.

## design:feature/a
- status: shipped
A shipped dependency.

## impl:feature/b
- status: cancelled
Cancelled — terminal, but still recorded.

## multi:feature/d
- status: planned
- depends-on: impl:feature/b
Depends on a cancelled item — permanently blocked.

## multi:feature/e
- status: planned
- depends-on: design:feature/a
Depends only on a shipped item — ready.
