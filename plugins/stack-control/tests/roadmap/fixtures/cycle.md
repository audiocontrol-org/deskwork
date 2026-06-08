---
doc-grammar: roadmap
---

# roadmap — dependency cycle (must fail loud)

## impl:feature/a
- status: planned
- depends-on: impl:feature/b
Cycle: A waits on B.

## impl:feature/b
- status: planned
- depends-on: impl:feature/a
Cycle: B waits on A.
