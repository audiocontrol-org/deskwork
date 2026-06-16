# Contract: governed WORKFLOW.md grammar

- `WORKFLOW.md` is heading-keyed (like `ROADMAP.md`), parsed by the `src/document-model` grammar engine — the third document-primitives use.
- Two unit kinds: `phase` (publishes derive predicate, work, entrance criteria, exit criteria, next) and `transition` (publishes codename, from→to, exit-gate, ordered effects).
- The engine reads the phase vocabulary, criteria, and effect manifests FROM the document; none are hardcoded. Changing the doc changes engine behavior.
- The document is a plugin-bundled default resolved through the existing override stack: an installation override wins, else the bundled default.
- A malformed document fails loud naming the grammar violation; the engine MUST NOT fall back to built-in defaults.
- Every criterion in the document is a computable true/false predicate; an effect is a call to a governed verb from the fixed vocabulary, never prose.
