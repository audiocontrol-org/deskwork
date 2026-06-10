# Data Model: session-skills (Phase 1)

Types are TypeScript-shaped (the implementation language) but described at the design level. New types live under `src/session/`; the config extension modifies 009's `src/config/types.ts`.

## 1. Config extension — three new `WorkingFileKey`s (modifies 009's `src/config/types.ts`)

009's `WorkingFileKey` union (`roadmap | inbox | backlog | audit_log | feature_audit_log_pattern`) gains three keys this feature owns. The wire format (snake_case) and in-memory shape (camelCase) follow 009's translation convention.

| Key (wire) | In-memory | Kind | Audience-split default (when unconfigured) | Consumed by |
|---|---|---|---|---|
| `journal` | `journal` | file | **human doc → installation root**, `DEVELOPMENT-NOTES.md` | session-end writes, session-start reads (latest entry) |
| `tooling_feedback` | `toolingFeedback` | file | **human doc → installation root**, `tooling-feedback.md` | session-end appends |
| `clone_scope` | `cloneScope` | dir | **internal → installation root** (scan the whole installation subtree) | session-end clone-snapshot |

```yaml
# .stack-control/config.yaml — paths additions (all optional; per-file override > base_dir > default)
paths:
  journal: "DEVELOPMENT-NOTES.md"
  tooling_feedback: "tooling-feedback.md"
  clone_scope: "."
```

- Validation reuses 009's rules verbatim (non-empty, resolves **within** root, no cross-key collision, no unknown top-level keys) — the three keys add no new validation kind.
- `ResolvedPaths` (009) gains `journal`, `toolingFeedback`, `cloneScope` resolved-absolute fields.
- **Extensibility, not redesign**: this is the additive change 009's FR-001 anticipates; no change to the resolver or loader algorithm.

## 2. `OrientationReport` (session-start output; not persisted)

```
OrientationReport {
  installationRoot: string
  roadmap:    { ready: RoadmapItem[]; blocked: RoadmapItem[] }   // from the 006 roadmap reasoner
  activeSpec: ChainPosition | null                               // null = no active spec (FR-005)
  latestJournalEntry: JournalEntrySummary | null                 // null = first session / empty journal
  openBacklog: BacklogItemRef[]                                  // from backlog list() (008); NEVER GitHub issues
  staleness:  StalenessSignal                                    // advisory; may be { kind: 'skipped', reason }
}
```

- Read-only; rendered to stdout by `report.ts`. Re-running produces an identical report with 0 on-disk changes (SC-008).

## 3. `ChainPosition` (Spec Kit authoring-chain inference)

```
ChainPosition {
  featureDir: string            // from .specify/feature.json `feature_directory`
  artifactsPresent: SpecKitArtifact[]   // subset of: spec, plan, research, data-model, contracts, checklists, tasks
  nextStep: SpecKitStep         // inferred next /speckit-* step
}
SpecKitStep = 'clarify' | 'plan' | 'checklist' | 'tasks' | 'analyze' | 'implement' | 'complete'
```

- Inference is a pure function of the present-artifact set (research D4). `null` when `feature.json` is absent or points nowhere (FR-005).

## 4. `StalenessSignal` (branch-staleness; advisory)

```
StalenessSignal =
  | { kind: 'behind'; base: string; behindCount: number }       // surface the advisory (FR-016)
  | { kind: 'current' }                                          // level or ahead → no warning
  | { kind: 'skipped'; reason: string }                          // base undeterminable / detached HEAD (FR-017)
```

- `base` resolution: upstream-if-set, else repo default branch (research D3). Never blocks the session regardless of kind.

## 5. `JournalEntry` (session-end output)

```
JournalEntry {
  // auto-derived (mechanical/quantitative — from git log <boundary>..HEAD; never fabricated)
  date: string
  commits:        { count: number; subjects: string[] }
  filesChanged:   number
  backlogTouched: BacklogItemRef[]            // IDs referenced in session commits (research D6)
  // narrative slots — emitted empty for the agent to compose (operator-editable before commit)
  goal, accomplished, didntWork, courseCorrections, insights: string   // slots, not auto-written
}
```

- Shape follows the project's **configured journal template** when present, else a documented default (FR-013) — never a baked-in deskwork taxonomy.
- Appended (append-only) to the resolved `journal` working file; an honest sparse entry is still written when little progressed (FR-006).
- Session-boundary SHA: explicit flag → merge-base with the base branch → `HEAD~N` fallback (research D5).

## 6. `BacklogItemRef` (projection of 008's `BacklogItem`)

```
BacklogItemRef { id: string; title: string; status: string }   // projected from src/backlog/backend.ts BacklogItem
```

- session-start lists open items; session-end surfaces the progressed (commit-referenced) subset. **0 status transitions** are written by either skill (operator owns the transition, SC-006).

## 7. `SessionEndReport` (session-end summary)

```
SessionEndReport {
  journalEntryPath: string
  toolingFrictionCaptured: boolean
  cloneSnapshot: { ran: boolean; newDuplication: number } | { skipped: string }
  backlogProgressed: BacklogItemRef[]
  commit: { sha: string; pushed: boolean; pushError?: string }   // pushed=false + pushError ⇒ close reported not-fully-complete
  uncommittedNonDocWarning?: string                              // FR-011 (warn, not block)
}
```

## Relationships

- `OrientationReport` composes `ChainPosition`, `StalenessSignal`, `BacklogItemRef[]`, and the roadmap reasoner's output — all read-only.
- `JournalEntry.backlogTouched` and `SessionEndReport.backlogProgressed` share the same commit-reference derivation (research D6).
- All file locations in every type are resolved through 009's `ResolvedPaths` (the config extension keys) — no type carries a hardcoded path.
