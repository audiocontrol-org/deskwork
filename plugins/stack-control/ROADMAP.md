---
doc-grammar: roadmap
---

# stack-control — roadmap

A governed, plugin-local queue of stack-control's features. Each row is a Unit
keyed by its `<phase>/<slug>` codename; rows are ordered by the `phase` relation
`[design, plan, impl, multi]` (NOT alphabetical), tie-broken by codename.
Statuses: `planned`, `in-flight` (active), and the terminal `shipped` /
`cancelled` / `retired`. Keep it lean with `/stack-control:curate` — shipped and
retired rows archive out. The grammar declares a reconciliation hook (the seam
a future roadmap-discipline protocol plugs into); `curate` recognizes it but
does not execute it.

| Codename | Feature | Scope | Status |
|---|---|---|---|
| design/insight-capture | Low-friction insight capture | One-move out-of-sequence capture; capture ≠ scope | planned |
| design/spec-authoring | Author specs at promise altitude | The prevention half of spec quality | planned |
| design/spec-governance | Govern the spec, not just the implementation | Cross-model barrage over a spec; mode-aware lens shipped | in-flight |
| design/document-primitives | Generalized archive / unarchive / curate | This feature — self-describing governed documents | in-flight |
| design/migrate-scope-discovery | Migrate scope-discovery in-house | Per-codebase clone detection; vendor the detector | planned |
| impl/governance | Governance as a Spec Kit after_implement extension | The deskwork-governance barrage hook | shipped |
| impl/execution-engine | Parallel multi-backend execution engine | Worktree-isolated, capability-selected fan-out | planned |
| multi/front-door | stack-control front door (plugin + stackctl + native execution) | The self-hosting bootstrap | shipped |
| multi/migrate-audit-barrage | Migrate audit-barrage + the audit protocol in-house | Convergence criterion + finding state machine | planned |
| multi/migrate-session-skills | Migrate session-start / session-end | Session lifecycle skills move over | planned |
| multi/control-plane-frontend | Fuller control-plane frontend | Spec negotiation + scope/barrage + engine-run surfaces | planned |
| multi/retire-dw-lifecycle | Reach parity, then retire the predecessor | Absorb-then-retire endgame | planned |
