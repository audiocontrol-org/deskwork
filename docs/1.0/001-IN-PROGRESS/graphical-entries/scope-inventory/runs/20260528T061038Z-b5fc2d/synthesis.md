## Inventory vs. discovery — finding categories

A green run against registered patterns is NOT the same as "no novel anti-patterns." See discovery-agents/README.md for the inventory-vs-discovery split; the categories below derive directly from each finding's status + provenance.

- **Registered-pattern matches (inventory):** 3
  — status_provenance.provenance_source ∈ {operator-authored, install-seed} AND source_status ∈ {blessed, cursed}. The catalog said to look for these shapes; the scanner found them.
- **Discovered candidates (architectural; from `discovered_candidates:`):** 0
  — mediation-layer clusters of raw findings the catalog doesn't currently cover. Operator triages architecture-scale; orchestrator-agent translates to line-level catalog edits.
- **Novel-shape candidates (per-handler):** 0
  — per-handler findings whose provenance source is orchestrator-agent / llm-judge-proposed / promoted-from-candidate, OR whose source-status is `pending`. Triage these into the relevant catalog (status: blessed / cursed / ignore) via `/dw-lifecycle:implement`'s mediation flow.

Per-bucket breakdown (registered-pattern matches / novel-shape candidates):

- anti-patterns: 0 / 0
- adopter-manifests: 0 / 0
- editor-symmetry: 0 / 0
- deprecations: 3 / 0

## Synthesizer notes

- PRD has no References/Appendix section; reference_docs[] defaulted to PRD + LAYOUT.md.
  Add this section to docs/1.0/001-IN-PROGRESS/graphical-entries/prd.md to produce a richer manifest on re-run:

    ## References

    - **Related issues:** [#NNN](url), [#MMM](url)
    - **Related ADRs:** [docs/adr/NNN.md](path)
    - **External docs:** [Title](url)
