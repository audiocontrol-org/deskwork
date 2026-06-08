---
doc-grammar: roadmap
---

# roadmap — diamond

A → {B, C} → D. A shipped; B and C ready; D waits on both.

## design:feature/a
- status: shipped
The shared root.

## impl:feature/b
- status: planned
- depends-on: design:feature/a
- part-of: design:feature/a
Left arm.

## impl:feature/c
- status: planned
- depends-on: design:feature/a
Right arm.

## multi:feature/d
- status: planned
- depends-on: impl:feature/b, impl:feature/c
The join — waits on both arms.
