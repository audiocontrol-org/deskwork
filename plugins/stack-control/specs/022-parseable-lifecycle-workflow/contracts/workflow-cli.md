# Contract: workflow CLI verbs

- `workflow status {item}` reports whether the current stage's exit criteria are all met and enumerates the unmet ones (M of N); read-only, writes nothing.
- `workflow can-enter {item} {stage}` reports whether the target stage's entrance criteria are met and what is missing; read-only.
- `workflow next {item}` derives the current phase, names the next transition + the WORK skill/verb, and previews the effects an advance would fire; read-only.
- `workflow advance {item}` defaults to a dry-run preview (writes nothing); `--apply` fires the transition's effect manifest atomically (commit-last; restore touched paths on any pre-commit failure; refuse loud on a dirty advance-touched tree).
- `workflow link-design {item} {design-doc}` sets the node `design:` pointer; `workflow link-spec {item} {spec-dir}` sets the node `spec:` pointer. Both are governed verbs in the fixed effect vocabulary.
- Every state-writing verb anchors its writes in the nearest-enclosing installation; with no enclosing installation it refuses loud (`stackctl setup`).
- Query verbs are deterministic: identical inputs → identical output, zero writes, safe to re-run.
