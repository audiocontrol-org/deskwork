# Contract: govern-convergence record (mode-keyed; TASK-19)

- A single record mechanism keyed by `mode` (`spec` | `impl`) records that governance converged for an item.
- It is written inside the installation domain when governance converges; it is durable (survives across sessions).
- `govern --mode spec` writes a `spec` record; impl govern writes an `impl` record. The mechanism is symmetric — one shape, two modes.
- Phase derivation and the exit gates read it: the `impl` record decides `governing → shipped` (recorded ∧ converged) — required and mechanical. The `spec` record is the **opt-in** `specifying → implementing` signal (used only when the operator runs `govern --mode spec`); **by default** `specifying → implementing` derives from `speckit-analyze`-clean (the `analyze-clean:` node marker), because spec audit-barrage is parked from the default workflow (2026-06-16; re-enable tracked as TASK-138). The `spec` mode is retained in the mechanism so re-enabling its gate is a flag flip, not a re-design.
- For the **impl** record (and the **spec** record when its opt-in gate is in use): no agent assertion, chain-completion, or tasks-completion may substitute for the record.
- The record carries a scope fingerprint (reusing the 021 checkpoint fingerprint shape) so a later in-scope change can mark it stale.
