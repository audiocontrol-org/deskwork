## Inventory vs. discovery — finding categories

A green run against registered patterns is NOT the same as "no novel anti-patterns." See discovery-agents/README.md for the inventory-vs-discovery split; the categories below derive directly from each finding's status + provenance.

clean — no findings across registered-pattern, discovered-candidate, or novel-shape-candidate buckets.

## Synthesizer notes

- PRD has no References/Appendix section; reference_docs[] defaulted to PRD + LAYOUT.md.
  Add this section to docs/1.0/001-IN-PROGRESS/graphical-entries/scope-inventory/widen-runs/20260528T061143Z-89b7a1/augmented-prd.md to produce a richer manifest on re-run:

    ## References

    - **Related issues:** [#NNN](url), [#MMM](url)
    - **Related ADRs:** [docs/adr/NNN.md](path)
    - **External docs:** [Title](url)
- No regime-holdout-detector or adopter-manifest-checker findings supplied; manifest omits `regime_holdouts:` section. Run the agents to surface anti-pattern / adopter-manifest / editor-symmetry / deprecation holdouts.
