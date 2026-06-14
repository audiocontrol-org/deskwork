# Contract: Phase governance checkpoints

- A required phase cannot be accepted without a current passing checkpoint.
- A checkpoint becomes stale if any authoritative in-scope file changes after it was recorded.
- Whole-feature govern may compose from current phase checkpoints, but it cannot invent them retroactively.
- Missing or stale checkpoints fail loud with a machine-distinguishable outcome.
