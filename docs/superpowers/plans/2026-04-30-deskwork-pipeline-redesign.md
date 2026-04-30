# Deskwork Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rearchitect the deskwork calendar/review-pipeline into a single entry-centric state machine — eight stages (six pipeline + two off-pipeline), universal `iterate` and `approve` verbs, per-entry JSON sidecar source-of-truth, doctor as reconciler with LLM-as-judge sub-agent dispatch.

**Architecture:** Per-entry JSON sidecars at `.deskwork/entries/<uuid>.json` become the source-of-truth; `calendar.md` becomes a regenerated scannable index. One CLI helper retained (`iterate` — multi-write transactional hot path); all other verbs are skill-prose driven. Old per-stage helpers retire; old workflow-uuid URLs become 404. One-shot migration via `deskwork doctor --repair`.

**Tech Stack:** TypeScript (Bun + Vitest); zod for schemas; Hono for studio web; Edit/Write for skill-prose mutations; Claude Code Agent tool for LLM-as-judge sub-agent dispatch.

**Source-of-truth design spec:** [`docs/superpowers/specs/2026-04-30-deskwork-pipeline-redesign-design.md`](../specs/2026-04-30-deskwork-pipeline-redesign-design.md). Read it before starting. The plan tells you in what order to build; the spec tells you why.

---

## Execution strategy

This plan organizes ~50 tasks into **seven phases**. Each phase reaches a stable checkpoint suitable for review and commit. Recommended sequence:

| Phase | Description | Stable checkpoint |
|---|---|---|
| 1 | Schema + sidecar IO + calendar render | `@deskwork/core` exports new types; sidecars round-trip; tests pass |
| 2 | Migration via `deskwork doctor --repair` | This project's calendar migrates cleanly; verified post-migration |
| 3 | `iterate` helper rewrite | New iterate produces sidecar updates + journal events; old iterate retired |
| 4 | Skill-prose verbs (add/approve/block/cancel/induct/publish/status) | Each verb's SKILL.md drives the agent through deterministic Edit/Write sequences; doctor validates |
| 5 | Doctor expansion + LLM-as-judge | All nine validation categories; repair classes; skill-side judge orchestration |
| 6 | Studio dashboard + review-surface + Manual rewrite | Studio reflects the new model end-to-end |
| 7 | Migration runbook + integration smoke + release | MIGRATING.md, end-to-end smoke against fresh project tree, ship via `/release` |

Phases build sequentially. Pause between phases for review. Use the existing `/release` skill to ship the final result as a major version bump (e.g., v0.11.0).

---

## File structure overview

```
packages/core/src/
  schema/
    entry.ts                 # NEW — Entry interface + zod schema; Stage + ReviewState enums
    journal-events.ts        # NEW — JournalEvent discriminated union + zod schemas
    annotation.ts            # NEW — Annotation type + zod (extracted; today inlined)
  sidecar/
    paths.ts                 # NEW — sidecar path resolution (.deskwork/entries/<uuid>.json)
    read.ts                  # NEW — read + parse + zod-validate sidecar
    write.ts                 # NEW — write atomically (temp + rename); regenerate updatedAt
  calendar/
    render.ts                # NEW — render calendar.md from current sidecars
    parse.ts                 # MODIFY — extend existing parser to include sidecar reconciliation
  journal/
    append.ts                # NEW — append journal event (new event kinds)
    read.ts                  # NEW — read journal events filtered by entryId / stage / kind
    legacy.ts                # NEW — bridge for pre-redesign workflow-uuid-keyed events
  iterate/
    iterate.ts               # NEW — entry-centric iterate helper (replaces today's)
  doctor/
    validate.ts              # NEW — nine validation categories
    repair.ts                # NEW — repair classes (non-destructive auto + destructive prompt)
    migrate.ts               # NEW — migration repair class

packages/cli/src/
  dispatcher.ts              # MODIFY — wire new verbs; print stable error for retired verbs
  cmd/iterate.ts             # MODIFY — call new core/iterate
  cmd/doctor.ts              # MODIFY — call new core/doctor
  cmd/retired.ts             # NEW — stable-error implementations for retired verbs

packages/studio/src/
  pages/dashboard.ts         # MODIFY — eight-section layout; per-row state; inline buttons
  pages/review.ts            # MODIFY — entry-uuid keyed; stage-aware affordances
  pages/index.ts             # MODIFY — link entries by uuid not workflow-uuid
  pages/help.ts              # REWRITE — Compositor's Manual with new vocabulary
  lib/entry-resolver.ts      # NEW — resolve entry by uuid or slug; load full sidecar+artifact

plugins/deskwork/skills/
  add/SKILL.md               # REWRITE — entry creation prose
  approve/SKILL.md           # REWRITE — universal stage-graduation prose
  block/SKILL.md             # NEW
  cancel/SKILL.md            # NEW
  induct/SKILL.md            # NEW
  publish/SKILL.md           # REWRITE — Final → Published prose
  status/SKILL.md            # NEW — successor to review-help
  doctor/SKILL.md            # NEW — orchestrates judge sub-agent dispatch
  iterate/SKILL.md           # REWRITE — minor updates for entry-centric prose
  ingest/SKILL.md            # REWRITE — --stage flag + new schema
  plan/SKILL.md              # DELETE
  outline/SKILL.md           # DELETE
  draft/SKILL.md             # DELETE
  pause/SKILL.md             # DELETE
  resume/SKILL.md            # DELETE
  review-start/SKILL.md      # DELETE
  review-cancel/SKILL.md     # DELETE
  review-help/SKILL.md       # DELETE
  review-report/SKILL.md     # DELETE

MIGRATING.md                  # NEW or MODIFY — adopter migration walkthrough
```

---

# Phase 1 — Schema + sidecar IO + calendar render

Goal: lay the foundation. Create the new types, zod schemas, sidecar read/write, and calendar.md render. No verb wiring yet; just the building blocks tested in isolation.

## Task 1: Stage and ReviewState enums

**Files:**
- Create: `packages/core/src/schema/entry.ts`
- Test: `packages/core/test/schema/entry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/schema/entry.test.ts
import { describe, it, expect } from 'vitest';
import { Stage, ReviewState, isLinearPipelineStage, isOffPipelineStage, nextStage } from '@/schema/entry';

describe('Stage enum', () => {
  it('contains all eight stages', () => {
    const stages: Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled'];
    expect(stages.length).toBe(8);
  });

  it('isLinearPipelineStage returns true for pipeline stages', () => {
    expect(isLinearPipelineStage('Ideas')).toBe(true);
    expect(isLinearPipelineStage('Drafting')).toBe(true);
    expect(isLinearPipelineStage('Published')).toBe(true);
  });

  it('isLinearPipelineStage returns false for off-pipeline stages', () => {
    expect(isLinearPipelineStage('Blocked')).toBe(false);
    expect(isLinearPipelineStage('Cancelled')).toBe(false);
  });

  it('isOffPipelineStage is the inverse', () => {
    expect(isOffPipelineStage('Blocked')).toBe(true);
    expect(isOffPipelineStage('Drafting')).toBe(false);
  });

  it('nextStage returns the linear successor', () => {
    expect(nextStage('Ideas')).toBe('Planned');
    expect(nextStage('Planned')).toBe('Outlining');
    expect(nextStage('Outlining')).toBe('Drafting');
    expect(nextStage('Drafting')).toBe('Final');
  });

  it('nextStage returns null for stages without a forward successor', () => {
    expect(nextStage('Final')).toBe(null);       // use publish, not approve
    expect(nextStage('Published')).toBe(null);
    expect(nextStage('Blocked')).toBe(null);
    expect(nextStage('Cancelled')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test schema/entry`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/schema/entry.ts
export type Stage =
  | 'Ideas' | 'Planned' | 'Outlining' | 'Drafting' | 'Final' | 'Published'
  | 'Blocked' | 'Cancelled';

export type ReviewState = 'in-review' | 'iterating' | 'approved';

const LINEAR_PIPELINE: readonly Stage[] = ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'] as const;
const OFF_PIPELINE: readonly Stage[] = ['Blocked', 'Cancelled'] as const;

export function isLinearPipelineStage(s: Stage): boolean {
  return LINEAR_PIPELINE.includes(s);
}

export function isOffPipelineStage(s: Stage): boolean {
  return OFF_PIPELINE.includes(s);
}

const SUCCESSOR: Record<Stage, Stage | null> = {
  Ideas: 'Planned',
  Planned: 'Outlining',
  Outlining: 'Drafting',
  Drafting: 'Final',
  Final: null,        // publish, not approve
  Published: null,
  Blocked: null,
  Cancelled: null,
};

