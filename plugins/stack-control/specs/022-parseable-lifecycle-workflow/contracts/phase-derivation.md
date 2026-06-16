# Contract: phase derivation

- Phase is a pure function of artifacts that already exist; no stored phase field is written anywhere.
- The mapping is total (every observable state → exactly one phase or one terminal side-state) and deterministic (identical inputs → identical phase).
- Derivation inputs: backlog presence; roadmap node status; `design:` pointer; `spec:` pointer; the `analyze-clean:` node marker (default `specifying → implementing` signal); spec-govern convergence record (retained, opt-in); `tasks.md` completion; impl-govern convergence record; release tag.
- `designing` is derived from the `design:` pointer being set (NOT from the design file existing).
- `specifying → implementing` is decided **by default** by `speckit-analyze`-clean — read mechanically from the `analyze-clean:` node marker set by the spec chain (spec audit-barrage parked from the default workflow, 2026-06-16; TASK-138). The spec-govern convergence record is a **retained, opt-in** stricter gate (used only when the operator runs `govern --mode spec`), never default-required while parked. `governing → shipped` is decided by the impl-govern convergence record (recorded ∧ converged) — required and mechanical, never inferred from chain/tasks-completion or agent assertion.
- Terminal side-states `blocked` / `cancelled` / `retired` are reachable from any phase via an induct-style move and are reported as-is by the query verbs.
- Naming note: the workflow **phase** `planned` is distinct from the roadmap node **status** `planned`. A `status: planned` node derives to phase `designing` once its `design:` pointer is set; it derives to phase `planned` only while no `design:` pointer exists.
