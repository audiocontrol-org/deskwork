# Contract: govern-convergence record (mode-keyed; TASK-19)

- A single record mechanism keyed by `mode` (`spec` | `impl`) records that governance converged for an item.
- It is written inside the installation domain when governance converges; it is durable (survives across sessions).
- `govern --mode spec` writes a `spec` record; impl govern writes an `impl` record. The mechanism is symmetric — one shape, two modes.
- Phase derivation and the exit gates read it: the `spec` record decides `specifying → implementing`; the `impl` record decides `governing → shipped` (recorded ∧ converged).
- No agent assertion, chain-completion, or tasks-completion may substitute for the record.
- The record carries a scope fingerprint (reusing the 021 checkpoint fingerprint shape) so a later in-scope change can mark it stale.
