# Implementation Plan: Audit protocol friction burndown

**Branch**: `feature/stack-control` | **Date**: 2026-06-13 | **Spec**: `specs/021-audit-protocol-friction-burndown/spec.md`

**Input**: Feature specification from `/specs/021-audit-protocol-friction-burndown/spec.md`

## Summary

Harden the audit protocol around three P1 seams:

1. enforce required per-phase govern checkpoints mechanically
2. right-size phase boundaries both prospectively and against the actual rendered payload
3. negotiate the audit fleet autonomously before remediation payload assembly

The implementation extends the existing govern / barrage path rather than replacing it. The main design move is to introduce explicit checkpoint, boundary-sizing, and fleet-negotiation records so the protocol can reason mechanically about phase freshness, payload fit, and lane selection.

## Technical Context

**Language/Version**: TypeScript strict mode on Node.js

**Primary Dependencies**: existing stack-control CLI modules, Vitest, markdown-backed spec / backlog artifacts

**Storage**: on-disk markdown and JSON/YAML records under the stack-control installation

**Testing**: Vitest integration and unit tests plus fixture-based CLI runs

**Target Platform**: local CLI execution in stack-control installations on macOS / Linux

**Project Type**: plugin CLI / control-plane workflow layer

**Performance Goals**:

- reject oversized phase payloads before expensive barrage runs
- keep fleet negotiation out of remediation payload assembly
- preserve or improve current govern latency on already-right-sized phases

**Constraints**:

- no silent fallbacks
- one authoritative installation anchor per govern run
- no provider-specific logic in the external contract
- new modules should keep touched files under the repository size cap

**Scale/Scope**:

- multi-phase Spec Kit specs authored through the stack-control front door
- small to medium auditor fleets with mixed availability / capability
- nested installations and rename-heavy diffs must remain supported

## Constitution Check

- **I. TDD first**: PASS. Each story lands through unit / integration fixtures before behavior changes.
- **II. Integration-first capture**: PASS. Open backlog evidence is being absorbed rather than cut away.
- **III. Capability, not provider identity**: PASS. Lane selection is based on capability profiles and payload envelopes, not hard-coded vendor preference.
- **IV. Keep plugin boundaries clean**: PASS. Work stays inside `plugins/stack-control`.
- **V. No fallbacks**: PASS. Oversized boundaries, missing checkpoints, and unviable fleets all fail loud.
- **VI. Strict typing / composition**: PASS. The plan adds focused protocol records and resolver modules instead of deepening existing monoliths.
- **VII. Commit and push early/often**: PASS. Changes will continue to be committed and pushed at logical task boundaries.
- **VIII. Faithful tool adoption**: PASS. This is the `/speckit-plan` output for the active `021` spec.
- **IX. Backend pluggability**: PASS. Negotiation records lane capabilities without coupling the protocol to one provider.

## Project Structure

### Documentation (this feature)

```text
specs/021-audit-protocol-friction-burndown/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── phase-governance-checkpoints.md
│   ├── phase-boundary-sizing.md
│   └── fleet-negotiation.md
└── tasks.md
```

### Source Code (repository root)

```text
plugins/stack-control/
├── src/govern/
│   ├── protocol.ts
│   ├── incremental-audit.ts
│   ├── payload-implement.ts
│   ├── checkpoint-state.ts           # new
│   ├── phase-boundary-sizing.ts      # new
│   ├── lane-capabilities.ts          # new
│   └── fleet-negotiation.ts          # new
├── src/subcommands/
│   ├── govern.ts
│   ├── audit-barrage.ts
│   ├── audit-barrage-fleet.ts
│   └── audit-barrage-render.ts
├── src/__tests__/
│   ├── govern/
│   ├── scope-discovery/
│   └── ...existing audit / anchor / fleet suites...
└── templates/
    └── audit-barrage-config.yaml
```

**Structure Decision**: keep the protocol logic in `src/govern/` and leave CLI orchestration in `src/subcommands/`. New protocol records get their own modules so phase enforcement, boundary fit, and fleet negotiation can evolve independently without re-bloating `protocol.ts` or `govern.ts`.

## Complexity Tracking

No constitution violations expected. The only meaningful complexity risk is that enforcement, sizing, and negotiation all touch the same govern path; the mitigation is to keep each concern behind explicit records and contracts.
