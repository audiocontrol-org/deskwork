---
doc-grammar: roadmap
---

# roadmap — deferred-until set

A is shipped, so B's hard dep is satisfied — but a prose `deferred-until`
condition blocks B's readiness until the operator clears it.

## design:feature/a
- status: shipped
The dependency (shipped).

## impl:feature/b
- status: planned
- depends-on: design:feature/a
- deferred-until: after the migration milestone closes
Hard dep satisfied, but deferred by a prose condition.