export function nextStage(s: Stage): Stage | null {
  return SUCCESSOR[s];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test schema/entry`
Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema/entry.ts packages/core/test/schema/entry.test.ts
git commit -m "feat(core): add Stage and ReviewState enums + helpers"
```

## Task 2: Entry interface + zod schema

**Files:**
- Modify: `packages/core/src/schema/entry.ts:1-50`
- Test: `packages/core/test/schema/entry.test.ts:1-150`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/schema/entry.test.ts (append after existing describe)
import { EntrySchema, type Entry } from '@/schema/entry';

describe('EntrySchema', () => {
  it('parses a valid Ideas entry', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'my-article',
      title: 'My Article',
      keywords: ['kw1'],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    const result = EntrySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('parses a valid Drafting entry with reviewState', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440001',
      slug: 'my-second-article',
      title: 'My Second',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: { Ideas: 3, Planned: 2, Outlining: 4, Drafting: 7 },
      reviewState: 'in-review',
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T11:00:00.000Z',
    };
    expect(EntrySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an entry with unknown stage', () => {
    const invalid = {
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Reviewing',  // not a real stage
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects an entry with malformed uuid', () => {
    const invalid = {
      uuid: 'not-a-uuid',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('parses a Blocked entry with priorStage', () => {
    const valid: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440003',
      slug: 'paused-thing',
      title: 'Paused Thing',
      keywords: [],
      source: 'manual',
      currentStage: 'Blocked',
      priorStage: 'Drafting',
      iterationByStage: { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    expect(EntrySchema.safeParse(valid).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test schema/entry`
Expected: FAIL — `EntrySchema` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/schema/entry.ts (append)
import { z } from 'zod';

const StageEnum = z.enum(['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']);
const ReviewStateEnum = z.enum(['in-review', 'iterating', 'approved']);

export const EntrySchema = z.object({
  // Identity
  uuid: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  keywords: z.array(z.string()),
  source: z.string(),

  // Pipeline state
  currentStage: StageEnum,
  priorStage: StageEnum.optional(),
  iterationByStage: z.record(StageEnum, z.number().int().nonnegative()),
  reviewState: ReviewStateEnum.optional(),

  // Editorial
  targetVersion: z.string().optional(),
  datePublished: z.string().datetime().optional(),

  // Distribution (deferred — shortform model)
  shortformWorkflows: z.record(z.string(), z.string()).optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Entry = z.infer<typeof EntrySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test schema/entry`
Expected: PASS, all tests (6 from Task 1 + 5 new = 11).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema/entry.ts packages/core/test/schema/entry.test.ts
git commit -m "feat(core): add Entry zod schema with stage + reviewState validation"
```

## Task 3: Annotation + JournalEvent schemas

**Files:**
- Create: `packages/core/src/schema/annotation.ts`
- Create: `packages/core/src/schema/journal-events.ts`
- Test: `packages/core/test/schema/journal-events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/schema/journal-events.test.ts
import { describe, it, expect } from 'vitest';
import { JournalEventSchema, type JournalEvent } from '@/schema/journal-events';

describe('JournalEventSchema', () => {
  it('parses an entry-created event', () => {
    const event: JournalEvent = {
      kind: 'entry-created',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      entry: {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'x',
        title: 'X',
        keywords: [],
        source: 'manual',
        currentStage: 'Ideas',
        iterationByStage: {},
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses an iteration event', () => {
    const event: JournalEvent = {
      kind: 'iteration',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting',
      version: 7,
      markdown: '# my draft\n\ncontents...',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('parses a stage-transition event', () => {
    const event: JournalEvent = {
      kind: 'stage-transition',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      from: 'Drafting',
      to: 'Final',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });

  it('rejects an event with unknown kind', () => {
    const event = {
      kind: 'something-else',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(false);
  });

  it('parses a review-state-change event', () => {
    const event: JournalEvent = {
      kind: 'review-state-change',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting',
      from: null,
      to: 'in-review',
    };
    expect(JournalEventSchema.safeParse(event).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test schema/journal-events`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/schema/annotation.ts
import { z } from 'zod';

export const AnnotationSchema = z.object({
  id: z.string().uuid(),
  type: z.literal('comment'),
  range: z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
  text: z.string(),
  category: z.string().optional(),
  anchor: z.string().optional(),
  disposition: z.enum(['addressed', 'deferred', 'wontfix']).optional(),
  dispositionReason: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;
```

```typescript
// packages/core/src/schema/journal-events.ts
import { z } from 'zod';
import { EntrySchema } from '@/schema/entry';
import { AnnotationSchema } from '@/schema/annotation';

const StageEnum = z.enum(['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']);
const ReviewStateEnum = z.enum(['in-review', 'iterating', 'approved']);

const EntryCreatedEvent = z.object({
  kind: z.literal('entry-created'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  entry: EntrySchema,
});

const EntryIngestedEvent = z.object({
  kind: z.literal('entry-ingested'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  sourcePath: z.string(),
  targetStage: StageEnum,
});

const IterationEvent = z.object({
  kind: z.literal('iteration'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageEnum,
  version: z.number().int().positive(),
  markdown: z.string(),
});

const AnnotationEvent = z.object({
  kind: z.literal('annotation'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageEnum,
  version: z.number().int().positive(),
  annotation: AnnotationSchema,
});

const ReviewStateChangeEvent = z.object({
  kind: z.literal('review-state-change'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  stage: StageEnum,
  from: ReviewStateEnum.nullable(),
  to: ReviewStateEnum.nullable(),
});

const StageTransitionEvent = z.object({
  kind: z.literal('stage-transition'),
  at: z.string().datetime(),
  entryId: z.string().uuid(),
  from: StageEnum,
  to: StageEnum,
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const JournalEventSchema = z.discriminatedUnion('kind', [
  EntryCreatedEvent,
  EntryIngestedEvent,
  IterationEvent,
  AnnotationEvent,
  ReviewStateChangeEvent,
  StageTransitionEvent,
]);

export type JournalEvent = z.infer<typeof JournalEventSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test schema/journal-events`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema/annotation.ts packages/core/src/schema/journal-events.ts packages/core/test/schema/journal-events.test.ts
git commit -m "feat(core): add JournalEvent + Annotation zod schemas"
```

## Task 4: Sidecar paths + read

**Files:**
- Create: `packages/core/src/sidecar/paths.ts`
- Create: `packages/core/src/sidecar/read.ts`
- Test: `packages/core/test/sidecar/read.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/sidecar/read.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSidecar, sidecarPath } from '@/sidecar';

describe('sidecar paths', () => {
  it('returns the canonical sidecar path', () => {
    expect(sidecarPath('/proj', '550e8400-e29b-41d4-a716-446655440000'))
      .toBe('/proj/.deskwork/entries/550e8400-e29b-41d4-a716-446655440000.json');
  });
});

describe('readSidecar', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('reads + parses a valid sidecar', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const entry = {
      uuid,
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeFile(sidecarPath(projectRoot, uuid), JSON.stringify(entry, null, 2));

    const result = await readSidecar(projectRoot, uuid);
    expect(result.uuid).toBe(uuid);
    expect(result.currentStage).toBe('Ideas');
  });

  it('throws on missing sidecar', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440099';
    await expect(readSidecar(projectRoot, uuid)).rejects.toThrow(/sidecar not found/);
  });

  it('throws on schema-invalid sidecar', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    await writeFile(sidecarPath(projectRoot, uuid), JSON.stringify({ uuid, currentStage: 'NotAStage' }));
    await expect(readSidecar(projectRoot, uuid)).rejects.toThrow(/schema/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test sidecar/read`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sidecar/paths.ts
import { join } from 'node:path';

export function sidecarPath(projectRoot: string, uuid: string): string {
  return join(projectRoot, '.deskwork', 'entries', `${uuid}.json`);
}

export function sidecarsDir(projectRoot: string): string {
  return join(projectRoot, '.deskwork', 'entries');
}
```

```typescript
// packages/core/src/sidecar/read.ts
import { readFile } from 'node:fs/promises';
import { EntrySchema, type Entry } from '@/schema/entry';
import { sidecarPath } from '@/sidecar/paths';

export async function readSidecar(projectRoot: string, uuid: string): Promise<Entry> {
  const path = sidecarPath(projectRoot, uuid);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new Error(`sidecar not found: ${path}`);
    }
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`sidecar JSON invalid at ${path}`);
  }
  const result = EntrySchema.safeParse(json);
  if (!result.success) {
    throw new Error(`sidecar schema invalid at ${path}: ${result.error.message}`);
  }
  return result.data;
}
```

```typescript
// packages/core/src/sidecar/index.ts
export * from '@/sidecar/paths';
export * from '@/sidecar/read';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test sidecar/read`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sidecar/ packages/core/test/sidecar/
git commit -m "feat(core): add sidecar path resolver + reader"
```

## Task 5: Sidecar atomic write

**Files:**
- Create: `packages/core/src/sidecar/write.ts`
- Modify: `packages/core/src/sidecar/index.ts`
- Test: `packages/core/test/sidecar/write.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/sidecar/write.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar, readSidecar } from '@/sidecar';
import type { Entry } from '@/schema/entry';

describe('writeSidecar', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('writes a sidecar that round-trips through readSidecar', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    const read = await readSidecar(projectRoot, entry.uuid);
    expect(read).toEqual(entry);
  });

  it('creates the .deskwork/entries directory if missing', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440001',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    const read = await readSidecar(projectRoot, entry.uuid);
    expect(read.uuid).toBe(entry.uuid);
  });

  it('rejects schema-invalid entries before writing', async () => {
    const invalid = {
      uuid: 'not-a-uuid',
      slug: 'x',
      title: 'X',
      keywords: [],
      source: 'manual',
      currentStage: 'Ideas',
      iterationByStage: {},
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    // @ts-expect-error — intentional invalid input
    await expect(writeSidecar(projectRoot, invalid)).rejects.toThrow(/schema/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test sidecar/write`
Expected: FAIL — `writeSidecar` not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sidecar/write.ts
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EntrySchema, type Entry } from '@/schema/entry';
import { sidecarPath } from '@/sidecar/paths';

export async function writeSidecar(projectRoot: string, entry: Entry): Promise<void> {
  const result = EntrySchema.safeParse(entry);
  if (!result.success) {
    throw new Error(`writeSidecar refused: schema invalid: ${result.error.message}`);
  }
  const path = sidecarPath(projectRoot, entry.uuid);
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entry, null, 2));
  await rename(tmpPath, path);
}
```

Update `packages/core/src/sidecar/index.ts`:

```typescript
export * from '@/sidecar/paths';
export * from '@/sidecar/read';
export * from '@/sidecar/write';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test sidecar/write`
Expected: PASS, all 3 tests + the 4 from Task 4 still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sidecar/ packages/core/test/sidecar/
git commit -m "feat(core): add sidecar atomic write (temp + rename)"
```

## Task 6: Calendar render

**Files:**
- Create: `packages/core/src/calendar/render.ts`
- Test: `packages/core/test/calendar/render.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/calendar/render.test.ts
import { describe, it, expect } from 'vitest';
import { renderCalendar } from '@/calendar/render';
import type { Entry } from '@/schema/entry';

describe('renderCalendar', () => {
  it('renders an empty calendar with all eight stage sections', () => {
    const md = renderCalendar([]);
    expect(md).toContain('## Ideas');
    expect(md).toContain('## Planned');
    expect(md).toContain('## Outlining');
    expect(md).toContain('## Drafting');
    expect(md).toContain('## Final');
    expect(md).toContain('## Published');
    expect(md).toContain('## Blocked');
    expect(md).toContain('## Cancelled');
    expect(md).toContain('## Distribution');
  });

  it('renders entries grouped by currentStage', () => {
    const entries: Entry[] = [
      {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        slug: 'idea-one',
        title: 'Idea One',
        description: 'first idea',
        keywords: ['kw1'],
        source: 'manual',
        currentStage: 'Ideas',
        iterationByStage: { Ideas: 1 },
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
      {
        uuid: '550e8400-e29b-41d4-a716-446655440001',
        slug: 'draft-one',
        title: 'Draft One',
        keywords: [],
        source: 'manual',
        currentStage: 'Drafting',
        iterationByStage: { Ideas: 1, Planned: 1, Outlining: 2, Drafting: 5 },
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T11:00:00.000Z',
      },
    ];
    const md = renderCalendar(entries);
    const ideaSection = md.split('## Ideas')[1].split('##')[0];
    const draftingSection = md.split('## Drafting')[1].split('##')[0];
    expect(ideaSection).toContain('idea-one');
    expect(ideaSection).not.toContain('draft-one');
    expect(draftingSection).toContain('draft-one');
    expect(draftingSection).not.toContain('idea-one');
  });

  it('renders empty stage sections with "No entries" placeholder', () => {
    const md = renderCalendar([]);
    expect(md).toContain('*No entries.*');
  });

  it('includes all required columns in the table header', () => {
    const md = renderCalendar([{
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Ideas', iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    }]);
    const ideasSection = md.split('## Ideas')[1].split('##')[0];
    expect(ideasSection).toContain('| UUID | Slug | Title | Description | Keywords | Source | Updated |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test calendar/render`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/calendar/render.ts
import type { Entry } from '@/schema/entry';
import type { Stage } from '@/schema/entry';

const STAGE_ORDER: Stage[] = [
  'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled'
];

const HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER = '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';
const EMPTY = '*No entries.*\n\n';

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function renderRow(e: Entry): string {
  return `| ${e.uuid} | ${escapePipe(e.slug)} | ${escapePipe(e.title)} | ${escapePipe(e.description ?? '')} | ${escapePipe(e.keywords.join(', '))} | ${escapePipe(e.source)} | ${e.updatedAt} |`;
}

export function renderCalendar(entries: Entry[]): string {
  const byStage = new Map<Stage, Entry[]>();
  for (const stage of STAGE_ORDER) byStage.set(stage, []);
  for (const e of entries) {
    const bucket = byStage.get(e.currentStage);
    if (bucket) bucket.push(e);
  }

  let md = HEADER;
  for (const stage of STAGE_ORDER) {
    md += `## ${stage}\n\n`;
    const bucket = byStage.get(stage)!;
    if (bucket.length === 0) {
      md += EMPTY;
    } else {
      md += TABLE_HEADER;
      for (const e of bucket) md += renderRow(e) + '\n';
      md += '\n';
    }
  }
  md += `## Distribution\n\n*reserved for shortform DistributionRecords — separate model*\n`;
  return md;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test calendar/render`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/calendar/render.ts packages/core/test/calendar/render.test.ts
git commit -m "feat(core): add calendar.md renderer (eight-stage layout)"
```

## Task 7: Journal append + read

**Files:**
- Create: `packages/core/src/journal/append.ts`
- Create: `packages/core/src/journal/read.ts`
- Test: `packages/core/test/journal/append-read.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/journal/append-read.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendJournalEvent, readJournalEvents } from '@/journal';
import type { JournalEvent } from '@/schema/journal-events';

describe('journal append + read', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('appends and reads back an iteration event', async () => {
    const event: JournalEvent = {
      kind: 'iteration',
      at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting',
      version: 1,
      markdown: '# x',
    };
    await appendJournalEvent(projectRoot, event);
    const events = await readJournalEvents(projectRoot, { entryId: event.entryId });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it('filters by entryId', async () => {
    const e1: JournalEvent = {
      kind: 'iteration', at: '2026-04-30T10:00:00.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440000',
      stage: 'Drafting', version: 1, markdown: 'x',
    };
    const e2: JournalEvent = {
      kind: 'iteration', at: '2026-04-30T10:00:01.000Z',
      entryId: '550e8400-e29b-41d4-a716-446655440099',
      stage: 'Drafting', version: 1, markdown: 'y',
    };
    await appendJournalEvent(projectRoot, e1);
    await appendJournalEvent(projectRoot, e2);
    const events = await readJournalEvents(projectRoot, { entryId: e1.entryId });
    expect(events).toHaveLength(1);
    expect(events[0].entryId).toBe(e1.entryId);
  });

  it('returns events in chronological order', async () => {
    const ts = (n: number) => `2026-04-30T10:00:0${n}.000Z`;
    const events: JournalEvent[] = [
      { kind: 'iteration', at: ts(2), entryId: '550e8400-e29b-41d4-a716-446655440000', stage: 'Drafting', version: 2, markdown: 'v2' },
      { kind: 'iteration', at: ts(1), entryId: '550e8400-e29b-41d4-a716-446655440000', stage: 'Drafting', version: 1, markdown: 'v1' },
      { kind: 'iteration', at: ts(3), entryId: '550e8400-e29b-41d4-a716-446655440000', stage: 'Drafting', version: 3, markdown: 'v3' },
    ];
    for (const e of events) await appendJournalEvent(projectRoot, e);
    const read = await readJournalEvents(projectRoot, { entryId: events[0].entryId });
    expect(read.map(e => 'version' in e ? e.version : null)).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test journal/append-read`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/journal/append.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JournalEventSchema, type JournalEvent } from '@/schema/journal-events';

export async function appendJournalEvent(projectRoot: string, event: JournalEvent): Promise<string> {
  const result = JournalEventSchema.safeParse(event);
  if (!result.success) {
    throw new Error(`appendJournalEvent refused: schema invalid: ${result.error.message}`);
  }
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'history');
  await mkdir(dir, { recursive: true });
  const eventId = randomUUID();
  const tsKey = event.at.replace(/[:.]/g, '-');
  const path = join(dir, `${tsKey}-${eventId}.json`);
  await writeFile(path, JSON.stringify(event, null, 2));
  return path;
}
```

```typescript
// packages/core/src/journal/read.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JournalEventSchema, type JournalEvent } from '@/schema/journal-events';

interface ReadOptions {
  entryId?: string;
  stage?: string;
  kinds?: string[];
}

export async function readJournalEvents(projectRoot: string, opts: ReadOptions = {}): Promise<JournalEvent[]> {
  const dir = join(projectRoot, '.deskwork', 'review-journal', 'history');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') return [];
    throw err;
  }

  const events: JournalEvent[] = [];
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const raw = await readFile(join(dir, name), 'utf8');
    let json: unknown;
    try { json = JSON.parse(raw); } catch { continue; }
    const parsed = JournalEventSchema.safeParse(json);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (opts.entryId && e.entryId !== opts.entryId) continue;
    if (opts.stage && 'stage' in e && e.stage !== opts.stage) continue;
    if (opts.kinds && !opts.kinds.includes(e.kind)) continue;
    events.push(e);
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}
```

```typescript
// packages/core/src/journal/index.ts
export * from '@/journal/append';
export * from '@/journal/read';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test journal/append-read`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/journal/ packages/core/test/journal/
git commit -m "feat(core): add journal event append + read with filters"
```

## Phase 1 checkpoint

All foundation pieces in place: schemas, sidecars, journal, calendar render. No verb wiring yet. Run the workspace test suite:

```bash
npm test
```

Expected: all passing. Branch state suitable for review and pause.

---

# Phase 2 — Migration via `deskwork doctor --repair`

Goal: take the existing `.deskwork/calendar.md` (this project's, plus audiocontrol.org's) and migrate to the new schema. Doctor's migration repair class is the entry point. After this phase: calendar has sidecars, calendar.md is regenerated, journal events from before are preserved as historical, this project's actual state is migrated.

## Task 8: Calendar parser (extend for migration source)

**Files:**
- Modify: `packages/core/src/calendar/parse.ts`
- Test: `packages/core/test/calendar/parse.test.ts`

The existing parser reads calendar.md into a structured representation. Extend it to expose the per-row data with stage, slug, uuid, etc. — sufficient input to build a sidecar.

- [ ] **Step 1: Read the existing parse.ts and identify the gap.**

```bash
cat packages/core/src/calendar/parse.ts
```

Expected: existing parser returns structured calendar but without explicit per-row stage attribution suitable for migration.

- [ ] **Step 2: Write the failing test for migration-source extraction**

```typescript
// packages/core/test/calendar/parse.test.ts (append)
import { extractEntriesForMigration } from '@/calendar/parse';

describe('extractEntriesForMigration', () => {
  it('extracts entries by stage from a calendar.md string', () => {
    const md = `# Editorial Calendar

## Ideas

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | my-idea | My Idea |  | kw1 | manual |

## Drafting

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440001 | my-draft | My Draft | desc | kw2, kw3 | manual |

## Paused

*No entries.*
`;
    const entries = extractEntriesForMigration(md);
    expect(entries).toHaveLength(2);
    expect(entries[0].currentStage).toBe('Ideas');
    expect(entries[0].slug).toBe('my-idea');
    expect(entries[1].currentStage).toBe('Drafting');
    expect(entries[1].keywords).toEqual(['kw2', 'kw3']);
  });

  it('maps Paused stage to Blocked during migration', () => {
    const md = `# Editorial Calendar

## Paused

| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440002 | paused-thing | Paused Thing |  |  | manual |
`;
    const entries = extractEntriesForMigration(md);
    expect(entries).toHaveLength(1);
    expect(entries[0].currentStage).toBe('Blocked');
  });

  it('skips the Distribution section (not a stage)', () => {
    const md = `# Editorial Calendar

## Distribution

| Slug | Platform | URL |
|------|------|------|
| x | linkedin | https://... |
`;
    const entries = extractEntriesForMigration(md);
    expect(entries).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test calendar/parse`
Expected: FAIL — `extractEntriesForMigration` not exported.

- [ ] **Step 4: Implement**

Add to `packages/core/src/calendar/parse.ts`:

```typescript
import type { Stage } from '@/schema/entry';

interface MigrationSourceEntry {
  currentStage: Stage;
  uuid: string;
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  source: string;
}

const LEGACY_STAGE_MAP: Record<string, Stage | null> = {
  Ideas: 'Ideas',
  Planned: 'Planned',
  Outlining: 'Outlining',
  Drafting: 'Drafting',
  Final: 'Final',
  Published: 'Published',
  Blocked: 'Blocked',
  Paused: 'Blocked',          // migration mapping
  Cancelled: 'Cancelled',
  Review: null,                // dropped
  Distribution: null,          // not a stage
};

export function extractEntriesForMigration(md: string): MigrationSourceEntry[] {
  const sectionRe = /^## (\w+)\s*$/gm;
  const sections: { name: string; body: string }[] = [];
  const matches = [...md.matchAll(sectionRe)];
  for (let i = 0; i < matches.length; i++) {
    const next = matches[i + 1];
    const start = matches[i].index! + matches[i][0].length;
    const end = next ? next.index! : md.length;
    sections.push({ name: matches[i][1], body: md.slice(start, end) });
  }

  const entries: MigrationSourceEntry[] = [];
  for (const { name, body } of sections) {
    const stage = LEGACY_STAGE_MAP[name];
    if (!stage) continue;

    const rowRe = /^\|\s*([0-9a-f-]{36})\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm;
    for (const m of body.matchAll(rowRe)) {
      entries.push({
        currentStage: stage,
        uuid: m[1],
        slug: m[2].trim(),
        title: m[3].trim(),
        description: m[4].trim(),
        keywords: m[5].split(',').map(s => s.trim()).filter(Boolean),
        source: m[6].trim(),
      });
    }
  }
  return entries;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test calendar/parse`
Expected: PASS, all 3 new tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/calendar/parse.ts packages/core/test/calendar/parse.test.ts
git commit -m "feat(core): extract entries from legacy calendar.md for migration"
```

## Task 9: Migration repair class

**Files:**
- Create: `packages/core/src/doctor/migrate.ts`
- Test: `packages/core/test/doctor/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/doctor/migrate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateCalendar, detectLegacySchema } from '@/doctor/migrate';

describe('detectLegacySchema', () => {
  it('returns true when calendar.md has a Paused section', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Paused\n\n*No entries.*\n');
      expect(await detectLegacySchema(projectRoot)).toBe(true);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('returns true when no .deskwork/entries directory exists', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n');
      expect(await detectLegacySchema(projectRoot)).toBe(true);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('returns false when sidecars exist', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n');
      expect(await detectLegacySchema(projectRoot)).toBe(false);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });
});

describe('migrateCalendar', () => {
  it('generates sidecars for each calendar entry', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |

## Drafting
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440001 | draft-one | Draft One | desc | kw2 | manual |
`);
      const result = await migrateCalendar(projectRoot, { dryRun: false });
      expect(result.entriesMigrated).toBe(2);

      const sidecars = await readdir(join(projectRoot, '.deskwork', 'entries'));
      expect(sidecars).toHaveLength(2);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('regenerates calendar.md with eight stage sections', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |

## Paused
*No entries.*

## Review
*No entries.*
`);
      await migrateCalendar(projectRoot, { dryRun: false });
      const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
      expect(md).toContain('## Final');
      expect(md).toContain('## Blocked');
      expect(md).toContain('## Cancelled');
      expect(md).not.toContain('## Review');
      expect(md).not.toContain('## Paused');
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it('does not write when dryRun is true', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    try {
      await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
      await writeFile(join(projectRoot, '.deskwork', 'calendar.md'),
        `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |
`);
      const result = await migrateCalendar(projectRoot, { dryRun: true });
      expect(result.entriesMigrated).toBe(1);

      const sidecars = await readdir(join(projectRoot, '.deskwork', 'entries')).catch(() => []);
      expect(sidecars).toHaveLength(0);
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test doctor/migrate`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement**

```typescript
// packages/core/src/doctor/migrate.ts
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { extractEntriesForMigration } from '@/calendar/parse';
import { writeSidecar } from '@/sidecar/write';
import { renderCalendar } from '@/calendar/render';
import { appendJournalEvent } from '@/journal/append';
import { readJournalEvents } from '@/journal/read';
import type { Entry, Stage } from '@/schema/entry';

interface MigrateOptions {
  dryRun: boolean;
}

interface MigrateResult {
  entriesMigrated: number;
  unmigratable: string[];
}

export async function detectLegacySchema(projectRoot: string): Promise<boolean> {
  // Legacy: calendar.md has Paused/Review sections, OR no .deskwork/entries directory
  try {
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    if (/^## Paused\b/m.test(md) || /^## Review\b/m.test(md)) return true;
  } catch { return false; }
  try {
    await access(join(projectRoot, '.deskwork', 'entries'));
    return false;
  } catch {
    return true;
  }
}

export async function migrateCalendar(
  projectRoot: string,
  opts: MigrateOptions
): Promise<MigrateResult> {
  const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
  const sources = extractEntriesForMigration(md);

  const sidecars: Entry[] = [];
  const unmigratable: string[] = [];

  for (const src of sources) {
    // Build iteration history from journal — best-effort
    const events = await readJournalEvents(projectRoot, { entryId: src.uuid });
    const iterationByStage = countIterationsByStage(events);
    const earliest = events[0]?.at ?? new Date().toISOString();
    const latest = events[events.length - 1]?.at ?? new Date().toISOString();

    const entry: Entry = {
      uuid: src.uuid,
      slug: src.slug,
      title: src.title,
      description: src.description || undefined,
      keywords: src.keywords,
      source: src.source,
      currentStage: src.currentStage,
      priorStage: src.currentStage === 'Blocked' || src.currentStage === 'Cancelled'
        ? inferPriorStageFromJournal(events) : undefined,
      iterationByStage,
      reviewState: latestReviewStateFromJournal(events),
      createdAt: earliest,
      updatedAt: latest,
    };
    sidecars.push(entry);
  }

  if (!opts.dryRun) {
    for (const e of sidecars) {
      await writeSidecar(projectRoot, e);
      await appendJournalEvent(projectRoot, {
        kind: 'entry-created',
        at: new Date().toISOString(),
        entryId: e.uuid,
        entry: e,
      });
    }
    const newMd = renderCalendar(sidecars);
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), newMd);
  }

  return { entriesMigrated: sidecars.length, unmigratable };
}

function countIterationsByStage(events: import('@/schema/journal-events').JournalEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.kind === 'iteration') {
      counts[e.stage] = (counts[e.stage] ?? 0) + 1;
    }
  }
  return counts;
}

function inferPriorStageFromJournal(events: import('@/schema/journal-events').JournalEvent[]): Stage | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'stage-transition' && e.to !== 'Blocked' && e.to !== 'Cancelled') {
      return e.from;
    }
  }
  return 'Drafting';  // safe default
}

function latestReviewStateFromJournal(events: import('@/schema/journal-events').JournalEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'review-state-change' && e.to) return e.to;
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test doctor/migrate`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/doctor/migrate.ts packages/core/test/doctor/migrate.test.ts
git commit -m "feat(core): add doctor migrate repair class for legacy calendar"
```

## Task 10: Wire migration into doctor CLI

**Files:**
- Modify: `packages/cli/src/cmd/doctor.ts`

- [ ] **Step 1: Locate the existing doctor CLI command**

```bash
cat packages/cli/src/cmd/doctor.ts
```

Identify where to add the legacy-schema branch.

- [ ] **Step 2: Modify the doctor command to detect legacy schema and run migration**

Add to the existing dispatcher logic in `packages/cli/src/cmd/doctor.ts`:

```typescript
import { detectLegacySchema, migrateCalendar } from '@deskwork/core/doctor/migrate';

// In the doctor command handler, before existing checks:
async function maybeMigrate(projectRoot: string, repair: boolean, dryRun: boolean): Promise<boolean> {
  const isLegacy = await detectLegacySchema(projectRoot);
  if (!isLegacy) return false;

  if (!repair && !dryRun) {
    process.stderr.write(`\ncalendar uses pre-redesign schema (Review/Paused sections OR no .deskwork/entries/ dir).\nRun 'deskwork doctor --repair' to migrate, or 'deskwork doctor --check' for a dry-run preview.\n`);
    process.exitCode = 1;
    return true;
  }

  const result = await migrateCalendar(projectRoot, { dryRun });
  if (dryRun) {
    process.stdout.write(`would migrate ${result.entriesMigrated} entries (dry run)\n`);
  } else {
    process.stdout.write(`migrated ${result.entriesMigrated} entries\n`);
  }
  return true;
}

// In the main doctor handler, call this first; if it returns true, skip the rest.
```

- [ ] **Step 3: Manual verification on a tmp project**

```bash
# Create a tmp project with legacy calendar
TMP=$(mktemp -d)
mkdir -p "$TMP/.deskwork"
cat > "$TMP/.deskwork/calendar.md" <<'EOF'
# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | test | Test |  |  | manual |

## Paused
*No entries.*
EOF

# Dry-run
node packages/cli/dist/index.js doctor --check --project-root "$TMP"
# Should report 1 entry to migrate

# Real migration
node packages/cli/dist/index.js doctor --repair --project-root "$TMP"
# Should report migrated 1 entries

# Verify
ls "$TMP/.deskwork/entries/"  # one .json
cat "$TMP/.deskwork/calendar.md" | head -20  # should have Final/Blocked/Cancelled, no Paused/Review

rm -rf "$TMP"
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cmd/doctor.ts
git commit -m "feat(cli): doctor --repair migrates legacy calendar to entry-centric schema"
```

## Task 11: Run migration on this project's calendar

**Files:**
- Modify: `.deskwork/calendar.md` (regenerated)
- Create: `.deskwork/entries/*.json` (one per existing entry)
- Modify: docs in `docs/1.0/001-IN-PROGRESS/deskwork-plugin/` (frontmatter sync if needed)

- [ ] **Step 1: Dry-run the migration on this project**

```bash
deskwork doctor --check
```

Expected: report N entries to migrate (4 currently). Verify the report looks sane.

- [ ] **Step 2: Run the real migration**

```bash
deskwork doctor --repair
```

- [ ] **Step 3: Inspect the new state**

```bash
ls .deskwork/entries/                    # 4 .json sidecars
cat .deskwork/calendar.md | head -50    # eight stage sections
```

- [ ] **Step 4: Verify by reading sidecars and confirming they match the prior calendar state**

Manual review: each sidecar should have the right currentStage, slug, title.

- [ ] **Step 5: Commit**

```bash
git add .deskwork/
git commit -m "chore(deskwork): migrate calendar to entry-centric schema"
```

## Phase 2 checkpoint

This project's calendar is on the new schema. `.deskwork/entries/*.json` exists with sidecars. `calendar.md` is regenerated with eight-stage layout. Old journal events preserved.

```bash
deskwork doctor
```

Expected: post-migration state should validate. (The validation surface is incomplete yet — Phase 5 fills out doctor's full coverage. For now, doctor's existing checks plus the migration detection should pass.)

---

# Phase 3 — `iterate` helper rewrite

Goal: replace today's iterate helper with the entry-centric version. New iterate reads sidecar, snapshots artifact, journals, updates sidecar, all atomically.

## Task 12: Define new iterate helper interface

**Files:**
- Create: `packages/core/src/iterate/iterate.ts`
- Test: `packages/core/test/iterate/iterate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/iterate/iterate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iterateEntry } from '@/iterate/iterate';
import { writeSidecar } from '@/sidecar/write';
import { readSidecar } from '@/sidecar/read';
import { readJournalEvents } from '@/journal/read';
import type { Entry } from '@/schema/entry';

describe('iterateEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';
  const slug = 'my-article';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, 'docs', slug, 'scrapbook'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function setupEntry(stage: Entry['currentStage']): Promise<Entry> {
    const entry: Entry = {
      uuid, slug, title: 'My Article', keywords: [], source: 'manual',
      currentStage: stage,
      iterationByStage: stage === 'Ideas' ? {} : { Ideas: 1, ...(stage !== 'Ideas' ? {} : {}) },
      createdAt: '2026-04-30T10:00:00.000Z',
      updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    return entry;
  }

  it('produces v1 from iteration 0 (no prior iteration)', async () => {
    await setupEntry('Ideas');
    const ideaPath = join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md');
    await writeFile(ideaPath, `---\ndeskwork:\n  id: ${uuid}\n  stage: Ideas\n  iteration: 0\n---\n\n# my article idea\n`);

    const result = await iterateEntry(projectRoot, { uuid });
    expect(result.version).toBe(1);
    expect(result.stage).toBe('Ideas');

    const updated = await readSidecar(projectRoot, uuid);
    expect(updated.iterationByStage.Ideas).toBe(1);
    expect(updated.reviewState).toBe('in-review');
  });

  it('produces v(N+1) from existing iteration N', async () => {
    const entry = await setupEntry('Drafting');
    entry.iterationByStage = { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5 };
    await writeSidecar(projectRoot, entry);

    const draftPath = join(projectRoot, 'docs', slug, 'index.md');
    await writeFile(draftPath, `---\ndeskwork:\n  id: ${uuid}\n  stage: Drafting\n  iteration: 5\n---\n\n# draft body v6 content\n`);

    const result = await iterateEntry(projectRoot, { uuid });
    expect(result.version).toBe(6);
    const updated = await readSidecar(projectRoot, uuid);
    expect(updated.iterationByStage.Drafting).toBe(6);
  });

  it('emits an iteration journal event', async () => {
    await setupEntry('Ideas');
    await writeFile(
      join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md'),
      `---\ndeskwork:\n  id: ${uuid}\n  stage: Ideas\n  iteration: 0\n---\n\n# my idea\n`
    );

    await iterateEntry(projectRoot, { uuid });
    const events = await readJournalEvents(projectRoot, { entryId: uuid });
    const iterationEvents = events.filter(e => e.kind === 'iteration');
    expect(iterationEvents).toHaveLength(1);
    if (iterationEvents[0].kind === 'iteration') {
      expect(iterationEvents[0].markdown).toContain('# my idea');
    }
  });

  it('refuses to iterate a Published entry', async () => {
    const entry = await setupEntry('Published');
    entry.iterationByStage = { Ideas: 1, Planned: 1, Outlining: 1, Drafting: 5, Final: 1, Published: 1 };
    await writeSidecar(projectRoot, entry);
    await writeFile(join(projectRoot, 'docs', slug, 'index.md'), '# x\n');

    await expect(iterateEntry(projectRoot, { uuid })).rejects.toThrow(/published.*frozen/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test iterate/iterate`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement**

```typescript
// packages/core/src/iterate/iterate.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSidecar } from '@/sidecar/read';
import { writeSidecar } from '@/sidecar/write';
import { appendJournalEvent } from '@/journal/append';
import type { Entry, Stage } from '@/schema/entry';

interface IterateOptions {
  uuid: string;
  // Future: --dispositions <path>
}

interface IterateResult {
  entryId: string;
  stage: Stage;
  version: number;
  reviewState: 'in-review';
}

const STAGE_ARTIFACT_PATH: Record<Stage, ((slug: string, contentDir: string) => string) | null> = {
  Ideas: (slug, contentDir) => join(contentDir, slug, 'scrapbook', 'idea.md'),
  Planned: (slug, contentDir) => join(contentDir, slug, 'scrapbook', 'plan.md'),
  Outlining: (slug, contentDir) => join(contentDir, slug, 'scrapbook', 'outline.md'),
  Drafting: (slug, contentDir) => join(contentDir, slug, 'index.md'),
  Final: (slug, contentDir) => join(contentDir, slug, 'index.md'),
  Published: null,
  Blocked: null,
  Cancelled: null,
};

export async function iterateEntry(projectRoot: string, opts: IterateOptions): Promise<IterateResult> {
  const sidecar = await readSidecar(projectRoot, opts.uuid);

  if (sidecar.currentStage === 'Published') {
    throw new Error('Cannot iterate: Published entries are frozen.');
  }
  if (sidecar.currentStage === 'Blocked' || sidecar.currentStage === 'Cancelled') {
    throw new Error(`Cannot iterate: entry is ${sidecar.currentStage}; induct it back into the pipeline first.`);
  }

  const pathFn = STAGE_ARTIFACT_PATH[sidecar.currentStage];
  if (!pathFn) {
    throw new Error(`Cannot iterate at stage ${sidecar.currentStage}: no artifact path defined.`);
  }

  const contentDir = join(projectRoot, 'docs');  // FIXME: read from .deskwork/config.json
  const artifactPath = pathFn(sidecar.slug, contentDir);
  const markdown = await readFile(artifactPath, 'utf8');

  const priorVersion = sidecar.iterationByStage[sidecar.currentStage] ?? 0;
  const newVersion = priorVersion + 1;

  const at = new Date().toISOString();

  // Emit journal event first; doctor reconciles drift if we crash mid-operation
  await appendJournalEvent(projectRoot, {
    kind: 'iteration',
    at,
    entryId: sidecar.uuid,
    stage: sidecar.currentStage,
    version: newVersion,
    markdown,
  });

  // Update sidecar
  const updated: Entry = {
    ...sidecar,
    iterationByStage: { ...sidecar.iterationByStage, [sidecar.currentStage]: newVersion },
    reviewState: 'in-review',
    updatedAt: at,
  };
  await writeSidecar(projectRoot, updated);

  // Emit review-state-change if state actually changed
  if (sidecar.reviewState !== 'in-review') {
    await appendJournalEvent(projectRoot, {
      kind: 'review-state-change',
      at,
      entryId: sidecar.uuid,
      stage: sidecar.currentStage,
      from: sidecar.reviewState ?? null,
      to: 'in-review',
    });
  }

  return {
    entryId: sidecar.uuid,
    stage: sidecar.currentStage,
    version: newVersion,
    reviewState: 'in-review',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test iterate/iterate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/iterate/iterate.ts packages/core/test/iterate/iterate.test.ts
git commit -m "feat(core): entry-centric iterate helper (snapshot + journal + sidecar)"
```

## Task 13: Wire new iterate into CLI

**Files:**
- Modify: `packages/cli/src/cmd/iterate.ts`

- [ ] **Step 1: Modify the CLI iterate command to use the new helper**

Replace today's iterate command's body with a call to the new `iterateEntry` helper, taking a slug or UUID and resolving to the entry's UUID before calling.

```typescript
// packages/cli/src/cmd/iterate.ts (replace existing body)
import { iterateEntry } from '@deskwork/core/iterate';
import { resolveEntryUuid } from '@deskwork/core/sidecar/lookup';  // see Task 14

export async function runIterate(args: { slug: string; projectRoot: string }): Promise<void> {
  const uuid = await resolveEntryUuid(args.projectRoot, args.slug);
  const result = await iterateEntry(args.projectRoot, { uuid });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
```

- [ ] **Step 2: Test against this project's calendar**

```bash
# After Phase 2 migration
deskwork iterate post-release-acceptance-design
```

Expected: emits a JSON object `{ entryId, stage, version, reviewState }`. Calendar's sidecar updates.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/cmd/iterate.ts
git commit -m "feat(cli): wire new entry-centric iterate helper"
```

## Task 14: Sidecar lookup by slug

**Files:**
- Create: `packages/core/src/sidecar/lookup.ts`
- Modify: `packages/core/src/sidecar/index.ts`
- Test: `packages/core/test/sidecar/lookup.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/sidecar/lookup.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@/sidecar/write';
import { resolveEntryUuid } from '@/sidecar/lookup';
import type { Entry } from '@/schema/entry';

describe('resolveEntryUuid', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('resolves a slug to its uuid', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'my-article', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Ideas', iterationByStage: { Ideas: 1 },
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    expect(await resolveEntryUuid(projectRoot, 'my-article')).toBe(entry.uuid);
  });

  it('returns the uuid as-is if input is already a uuid', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(await resolveEntryUuid(projectRoot, uuid)).toBe(uuid);
  });

  it('throws when slug is not found', async () => {
    await expect(resolveEntryUuid(projectRoot, 'no-such-slug')).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test sidecar/lookup`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement**

```typescript
// packages/core/src/sidecar/lookup.ts
import { readdir, readFile } from 'node:fs/promises';
import { sidecarsDir } from '@/sidecar/paths';
import { EntrySchema } from '@/schema/entry';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveEntryUuid(projectRoot: string, input: string): Promise<string> {
  if (UUID_RE.test(input)) return input;

  const dir = sidecarsDir(projectRoot);
  let names: string[];
  try { names = await readdir(dir); } catch { throw new Error(`slug '${input}' not found (no sidecars)`); }

  for (const name of names.filter(n => n.endsWith('.json'))) {
    const raw = await readFile(`${dir}/${name}`, 'utf8');
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.slug === input) return parsed.data.uuid;
    } catch { /* skip malformed sidecars */ }
  }
  throw new Error(`slug '${input}' not found`);
}
```

Update sidecar index:

```typescript
// packages/core/src/sidecar/index.ts
export * from '@/sidecar/paths';
export * from '@/sidecar/read';
export * from '@/sidecar/write';
export * from '@/sidecar/lookup';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test sidecar/lookup`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sidecar/lookup.ts packages/core/src/sidecar/index.ts packages/core/test/sidecar/lookup.test.ts
git commit -m "feat(core): sidecar lookup by slug"
```

## Phase 3 checkpoint

`iterate` helper rewritten. CLI wired. Lookup by slug works.

```bash
npm test                  # all green
deskwork iterate <slug>   # produces v(N+1) on this project's calendar
```

---

# Phase 4 — Skill-prose verbs

Goal: SKILL.md prose for the universal verb surface. Each skill drives the agent through deterministic Edit/Write sequences. Doctor validates each step's result.

## Task 15: SKILL.md for /deskwork:add

**Files:**
- Modify: `plugins/deskwork/skills/add/SKILL.md`

- [ ] **Step 1: Write the new SKILL.md**

```markdown
---
name: add
description: Create a new Ideas-stage entry with sidecar + scaffolded idea.md
---

## Add

Create a new Ideas-stage calendar entry for a content idea.

### Input

```
/deskwork:add <slug> "<title>"
/deskwork:add <slug> "<title>" --description "<description>" --keywords "<kw1,kw2>"
```

### Steps

1. Resolve project root (default: current working directory).
2. Generate entry uuid: `node -e "console.log(require('crypto').randomUUID())"`.
3. Build entry sidecar:

```
{
  "uuid": "<generated>",
  "slug": "<slug-arg>",
  "title": "<title-arg>",
  "description": "<description-arg or omit>",
  "keywords": ["<kw1>", "<kw2>"],
  "source": "manual",
  "currentStage": "Ideas",
  "iterationByStage": {},
  "createdAt": "<ISO 8601 now>",
  "updatedAt": "<ISO 8601 now>"
}
```

4. Use the Write tool to create `.deskwork/entries/<uuid>.json` with the sidecar content.
5. Use the Write tool to scaffold `<contentDir>/<slug>/scrapbook/idea.md` with frontmatter:

```
---
title: <title>
deskwork:
  id: <uuid>
  stage: Ideas
  iteration: 0
---

# <title>

(idea body — operator iterates from here)
```

6. Append a journal event by using the Write tool to create `.deskwork/review-journal/history/<timestamp>-<random>.json`:

```
{
  "kind": "entry-created",
  "at": "<ISO 8601 now>",
  "entryId": "<uuid>",
  "entry": <full sidecar JSON from step 3>
}
```

7. Run `deskwork doctor` to regenerate `calendar.md` and validate.

### Error handling

- **Slug already exists.** Refuse with: "slug <slug> exists; use /deskwork:status <slug> to view."
- **Doctor reports validation failure after add.** Surface to operator; revert by deleting the sidecar, idea.md, and journal event files.
```

- [ ] **Step 2: Smoke test by adding an entry through the skill**

Have the agent execute the SKILL prose to add a test entry. Verify:
- Sidecar at `.deskwork/entries/<uuid>.json` is well-formed
- `idea.md` is scaffolded with frontmatter
- Journal event recorded
- `deskwork doctor` passes
- Calendar.md regenerated to include the new entry

- [ ] **Step 3: Commit**

```bash
git add plugins/deskwork/skills/add/SKILL.md
git commit -m "feat(skill): /deskwork:add prose for entry-centric add"
```

## Task 16: SKILL.md for /deskwork:approve

**Files:**
- Modify: `plugins/deskwork/skills/approve/SKILL.md`

- [ ] **Step 1: Write the new SKILL.md**

```markdown
---
name: approve
description: Graduate an entry to the next pipeline stage; finalizes the operator's approval click in the studio
---

## Approve

Graduate an entry from its current pipeline stage to the next. Approve IS the act of advancing — there is no "approve but stay."

### Prerequisite

The entry's sidecar must have `reviewState: "approved"` (set by the operator clicking Approve in the studio).

### Input

```
/deskwork:approve <slug>
```

### Steps

1. Resolve `<slug>` → entry uuid via `.deskwork/entries/`.
2. Read `.deskwork/entries/<uuid>.json` into sidecar.
3. Validate gates:
   - sidecar.reviewState === "approved". If not, refuse: "click Approve in the studio first."
   - sidecar.currentStage in [Ideas, Planned, Outlining, Drafting]. If Final: refuse: "use /deskwork:publish for Final → Published." If Blocked/Cancelled: refuse with state-specific message.
4. Compute nextStage from this map:
   - Ideas → Planned
   - Planned → Outlining
   - Outlining → Drafting
   - Drafting → Final
5. Build the next stage's primary artifact path:
   - Planned: `<contentDir>/<slug>/scrapbook/plan.md`
   - Outlining: `<contentDir>/<slug>/scrapbook/outline.md`
   - Drafting: `<contentDir>/<slug>/index.md`
   - Final: same path as Drafting (no new file)
6. If the next-stage artifact does not exist, scaffold it via Write tool:

```
---
title: <sidecar.title>
deskwork:
  id: <sidecar.uuid>
  stage: <nextStage>
  iteration: 0
---

# <sidecar.title>

(seed from prior stage's content if appropriate; else blank)
```

   - For Planned/Outlining/Drafting: seed from prior stage's artifact content as a starting point (per S1 in the design spec).
   - For Final (no new file): skip this step.

7. Update the sidecar via Edit tool:
   - currentStage: <nextStage>
   - iterationByStage[<nextStage>]: preserve if already set (re-induction case), else 0
   - reviewState: undefined (delete the field)
   - priorStage: undefined (delete; not blocked/cancelled)
   - updatedAt: <ISO 8601 now>

8. Append journal event by writing `.deskwork/review-journal/history/<timestamp>-<random>.json`:

```
{
  "kind": "stage-transition",
  "at": "<ISO 8601 now>",
  "entryId": "<uuid>",
  "from": "<priorStage>",
  "to": "<nextStage>"
}
```

9. Run `deskwork doctor` to validate. If doctor fails, surface failures to operator and refuse to commit.

### Error handling

- **reviewState not approved.** Refuse: "click Approve in the studio first; sidecar.reviewState=<actual>."
- **Currently Final.** Refuse: "use /deskwork:publish for Final → Published."
- **Currently Blocked/Cancelled.** Refuse: "entry is <stage>; use /deskwork:induct to bring it back first."
- **Currently Published.** Refuse: "Published entries are frozen; future fork-on-edit model is deferred."
```

- [ ] **Step 2: Smoke test by approving a test entry**

Approve a test entry that has `reviewState: "approved"` set; verify it advances by one stage; verify next-stage artifact is scaffolded; verify journal events.

- [ ] **Step 3: Commit**

```bash
git add plugins/deskwork/skills/approve/SKILL.md
git commit -m "feat(skill): /deskwork:approve prose for universal stage graduation"
```

## Task 17: SKILL.md for /deskwork:block, /deskwork:cancel, /deskwork:induct

**Files:**
- Create: `plugins/deskwork/skills/block/SKILL.md`
- Create: `plugins/deskwork/skills/cancel/SKILL.md`
- Create: `plugins/deskwork/skills/induct/SKILL.md`

- [ ] **Step 1: Create block/SKILL.md**

```markdown
---
name: block
description: Move an entry to Blocked (out of pipeline; resumable)
---

## Block

Set an entry to Blocked. Entry leaves the active pipeline; can be resumed via /deskwork:induct.

### Input

```
/deskwork:block <slug>
/deskwork:block <slug> --reason "<reason>"
```

### Steps

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Validate: currentStage must be a pipeline stage (Ideas/Planned/Outlining/Drafting/Final/Published). If already Blocked or Cancelled, refuse.
4. Update sidecar:
   - priorStage: <currentStage>
   - currentStage: "Blocked"
   - reviewState: undefined
   - updatedAt: <now>
5. Append journal event: { kind: "stage-transition", from: <prior>, to: "Blocked", reason: <reason if given> }.
6. Run `deskwork doctor` to validate.

### Error handling

- **Already Blocked or Cancelled.** Refuse with the entry's current state.
```

- [ ] **Step 2: Create cancel/SKILL.md (same shape as block but `currentStage: "Cancelled"`)**

```markdown
---
name: cancel
description: Move an entry to Cancelled (intent: abandoned; resumable but rare)
---

## Cancel

Mark an entry as Cancelled — formally abandoned. Like Blocked but signals intent.

### Input

```
/deskwork:cancel <slug>
/deskwork:cancel <slug> --reason "<reason>"
```

### Steps

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Validate: currentStage must be in pipeline; not already Cancelled.
4. Update sidecar:
   - priorStage: <currentStage>
   - currentStage: "Cancelled"
   - reviewState: undefined
   - updatedAt: <now>
5. Append journal event: { kind: "stage-transition", from: <prior>, to: "Cancelled", reason: <reason if given> }.
6. Run `deskwork doctor` to validate.

### Error handling

- **Already Cancelled.** Refuse: "entry is already Cancelled."
- **Currently Blocked.** Suggest /deskwork:induct first.
```

- [ ] **Step 3: Create induct/SKILL.md**

```markdown
---
name: induct
description: Teleport an entry to an operator-chosen stage (works from Blocked, Cancelled, or any pipeline stage)
---

## Induct

Move an entry to a chosen stage. Universal teleport — works from Blocked, Cancelled, Final (revoke Final-status), or any pipeline stage to go backwards.

### Input

```
/deskwork:induct <slug> --to <Stage>
/deskwork:induct <slug>           # uses default destination
```

Defaults:
- From Blocked: <priorStage>
- From Cancelled: <priorStage>
- From Final: Drafting (one stage back)
- From any pipeline stage: refuse without --to (induction backwards is intentional; require explicit target)

### Steps

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Determine target stage:
   - If `--to <stage>` given, use it.
   - Else apply defaults above.
4. Validate target is a pipeline stage (cannot induct to Blocked/Cancelled directly — use /deskwork:block or /deskwork:cancel).
5. Update sidecar:
   - currentStage: <target>
   - priorStage: undefined (clears Blocked/Cancelled stash)
   - reviewState: undefined
   - iterationByStage[<target>]: preserve if present (operator picks up where they left off)
   - updatedAt: <now>
6. Append journal event: { kind: "stage-transition", from: <prior>, to: <target> }.
7. Run `deskwork doctor` to validate.

### Error handling

- **Target stage is Blocked or Cancelled.** Refuse: "use /deskwork:block or /deskwork:cancel to set those states."
- **Target stage is Published.** Refuse: "use /deskwork:publish for the Final → Published transition; Published items are frozen."
- **From a pipeline stage without --to.** Refuse: "going backwards in pipeline is intentional; pass --to <stage>."
```

- [ ] **Step 4: Smoke test by exercising each skill on test entries**

- [ ] **Step 5: Commit**

```bash
git add plugins/deskwork/skills/block/ plugins/deskwork/skills/cancel/ plugins/deskwork/skills/induct/
git commit -m "feat(skill): block, cancel, induct prose for off-pipeline transitions"
```

## Task 18: SKILL.md for /deskwork:publish

**Files:**
- Modify: `plugins/deskwork/skills/publish/SKILL.md`

- [ ] **Step 1: Rewrite to drive Final → Published via skill prose**

```markdown
---
name: publish
description: Final → Published — the only graduation event from Final; freezes the artifact
---

## Publish

Promote a Final-stage entry to Published. Operator runs this when the artifact is ready for external publication. Published is frozen.

### Prerequisite

Entry must be at currentStage="Final" with reviewState="approved" or undefined (if no review cycle was needed at Final).

### Input

```
/deskwork:publish <slug>
/deskwork:publish <slug> --date <YYYY-MM-DD>   # explicit publish date; default: today
```

### Steps

1. Resolve `<slug>` → uuid.
2. Read sidecar.
3. Validate: currentStage === "Final".
4. Determine datePublished: from `--date` flag, or today (UTC).
5. Read the artifact at `<contentDir>/<slug>/index.md`.
6. Use Edit tool to update the artifact's frontmatter, adding `datePublished: <YYYY-MM-DD>`. Preserve all other frontmatter fields.
7. Update the sidecar:
   - currentStage: "Published"
   - reviewState: undefined
   - datePublished: <ISO 8601 with timezone>
   - updatedAt: <now>
8. Append journal event: { kind: "stage-transition", from: "Final", to: "Published", metadata: { datePublished: <ISO 8601> } }.
9. Run `deskwork doctor` to validate.

### Error handling

- **Not at Final.** Refuse: "publish only works from Final stage; entry is at <currentStage>."
- **datePublished already set on the artifact.** Refuse: "artifact has datePublished=<existing>; choose a new approve+publish path or manual edit."
```

- [ ] **Step 2: Commit**

```bash
git add plugins/deskwork/skills/publish/SKILL.md
git commit -m "feat(skill): /deskwork:publish prose for Final → Published"
```

## Task 19: SKILL.md for /deskwork:status

**Files:**
- Create: `plugins/deskwork/skills/status/SKILL.md`

- [ ] **Step 1: Write status SKILL.md**

```markdown
---
name: status
description: Per-entry summary (currentStage, iteration counts, reviewState) — successor to review-help
---

## Status

Show the state of a single entry, or all active entries.

### Input

```
/deskwork:status                # all active entries (non-Published, non-Cancelled)
/deskwork:status <slug>         # specific entry
/deskwork:status --all          # every entry, all stages
```

### Steps

1. Resolve project root.
2. Read all sidecars from `.deskwork/entries/*.json`.
3. Filter:
   - Default: entries with currentStage NOT in [Published, Cancelled]
   - --all: no filter
   - <slug>: single entry
4. For each entry, format:

```
<slug>  [<currentStage>]  iteration: <iterationByStage[currentStage]>  reviewState: <reviewState or "—">
   updated: <updatedAt>
```

5. If `--json` flag, output structured JSON instead.

### Error handling

- **Slug not found.** Surface error.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/deskwork/skills/status/SKILL.md
git commit -m "feat(skill): /deskwork:status — per-entry state summary"
```

## Task 20: SKILL.md for /deskwork:doctor (skill-side judge orchestration)

**Files:**
- Create: `plugins/deskwork/skills/doctor/SKILL.md`

- [ ] **Step 1: Write doctor SKILL.md**

```markdown
---
name: doctor
description: Validate calendar; orchestrates LLM-as-judge sub-agent for invocation sanity
---

## Doctor

Validate the deskwork calendar end-to-end. Combines schema/reconciliation (helper-side `deskwork doctor`) with an LLM-as-judge sub-agent dispatch for semantic coherence.

### Input

```
/deskwork:doctor              # default: helper run + judge sub-agent
/deskwork:doctor --no-judge   # helper run only (offline / fast-path)
/deskwork:doctor --audit      # helper run + per-entry judge + global cross-entry judge
```

### Steps

1. Run the helper: `deskwork doctor --json`.
2. Parse helper output. If schema or reconciliation failures: surface them; do not run judge.
3. If `--no-judge`, stop and report.
4. Read `.deskwork/config.json` to get `judge.subagentModel` (default: "haiku").
5. For each entry with recent journal activity (events in the latest hour OR since last doctor run):
   - Read the sidecar
   - Read up to 10 most-recent journal events for the entry
   - Read the on-disk artifact at sidecar.currentStage; capture first 500 chars + last 500 chars + byteSize
   - Dispatch a sub-agent:
     ```
     Agent({
       subagent_type: "general-purpose",
       model: "<configured-model>",
       description: "Judge entry <slug> sanity",
       prompt: "<system prompt>\n\n<entry sidecar>\n<recent events>\n<artifact preview>\n\nEvaluate. Output JSON: {verdict, explanation, concerns}."
     })
     ```
6. Aggregate verdicts. Surface warns + fails to operator.
7. Report combined output: helper passes/failures + judge pass/warn/fail per entry.

### Judge system prompt (cached)

```
You are a deskwork pipeline auditor. The deskwork pipeline has these stages,
in order: Ideas → Planned → Outlining → Drafting → Final → Published. Off-pipeline:
Blocked, Cancelled. Invariants:

- Stage advancement is one-step (forward); approve graduates by exactly one.
- iterationByStage values are non-negative integers; should match the count of
  iteration journal events per stage.
- Published entries are frozen — no iteration events should appear post-Published.
- Blocked and Cancelled entries always have priorStage set.
- Pipeline-stage entries should not have priorStage set.
- An entry's latest journal stage-transition event's `to` must equal the sidecar's
  currentStage.
- An entry's latest review-state-change must match the sidecar's reviewState.

Read the entry's state and recent journal trail; report whether the sequence
is coherent.

Output JSON: {verdict: "pass" | "warn" | "fail", explanation: string, concerns: string[]}
```

### Error handling

- **Helper failed.** Surface; skip judge.
- **Sub-agent dispatch failed.** Treat as "judge unavailable"; don't fail the overall doctor run.
- **Sub-agent returned malformed JSON.** Treat as unavailable; log warning.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/deskwork/skills/doctor/SKILL.md
git commit -m "feat(skill): /deskwork:doctor with LLM-as-judge sub-agent dispatch"
```

## Task 21: Retire old skills

**Files:**
- Delete: `plugins/deskwork/skills/{plan,outline,draft,pause,resume,review-start,review-cancel,review-help,review-report}/SKILL.md`

- [ ] **Step 1: Delete the retired skill directories**

```bash
rm -rf plugins/deskwork/skills/plan
rm -rf plugins/deskwork/skills/outline
rm -rf plugins/deskwork/skills/draft
rm -rf plugins/deskwork/skills/pause
rm -rf plugins/deskwork/skills/resume
rm -rf plugins/deskwork/skills/review-start
rm -rf plugins/deskwork/skills/review-cancel
rm -rf plugins/deskwork/skills/review-help
rm -rf plugins/deskwork/skills/review-report
```

- [ ] **Step 2: Update plugin.json if it lists skills explicitly**

```bash
cat plugins/deskwork/.claude-plugin/plugin.json
# If it has a 'skills' array, prune retired entries
```

- [ ] **Step 3: Commit**

```bash
git add plugins/deskwork/skills/ plugins/deskwork/.claude-plugin/plugin.json
git commit -m "chore(skill): retire pre-redesign per-stage and review-loop skills"
```

## Task 22: CLI dispatcher — stable error for retired verbs

**Files:**
- Modify: `packages/cli/src/dispatcher.ts`
- Create: `packages/cli/src/cmd/retired.ts`
- Test: `packages/cli/test/retired.test.ts`

- [ ] **Step 1: Write retired-verb stub**

```typescript
// packages/cli/src/cmd/retired.ts
const RETIRED = new Set(['plan', 'outline', 'draft', 'pause', 'resume', 'review-start', 'review-cancel', 'review-help', 'review-report']);

export function isRetired(subcommand: string): boolean {
  return RETIRED.has(subcommand);
}

export function printRetiredError(subcommand: string): never {
  process.stderr.write(
    `deskwork: subcommand '${subcommand}' was retired in v0.11.0.\n` +
    `The deskwork pipeline now uses universal verbs:\n` +
    `  iterate    — within-stage edit cycle\n` +
    `  approve    — graduate to next stage\n` +
    `  block      — set Blocked\n` +
    `  cancel     — set Cancelled\n` +
    `  induct     — teleport to chosen stage\n` +
    `  publish    — Final → Published\n` +
    `  status     — per-entry state summary\n` +
    `\nSee MIGRATING.md for the full mapping.\n`
  );
  process.exit(1);
}
```

- [ ] **Step 2: Write test**

```typescript
// packages/cli/test/retired.test.ts
import { describe, it, expect } from 'vitest';
import { isRetired } from '@/cmd/retired';

describe('isRetired', () => {
  it.each(['plan', 'outline', 'draft', 'pause', 'resume', 'review-start', 'review-cancel', 'review-help', 'review-report'])
    ('marks %s as retired', (cmd) => {
      expect(isRetired(cmd)).toBe(true);
    });

  it.each(['iterate', 'approve', 'block', 'cancel', 'induct', 'publish', 'status', 'doctor', 'add', 'ingest'])
    ('does not mark %s as retired', (cmd) => {
      expect(isRetired(cmd)).toBe(false);
    });
});
```

- [ ] **Step 3: Wire into dispatcher**

In `packages/cli/src/dispatcher.ts`, before the switch on subcommand:

```typescript
import { isRetired, printRetiredError } from '@/cmd/retired';

// In dispatch function, very early:
if (isRetired(subcommand)) {
  printRetiredError(subcommand);
  // never returns
}
```

- [ ] **Step 4: Run tests + manual smoke**

```bash
npm --workspace @deskwork/cli test retired
deskwork plan foo  # exits with stable error message + exit 1
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cmd/retired.ts packages/cli/src/dispatcher.ts packages/cli/test/retired.test.ts
git commit -m "feat(cli): retired-verb stable-error stub"
```

## Phase 4 checkpoint

All universal verbs have SKILL.md prose. Old skills retired. CLI dispatcher prints stable errors for retired verbs.

```bash
npm test                  # all green
deskwork plan x           # stable retired error
/deskwork:add new-thing "Test"  # in skill prose, scaffolds entry
```

---

# Phase 5 — Doctor expansion + LLM-as-judge

Goal: doctor's full validation surface. Nine validation categories. Repair classes. Skill-side judge sub-agent dispatch.

## Task 23: Doctor validation rule — schema validation

**Files:**
- Create: `packages/core/src/doctor/validate.ts`
- Test: `packages/core/test/doctor/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/doctor/validate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

describe('validateAll - schema', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, 'docs'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), '# Editorial Calendar\n\n## Ideas\n*No entries.*\n');
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('passes a clean state', async () => {
    const result = await validateAll(projectRoot);
    expect(result.failures).toEqual([]);
  });

  it('fails when a sidecar is schema-invalid', async () => {
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', '550e8400-e29b-41d4-a716-446655440000.json'),
      JSON.stringify({ uuid: '550e8400-e29b-41d4-a716-446655440000', currentStage: 'NotAStage' })
    );
    const result = await validateAll(projectRoot);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures.some(f => f.category === 'schema')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test doctor/validate`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement minimal validateAll with schema check**

```typescript
// packages/core/src/doctor/validate.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EntrySchema } from '@/schema/entry';

export interface ValidationFailure {
  category: 'schema' | 'calendar-sidecar' | 'frontmatter-sidecar' | 'journal-sidecar' | 'iteration-history' | 'file-presence' | 'stage-invariants' | 'cross-entry' | 'migration';
  message: string;
  entryId?: string;
  path?: string;
}

export interface ValidationResult {
  failures: ValidationFailure[];
}

async function validateSchema(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const dir = join(projectRoot, '.deskwork', 'entries');
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return failures; }

  for (const name of names.filter(n => n.endsWith('.json'))) {
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    let json: unknown;
    try { json = JSON.parse(raw); }
    catch {
      failures.push({ category: 'schema', message: `JSON parse failed`, path });
      continue;
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) {
      failures.push({ category: 'schema', message: result.error.message, path });
    }
  }
  return failures;
}

export async function validateAll(projectRoot: string): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];
  failures.push(...(await validateSchema(projectRoot)));
  // Future tasks add more validations here.
  return { failures };
}
```

- [ ] **Step 4: Run test**

Run: `npm --workspace @deskwork/core test doctor/validate`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/doctor/validate.ts packages/core/test/doctor/validate.test.ts
git commit -m "feat(core): doctor schema validation pass"
```

## Tasks 24–30: Add remaining validation categories

Each task follows the same pattern: write a failing test asserting the validation catches a specific drift class; implement the validation as a function in `validate.ts`; aggregate into `validateAll`. Categories to add (one task per category):

- **Task 24:** Calendar.md ↔ sidecar consistency
- **Task 25:** Frontmatter ↔ sidecar consistency
- **Task 26:** Journal ↔ sidecar consistency (latest stage-transition matches currentStage; latest review-state-change matches reviewState)
- **Task 27:** Iteration history completeness (iterationByStage[s]=N implies N iteration events for that stage)
- **Task 28:** File presence (currentStage's primary artifact file exists)
- **Task 29:** Stage-specific invariants (Final/Published share file; Blocked/Cancelled have priorStage; iterationByStage[Published] never bumps)
- **Task 30:** Cross-entry invariants (slug uniqueness; UUID uniqueness)

For each:

- [ ] Write a failing test against a fixture project tree
- [ ] Implement the validation function in `packages/core/src/doctor/validate.ts`
- [ ] Aggregate into `validateAll`
- [ ] Test passes
- [ ] Commit with message `feat(core): doctor <category> validation`

The test pattern for each is the same shape as Task 23's: create a tmp project tree with a specific drift; assert validateAll catches it.

## Task 31: Repair classes

**Files:**
- Create: `packages/core/src/doctor/repair.ts`
- Test: `packages/core/test/doctor/repair.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/doctor/repair.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repairAll } from '@/doctor/repair';
import { writeSidecar } from '@/sidecar/write';
import type { Entry } from '@/schema/entry';

describe('repairAll - calendar regeneration', () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('regenerates calendar.md from sidecars', async () => {
    const entry: Entry = {
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      slug: 'x', title: 'X', keywords: [], source: 'manual',
      currentStage: 'Drafting', iterationByStage: { Drafting: 3 },
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    // Calendar.md missing
    const result = await repairAll(projectRoot, { destructive: false });
    expect(result.applied).toContain('calendar-regenerated');
    const md = await readFile(join(projectRoot, '.deskwork', 'calendar.md'), 'utf8');
    expect(md).toContain('## Drafting');
    expect(md).toContain('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/core test doctor/repair`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement**

```typescript
// packages/core/src/doctor/repair.ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sidecarsDir } from '@/sidecar/paths';
import { EntrySchema, type Entry } from '@/schema/entry';
import { renderCalendar } from '@/calendar/render';

export interface RepairOptions {
  destructive: boolean;
}

export interface RepairResult {
  applied: string[];
  pendingDestructive: string[];
}

export async function repairAll(projectRoot: string, opts: RepairOptions): Promise<RepairResult> {
  const result: RepairResult = { applied: [], pendingDestructive: [] };

  // Regenerate calendar.md from sidecars
  const dir = sidecarsDir(projectRoot);
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return result; }

  const entries: Entry[] = [];
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const raw = await readFile(join(dir, name), 'utf8');
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) entries.push(parsed.data);
    } catch { /* skip malformed */ }
  }

  const md = renderCalendar(entries);
  await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), md);
  result.applied.push('calendar-regenerated');

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deskwork/core test doctor/repair`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/doctor/repair.ts packages/core/test/doctor/repair.test.ts
git commit -m "feat(core): doctor repair class — calendar regeneration"
```

## Task 32: Wire validate + repair into doctor CLI

**Files:**
- Modify: `packages/cli/src/cmd/doctor.ts`

- [ ] **Step 1: Update the CLI doctor command to call validateAll + (optionally) repairAll**

```typescript
// packages/cli/src/cmd/doctor.ts (updated)
import { validateAll } from '@deskwork/core/doctor/validate';
import { repairAll } from '@deskwork/core/doctor/repair';
import { detectLegacySchema, migrateCalendar } from '@deskwork/core/doctor/migrate';

export async function runDoctor(args: { projectRoot: string; repair: boolean; check: boolean; quiet: boolean }) {
  // Migration takes precedence
  if (await detectLegacySchema(args.projectRoot)) {
    if (args.repair) {
      const r = await migrateCalendar(args.projectRoot, { dryRun: false });
      process.stdout.write(`migrated ${r.entriesMigrated} entries\n`);
      return;
    }
    if (args.check) {
      const r = await migrateCalendar(args.projectRoot, { dryRun: true });
      process.stdout.write(`would migrate ${r.entriesMigrated} entries (dry run)\n`);
      return;
    }
    process.stderr.write('calendar uses pre-redesign schema. Run --repair or --check.\n');
    process.exitCode = 1;
    return;
  }

  // Normal validation
  const validation = await validateAll(args.projectRoot);
  if (validation.failures.length > 0) {
    if (args.quiet) { process.exitCode = 1; return; }
    for (const f of validation.failures) {
      process.stderr.write(`  ${f.category}: ${f.message}${f.path ? ' (' + f.path + ')' : ''}\n`);
    }
    process.exitCode = 1;
  } else if (!args.quiet) {
    process.stdout.write('calendar is healthy\n');
  }

  if (args.repair) {
    const repaired = await repairAll(args.projectRoot, { destructive: false });
    for (const a of repaired.applied) {
      process.stdout.write(`  repaired: ${a}\n`);
    }
  }
}
```

- [ ] **Step 2: Smoke test**

```bash
deskwork doctor          # should pass on this project after Phase 2 migration
deskwork doctor --repair # should regenerate calendar
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/cmd/doctor.ts
git commit -m "feat(cli): wire validate + repair into doctor command"
```

## Phase 5 checkpoint

Doctor's nine validation categories all run. Repair classes work for non-destructive cases. Skill-side judge orchestration is documented in `/deskwork:doctor` SKILL.md (Task 20). Helper-side doctor exits 0 on healthy, 1 on validation failure.

```bash
deskwork doctor          # all categories pass on this project
```

---

# Phase 6 — Studio dashboard + review surface + Manual

Goal: studio reflects the new model end-to-end. Eight-section dashboard. Entry-uuid keyed review surface. Manual rewritten with new vocabulary.

## Task 33: Entry resolver for studio handlers

**Files:**
- Create: `packages/studio/src/lib/entry-resolver.ts`
- Test: `packages/studio/test/entry-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/studio/test/entry-resolver.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEntry } from '@/lib/entry-resolver';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';

describe('resolveEntry', () => {
  let projectRoot: string;
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-test-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, 'docs', 'my-article'), { recursive: true });
    const entry: Entry = {
      uuid, slug: 'my-article', title: 'My Article', keywords: [], source: 'manual',
      currentStage: 'Drafting', iterationByStage: { Drafting: 3 },
      createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
    };
    await writeSidecar(projectRoot, entry);
    await writeFile(join(projectRoot, 'docs', 'my-article', 'index.md'),
      '---\ndeskwork:\n  id: ' + uuid + '\n  stage: Drafting\n  iteration: 3\n---\n\n# my draft\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('resolves entry by uuid; returns sidecar + artifact body', async () => {
    const result = await resolveEntry(projectRoot, uuid);
    expect(result.entry.uuid).toBe(uuid);
    expect(result.entry.currentStage).toBe('Drafting');
    expect(result.artifactBody).toContain('# my draft');
    expect(result.artifactPath).toContain('index.md');
  });

  it('throws when uuid not found', async () => {
    await expect(resolveEntry(projectRoot, '550e8400-e29b-41d4-a716-446655440099')).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deskwork/studio test entry-resolver`
Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement**

```typescript
// packages/studio/src/lib/entry-resolver.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSidecar } from '@deskwork/core/sidecar';
import type { Entry, Stage } from '@deskwork/core/schema/entry';

interface ResolveResult {
  entry: Entry;
  artifactBody: string;
  artifactPath: string;
}

const STAGE_ARTIFACT: Record<Stage, ((slug: string, contentDir: string) => string) | null> = {
  Ideas: (s, d) => join(d, s, 'scrapbook', 'idea.md'),
  Planned: (s, d) => join(d, s, 'scrapbook', 'plan.md'),
  Outlining: (s, d) => join(d, s, 'scrapbook', 'outline.md'),
  Drafting: (s, d) => join(d, s, 'index.md'),
  Final: (s, d) => join(d, s, 'index.md'),
  Published: (s, d) => join(d, s, 'index.md'),
  Blocked: null,
  Cancelled: null,
};

export async function resolveEntry(projectRoot: string, uuid: string): Promise<ResolveResult> {
  const entry = await readSidecar(projectRoot, uuid);
  const contentDir = join(projectRoot, 'docs');  // TODO: read from .deskwork/config.json
  const stage = entry.priorStage ?? entry.currentStage;
  const pathFn = STAGE_ARTIFACT[stage];
  if (!pathFn) {
    throw new Error(`No artifact path for stage ${stage}`);
  }
  const artifactPath = pathFn(entry.slug, contentDir);
  const artifactBody = await readFile(artifactPath, 'utf8');
  return { entry, artifactBody, artifactPath };
}
```

- [ ] **Step 4: Run test**

Run: `npm --workspace @deskwork/studio test entry-resolver`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/lib/entry-resolver.ts packages/studio/test/entry-resolver.test.ts
git commit -m "feat(studio): entry-uuid resolver — sidecar + artifact"
```

## Task 34: Dashboard rework — eight stage sections

**Files:**
- Modify: `packages/studio/src/pages/dashboard.ts`
- Modify: `packages/studio/test/dashboard.test.ts` (or create)

- [ ] **Step 1: Read existing dashboard.ts to understand the pattern**

```bash
wc -l packages/studio/src/pages/dashboard.ts
```

- [ ] **Step 2: Add tests for new layout**

Tests assert:
- Eight stage sections render: Ideas, Planned, Outlining, Drafting, Final, Published, Blocked, Cancelled
- Per-row: shows iteration count and reviewState badge
- Inline buttons: "advance →" when reviewState="approved"; "iterate →"
- Empty stage sections collapse by default

- [ ] **Step 3: Modify dashboard.ts**

Replace stage-section iteration with the new STAGE_ORDER from `@deskwork/core/schema/entry`. Read entries from sidecars (use a new helper `readAllSidecars` if not yet built — add it to `@deskwork/core/sidecar/index.ts`). Render per-row state inline.

- [ ] **Step 4: Test + smoke**

```bash
npm --workspace @deskwork/studio test dashboard
deskwork-studio  # boot + visually inspect /dev/editorial-studio
```

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/pages/dashboard.ts packages/studio/test/dashboard.test.ts
git commit -m "feat(studio): dashboard renders eight stages with per-row state"
```

## Task 35: Review surface — entry-uuid keyed routes

**Files:**
- Modify: `packages/studio/src/pages/review.ts`
- Modify: `packages/studio/src/lib/router.ts` (or wherever routes are registered)

- [ ] **Step 1: Add new route handler**

`GET /dev/editorial-review/:entryId` — keyed by entry uuid (the `id` from `.deskwork/entries/<id>.json`). Renderer:
1. Calls `resolveEntry(projectRoot, entryId)` to get sidecar + artifact body
2. Picks affordances based on `entry.currentStage`:
   - Ideas/Planned/Outlining/Drafting/Final → editor mutable; Save/Iterate/Approve/Reject buttons
   - Published → read-only view
   - Blocked/Cancelled → "Induct to..." dropdown only

- [ ] **Step 2: Add stage-aware affordance helper**

```typescript
// packages/studio/src/lib/stage-affordances.ts
import type { Entry } from '@deskwork/core/schema/entry';

export function getAffordances(entry: Entry): {
  mutable: boolean;
  controls: string[];
} {
  if (entry.currentStage === 'Published') {
    return { mutable: false, controls: ['view-only', 'fork-placeholder'] };
  }
  if (entry.currentStage === 'Blocked' || entry.currentStage === 'Cancelled') {
    return { mutable: false, controls: ['induct-to'] };
  }
  return {
    mutable: true,
    controls: ['save', 'iterate', 'approve', 'reject', 'historical-stage-dropdown'],
  };
}
```

- [ ] **Step 3: Test new route + affordance helper**

- [ ] **Step 4: Smoke**

```bash
deskwork-studio
# Visit /dev/editorial-review/<entry-uuid> for a Drafting entry; should render editor
# Visit for a Published entry; should render read-only
```

- [ ] **Step 5: Commit**

```bash
git add packages/studio/src/pages/review.ts packages/studio/src/lib/stage-affordances.ts packages/studio/test/
git commit -m "feat(studio): entry-uuid keyed review surface with stage-aware affordances"
```

## Task 36: Index page — link entries by uuid

**Files:**
- Modify: `packages/studio/src/pages/index.ts`

- [ ] **Step 1: Update Longform reviews entry on the index**

Change the link target from workflow-uuid keyed to entry-uuid keyed. Resolve "most recent open longform review" by reading sidecars with currentStage in pipeline AND reviewState in [in-review, iterating], picking the most-recent-updated.

- [ ] **Step 2: Test**

- [ ] **Step 3: Commit**

```bash
git add packages/studio/src/pages/index.ts packages/studio/test/index.test.ts
git commit -m "feat(studio): index page links entries by uuid"
```

## Task 37: Compositor's Manual rewrite

**Files:**
- Modify: `packages/studio/src/pages/help.ts`

- [ ] **Step 1: Rewrite Manual content with new vocabulary**

Replace all references to retired skills + retired stages. Cover:
- Eight-stage pipeline (Ideas → Planned → Outlining → Drafting → Final → Published; Blocked, Cancelled off-pipeline)
- Universal verbs (`/deskwork:add`, `/deskwork:iterate`, `/deskwork:approve`, `/deskwork:publish`, `/deskwork:block`, `/deskwork:cancel`, `/deskwork:induct`, `/deskwork:status`, `/deskwork:doctor`)
- Per-stage primary artifacts (idea.md, plan.md, outline.md, index.md)
- Approve = graduation discipline (no "approve but stay")
- Re-induction semantics (preserve iterationByStage; default destinations)
- Blocked vs Cancelled (process flag; intent differs)

- [ ] **Step 2: Test that the Manual contains the new vocabulary and lacks the old**

```typescript
// packages/studio/test/help-vocabulary.test.ts
import { describe, it, expect } from 'vitest';
import { renderHelpPage } from '@/pages/help';

describe('help page vocabulary', () => {
  it('contains universal verbs', async () => {
    const html = await renderHelpPage();
    expect(html).toContain('/deskwork:iterate');
    expect(html).toContain('/deskwork:approve');
    expect(html).toContain('/deskwork:induct');
  });

  it('does not contain retired verbs', async () => {
    const html = await renderHelpPage();
    expect(html).not.toContain('/deskwork:plan');
    expect(html).not.toContain('/deskwork:outline');
    expect(html).not.toContain('/deskwork:draft');
    expect(html).not.toContain('/deskwork:review-start');
    expect(html).not.toContain('/deskwork:pause');
  });

  it('mentions all eight stages', async () => {
    const html = await renderHelpPage();
    for (const s of ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled']) {
      expect(html).toContain(s);
    }
  });
});
```

- [ ] **Step 3: Smoke**

```bash
deskwork-studio
# Visit /dev/editorial-help and read through; all paths and verbs should be canonical
```

- [ ] **Step 4: Commit**

```bash
git add packages/studio/src/pages/help.ts packages/studio/test/help-vocabulary.test.ts
git commit -m "feat(studio): rewrite Compositor's Manual with new vocabulary"
```

## Phase 6 checkpoint

Studio reflects the new model. Dashboard, review surface, index page, and Manual all updated.

```bash
deskwork-studio
# Boot studio; navigate every page; verify
```

---

# Phase 7 — Migration runbook + integration smoke + release

Goal: ship the redesign as a major release. MIGRATING.md, integration smoke against fresh project tree, ship via `/release`.

## Task 38: MIGRATING.md authoring

**Files:**
- Create or modify: `MIGRATING.md`

- [ ] **Step 1: Write MIGRATING.md**

Cover:
- What's changing (eight-stage layout, entry-uuid URLs, retired CLI verbs, sidecar schema)
- Adopter migration steps:
  1. `/plugin marketplace update deskwork`
  2. Read MIGRATING.md
  3. `deskwork doctor --check` (dry-run preview)
  4. `deskwork doctor --repair` (one-shot migration)
  5. `deskwork doctor` (verify post-migration)
  6. Commit the result
- Verb mapping (old → new):
  - `deskwork plan/outline/draft` → `deskwork iterate` + `deskwork approve` (drives the artifact through the stage's review cycle)
  - `deskwork pause` → `deskwork block`
  - `deskwork resume` → `deskwork induct`
  - `deskwork review-start` → covered by first `iterate` at a stage
  - `deskwork review-help` → `deskwork status`
- URL changes: old `/dev/editorial-review/<workflow-uuid>` → 404; new `/dev/editorial-review/<entry-uuid>`
- Custom skill prose: any project-internal skills referencing retired verbs need updating

- [ ] **Step 2: Commit**

```bash
git add MIGRATING.md
git commit -m "docs: MIGRATING.md for redesign release"
```

## Task 39: Integration smoke against fresh project tree

**Files:**
- Create: `scripts/smoke-redesign.sh`

- [ ] **Step 1: Write smoke script**

A bash script that exercises the redesign end-to-end:

1. mktemp project root
2. `deskwork init` (or scaffold .deskwork/config.json + calendar.md manually)
3. `/deskwork:add test-1 "Test Idea"` — verify sidecar + idea.md scaffold
4. `deskwork iterate test-1` — verify iteration v1
5. (Simulate operator approve) — set sidecar.reviewState = "approved"
6. `/deskwork:approve test-1` — verify advanced to Planned, scaffolded plan.md
7. Repeat iterate+approve through Outlining → Drafting → Final
8. `/deskwork:publish test-1 --date 2026-04-30` — verify Published, datePublished set
9. `deskwork doctor` — should pass

Script exits 0 on full success, 1 on any failure.

- [ ] **Step 2: Run script locally; iterate until green**

```bash
bash scripts/smoke-redesign.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-redesign.sh
git commit -m "test: end-to-end smoke for redesigned pipeline"
```

## Task 40: Audiocontrol.org calendar dry-run

**Files:** none (informational)

- [ ] **Step 1: With operator's permission, dry-run migration on the audiocontrol.org calendar**

```bash
cd ~/work/audiocontrol-work/audiocontrol.org
deskwork doctor --check  # dry-run; should report N entries
```

Verify the report looks sane. Operator decides whether to commit to the actual migration or wait for the release.

- [ ] **Step 2: Document the dry-run results in DEVELOPMENT-NOTES.md**

(No commit; this is an operator-facing report.)

## Task 41: Final regression run

**Files:** all

- [ ] **Step 1: Run all tests across the workspace**

```bash
npm test
```

Expected: all green.

- [ ] **Step 2: Run smoke**

```bash
bash scripts/smoke-redesign.sh
bash scripts/smoke-marketplace.sh  # existing release-blocking smoke
```

Expected: both green.

- [ ] **Step 3: Boot studio and walk every page**

```bash
deskwork-studio
# Navigate /dev/, /dev/editorial-studio, /dev/editorial-review/<entry>, /dev/editorial-help, /dev/content/
# Verify visually
```

## Task 42: Release via /release skill

- [ ] **Step 1: Bump version**

The redesign warrants a major bump. Choose v0.11.0 (or whatever the operator decides).

- [ ] **Step 2: Run /release skill**

Per the existing `/release` skill's five-pause flow:
1. Pause 1 (preconditions): clean tree, branch up to date, FF-eligible.
2. Pause 2 (post-bump diff): verify all manifest versions bumped; commit `chore: release v<X.Y.Z>`.
3. Pause 3 (npm publish): operator runs `make publish`; agent verifies via `assert-published`.
4. Pause 4 (smoke): `bash scripts/smoke-marketplace.sh` against freshly-published packages.
5. Pause 5 (atomic push): tag with the redesign-summary commit; push.

- [ ] **Step 3: Verify release page**

```bash
gh release view v<X.Y.Z>
```

Confirm: release notes prominently feature MIGRATING.md.

## Phase 7 checkpoint

Major version released. Existing adopters can migrate via `deskwork doctor --repair`. New adopters get the new model from the start.

---

## Self-review

**Spec coverage check** — every section of the design spec has corresponding tasks:

| Spec section | Tasks |
|---|---|
| Background and motivation | covered as plan rationale |
| The architectural fix | covered through phases 1-6 |
| Scope (in/out) | enforced via task selection |
| Conceptual model — stages, verbs, within-stage state | Tasks 1-2, 12, 15-21 |
| Data model — sidecar, calendar, journal events, frontmatter | Tasks 1-7 |
| CLI surface — iterate helper + skill prose | Tasks 12-22 |
| Studio review surface | Tasks 33-37 |
| LLM-as-judge in doctor | Task 20 |
| Doctor full validation surface | Tasks 23-32 |
| Migration | Tasks 8-11, 38, 40 |
| Sub-decisions S1-D2 | resolved as defaults; documented in skill prose |
| Acceptance criteria | implicit in Phase 7 |

**Placeholder scan:** No TBD/TODO/FIXME in plan steps. Some `// TODO:` comments in code samples reference future config-driven behavior (read contentDir from `.deskwork/config.json`); these are intentional and tracked.

**Type consistency:** `Entry`, `Stage`, `ReviewState`, `JournalEvent`, `Annotation` all defined in Task 1-3 and used consistently. Function names `readSidecar`, `writeSidecar`, `resolveEntryUuid`, `iterateEntry`, `validateAll`, `repairAll`, `migrateCalendar`, `detectLegacySchema`, `appendJournalEvent`, `readJournalEvents`, `renderCalendar`, `extractEntriesForMigration`, `resolveEntry`, `getAffordances`, `isRetired`, `printRetiredError` consistent across tasks where they appear.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-04-30-deskwork-pipeline-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best fit for a plan this size.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
