# The audit-barrage is STOCHASTIC defense-in-depth — deterministic concerns belong to the compiler/test floor

The governance mechanism (the cross-model audit-barrage) aims for **stochastic correctness, not deterministic correctness**. It is a layer of **defense in depth** that sits ON TOP of two deterministic layers — a **compiler** and **high-coverage tests** — and exists to catch what those layers structurally cannot. Putting a deterministic concern *into* the stochastic layer is a layer confusion and produces strictly-worse results than the layer that already owns it.

## The layer model (internalize this)

| Layer | Kind | Owns |
|---|---|---|
| **Compiler** (`tsc --noEmit`, etc.) | deterministic | interface contracts: removed/renamed exports, changed signatures/arity, changed required shapes — across the WHOLE program, including breaks in files this change did not touch |
| **High-coverage tests** | deterministic | behavioral regressions — does the code still do what it must |
| **Audit-barrage** (cross-model review) | **stochastic** | what types and tests CANNOT express: logic that compiles and passes but is wrong, design smells, missing cases, contradictions, prose defects. Its value is *genetic diversity of failure modes*, not re-deriving decidable facts. |

The compiler and tests are the **floor** the barrage stands on. The barrage's job is the open-ended, non-decidable layer — precisely the part where a single deterministic check can't give you confidence and you want N independent stochastic perspectives instead.

## The rule

1. **Never put a deterministic, decidable check into the audit-barrage layer.** If a question has a closed, computable answer (does it type-check? does this test pass? does this export still resolve?), it belongs to the compiler or the test suite — NOT a heuristic inside the barrage. The barrage is for questions that do *not* reduce to a deterministic check.

2. **Interface contracts are the compiler's job.** A removed/renamed export, a changed required signature/arity, or a changed required shape is a *compile error* in a typed language — caught completely, across the whole program (so a break in an UNCHANGED consumer is caught too), with zero false positives. Do not reimplement any slice of this as a regex/heuristic in the governance layer. A diff-scoped heuristic is strictly weaker than whole-program type checking: it carries both false positives and false negatives the compiler does not.

3. **The deterministic floor is a precondition, not a peer.** A green typecheck + test run should be the floor a graduation decision stands on. The stochastic barrage adds defense in depth on top of a green floor; it is not a substitute for compiling or testing, and it must not be asked to *approximate* them.

4. **For compiler-less material, the heuristic is a FALLBACK, not the default.** Untyped Python, shell, markdown, etc. have no compiler floor. A diff-level interface heuristic can earn its keep there as a best-effort fallback — but it is explicitly a fallback for the no-compiler case, never the mechanism you reach for when a compiler exists.

## How to apply

- **Before adding any check to the governance/barrage layer, ask: is this question decidable by a compiler or a test?** If yes, it does not belong in the barrage — wire the compiler/test as the floor instead.
- **When a barrage finding is something a compiler would have caught** (a "this export is gone / this signature changed" class), treat it as evidence the deterministic floor is missing or not gating — fix the floor, don't harden the heuristic.
- **When tempted to make a diff-scoped checker "smarter"** (read more files, track more cases) to catch a contract break, stop: that is the compiler's job done worse. Add/strengthen the compiler gate instead.

## Anti-patterns to refuse

- A regex/heuristic in the governance layer that reimplements type-checking, name-resolution, or signature-compatibility (the **seam pass** is the canonical example — see `multi:gap/retire-seam-pass-interface-check`).
- Treating the audit-barrage as a deterministic gate ("it found 0 interface breaks, so the interfaces are safe") — it is stochastic; deterministic safety comes from the compiler/test floor.
- Building a feature to close a "gap" in a heuristic checker when the gap only exists because the heuristic looks at a diff instead of the whole program — the compiler has no such gap. (This is exactly why the seam "unchanged-consumer" feature was NOT built; the reframing dissolved it.)
- Asking the barrage to compensate for an absent compile/test gate.

## Why this rule exists

Written 2026-06-22. Mid-burndown of `multi:feature/govern-030-hardening`, the agent had hardened the cross-chunk **seam pass** (a regex-over-diff interface checker) and proposed building an "unchanged-consumer detection" feature to close its false-negative gap. The operator pointed out this is what a compiler does in a typed language — and that the seam pass had confused the layers: it put a deterministic interface-contract concern into the stochastic barrage. The operator's framing, verbatim: *"the governance mechanism of the audit barrage aims for stochastic correctness, not deterministic correctness. It is a layer of defense in depth supported by high-coverage testing and a compiler."* Under that reframing the seam pass's interface-check collapses to redundancy (the compiler dominates it) and the "gap" vanishes by construction. This rule records the layer model so future agents don't re-confuse the stochastic layer with the deterministic floor. Cross-ref: thesis (*"stochastic correctness (cross-model audit-barrage) as the teeth"*), `stack-control-thesis.md`; roadmap node `multi:gap/retire-seam-pass-interface-check`.
