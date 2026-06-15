## Inventory vs. discovery — finding categories

A green run against registered patterns is NOT the same as "no novel anti-patterns." See discovery-agents/README.md for the inventory-vs-discovery split; the categories below derive directly from each finding's status + provenance.

- **Registered-pattern matches (inventory):** 0
  — status_provenance.provenance_source ∈ {operator-authored, install-seed} AND source_status ∈ {blessed, cursed}. The catalog said to look for these shapes; the scanner found them.
- **Discovered candidates (architectural; from `discovered_candidates:`):** 17
  — mediation-layer clusters of raw findings the catalog doesn't currently cover. Operator triages architecture-scale; orchestrator-agent translates to line-level catalog edits.
- **Novel-shape candidates (per-handler):** 0
  — per-handler findings whose provenance source is orchestrator-agent / llm-judge-proposed / promoted-from-candidate, OR whose source-status is `pending`. Triage these into the relevant catalog (status: blessed / cursed / ignore) via `/dw-lifecycle:implement`'s mediation flow.

Operator action: review the 17 discovered candidate cluster(s) + 0 novel-shape candidate finding(s) BEFORE treating this run as "all clear." A non-zero candidate count is the signal the catalog is not yet exhaustive.

## Synthesizer notes

- read 37 new audit-log entries (watermark → AUDIT-20260606-26 (claude-03 + codex-01; cross-model))
- audit-log update: AUDIT-20260605-01 (claude-01 + claude-03 + claude-04 + codex-01 + codex-03; cross-model) (status: fixed-55e23a571aacbb3ebc78edf7bb58f5e1d3fd16e3)
- audit-log update: AUDIT-20260605-02 (claude-02 + codex-02; cross-model) (status: fixed-55e23a571aacbb3ebc78edf7bb58f5e1d3fd16e3)
- audit-log update: AUDIT-20260605-03 (status: fixed-55e23a571aacbb3ebc78edf7bb58f5e1d3fd16e3)
- audit-log update: AUDIT-20260605-04 (status: informational)
- audit-log update: AUDIT-20260605-05 (claude-01 + claude-03 + codex-02; cross-model) (status: fixed-85e79ba4f581dd64f529467e09a71c60f6315045)
- audit-log update: AUDIT-20260605-06 (status: fixed-85e79ba4f581dd64f529467e09a71c60f6315045)
- audit-log update: AUDIT-20260605-07 (status: fixed-85e79ba4f581dd64f529467e09a71c60f6315045)
- audit-log update: AUDIT-20260605-08 (claude-01 + claude-03 + claude-04 + codex-01; cross-model) (status: fixed-6d99c0ea699a5e59aca025438c6c301842b6e642)
- audit-log update: AUDIT-20260605-09 (status: fixed-6d99c0ea699a5e59aca025438c6c301842b6e642)
- audit-log update: AUDIT-20260605-10 (status: fixed-19af9658afef2509a21c411dfec3edda8e2a3c4e)
- audit-log update: AUDIT-20260605-11 (status: fixed-19af9658afef2509a21c411dfec3edda8e2a3c4e)
- audit-log update: AUDIT-20260605-12 (status: informational)
- audit-log update: AUDIT-20260606-01 (claude-01 + claude-02; cross-model with codex on the surface) (status: fixed-a718683ccaa739fd213ac797bff59ed96460d721)
- audit-log update: AUDIT-20260606-02 (codex-01) (status: fixed-a718683ccaa739fd213ac797bff59ed96460d721)
- audit-log update: AUDIT-20260606-03 (codex-02 + claude-03; cross-model) (status: fixed-a718683ccaa739fd213ac797bff59ed96460d721)
- audit-log update: AUDIT-20260606-04 (claude-01) (status: fixed-512e312ccf4a004e28be5ada0aa8d1fa78a94ebc)
- audit-log update: AUDIT-20260606-05 (claude-02) (status: fixed-512e312ccf4a004e28be5ada0aa8d1fa78a94ebc)
- audit-log update: AUDIT-20260606-06 (codex-01) (status: fixed-512e312ccf4a004e28be5ada0aa8d1fa78a94ebc)
- audit-log update: AUDIT-20260606-07 (claude-01; codex CLEAN — convergence signature) (status: acknowledged-slush-pile-2026-06-06)
- audit-log update: AUDIT-20260606-08 (claude-01 + codex-01; cross-model) (status: fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e)
- audit-log update: AUDIT-20260606-10 (claude-02) (status: fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e)
- audit-log update: AUDIT-20260606-11 (claude-03) (status: fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e)
- audit-log update: AUDIT-20260606-12 (claude-04) (status: fixed-b8a9e5912c2692d38a4469d1f6252238b575d51e)
- audit-log update: AUDIT-20260606-13 (claude-01) (status: fixed-efe3f2106e8a58e28ffe87c1d5d12781b6c60595)
- audit-log update: AUDIT-20260606-14 (claude-02 + codex-01; cross-model) (status: fixed-efe3f2106e8a58e28ffe87c1d5d12781b6c60595)
- audit-log update: AUDIT-20260606-15 (claude-01) (status: fixed-a7c1ef0e5c13778e2d706707a5ea9fd2e723db39)
- audit-log update: AUDIT-20260606-16 (claude-02) (status: fixed-a7c1ef0e5c13778e2d706707a5ea9fd2e723db39)
- audit-log update: AUDIT-20260606-17 (codex-01) (status: fixed-a7c1ef0e5c13778e2d706707a5ea9fd2e723db39)
- audit-log update: AUDIT-20260606-18 (claude-01 + codex-01; cross-model) (status: fixed-2fe77b14043eef692c0bb2b788cbc2cd5f76695e)
- audit-log update: AUDIT-20260606-19 (claude-02) (status: fixed-2fe77b14043eef692c0bb2b788cbc2cd5f76695e)
- audit-log update: AUDIT-20260606-20 (claude-03) (status: informational)
- audit-log update: AUDIT-20260606-21 (status: acknowledged-slush-pile-2026-06-06)
- audit-log update: AUDIT-20260606-22 (claude-01) (status: fixed-39f4c4e952e3eb313e4ea42023cc02f748d1bd40)
- audit-log update: AUDIT-20260606-23 (claude-02) (status: informational)
- audit-log update: AUDIT-20260606-24 (claude-01) (status: fixed-e281dad397e42a9afae5727acb312e671e27df0d)
- audit-log update: AUDIT-20260606-25 (claude-02) (status: fixed-e281dad397e42a9afae5727acb312e671e27df0d)
- audit-log update: AUDIT-20260606-26 (claude-03 + codex-01; cross-model) (status: fixed-e281dad397e42a9afae5727acb312e671e27df0d)
- PRD has no References/Appendix section; reference_docs[] defaulted to PRD + LAYOUT.md.
  Add this section to docs/1.0/001-IN-PROGRESS/design-control/prd.md to produce a richer manifest on re-run:

    ## References

    - **Related issues:** [#NNN](url), [#MMM](url)
    - **Related ADRs:** [docs/adr/NNN.md](path)
    - **External docs:** [Title](url)
