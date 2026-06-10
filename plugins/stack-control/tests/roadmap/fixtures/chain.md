---
doc-grammar: roadmap
---

# roadmap — linear chain

A → B → C. A is shipped, so B is ready; C waits on B.

## design:feature/a
- status: shipped
The root capability.

## impl:feature/b
- status: planned
- depends-on: design:feature/a
Depends on A (shipped) — ready.

## impl:feature/c
- status: planned
- depends-on: impl:feature/b
Depends on B (planned) — blocked.
