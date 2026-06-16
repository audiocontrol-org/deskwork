# Contract: phase derivation

- Phase is a pure function of artifacts that already exist; no stored phase field is written anywhere.
- The mapping is total (every observable state → exactly one phase or one terminal side-state) and deterministic (identical inputs → identical phase).
- Derivation inputs: backlog presence; roadmap node status; `design:` pointer; `spec:` pointer; spec-govern convergence record; `tasks.md` completion; impl-govern convergence record; release tag.
- `designing` is derived from the `design:` pointer being set (NOT from the design file existing).
- `specifying → implementing` is decided by the spec-govern convergence record; `governing → shipped` by the impl-govern convergence record (recorded ∧ converged) — never inferred from chain/tasks-completion or agent assertion.
- Terminal side-states `blocked` / `cancelled` / `retired` are reachable from any phase via an induct-style move and are reported as-is by the query verbs.
