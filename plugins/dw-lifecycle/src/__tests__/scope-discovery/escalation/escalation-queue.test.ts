/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/escalation/escalation-queue.test.ts
 *
 * Phase 11 Task 9 — Persistent escalation queue tests.
 *
 * Round-trip: enqueue → read → resolve. Verifies single-JSON-file shape,
 * provenance trail via MOVE-to-resolved-escalations, and that malformed
 * input throws.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enqueueEscalation,
  readPendingEscalations,
  readResolvedEscalation,
  resolveEscalation,
} from '../../../scope-discovery/escalation/escalation-queue.js';
import {
  PENDING_ESCALATIONS_SUBDIR,
  RESOLVED_ESCALATIONS_SUBDIR,
  type EscalationEvidence,
  type EscalationOption,
  type EscalationRequestInput,
} from '../../../scope-discovery/escalation/escalation-types.js';

const RUNTIME_DIR = '.dw-lifecycle/scope-discovery/orchestrator-runtime';

function sampleEvidence(): EscalationEvidence {
  return {
    summary: '3 of 4 negative-space findings overturned by auditor this week.',
    links: [
      'docs/1.0/001-IN-PROGRESS/scope-discovery/audit-log.md',
      'https://github.com/audiocontrol-org/deskwork/issues/315',
    ],
    excerpts: ['AUDIT-2026-05-25-01: disagreed with disposition on cand-7'],
  };
}

function sampleOptions(): ReadonlyArray<EscalationOption> {
  return [
    {
      id: 'cursed-blanket',
      summary: 'Apply cursed status across the negative-space class.',
      detail: 'Treats all 4 candidates as the same pattern; aggressive.',
    },
    {
      id: 'cursed-narrow',
      summary: 'Apply cursed only to the audiocontrol-specific case.',
    },
    {
      id: 'defer',
      summary: 'Hold the dispositions in pending; collect more evidence.',
    },
  ];
}

function sampleInput(): EscalationRequestInput {
  return {
    actionProposed: 'Set status=cursed on negative-space-12 across the catalog.',
    evidence: sampleEvidence(),
    reasoning:
      'Auditor disagreement rate on this pattern class has exceeded the controller threshold.',
    question:
      'Should this become a blanket-cursed pattern, or is audiocontrol the only valid hit?',
    options: sampleOptions(),
  };
}

describe('enqueueEscalation', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'esc-queue-enqueue-'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes a single JSON file under pending-escalations/', async () => {
    const request = await enqueueEscalation(sampleInput(), {
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
    expect(request.version).toBe(1);
    expect(request.resolution).toBeNull();
    const path = join(
      root,
      RUNTIME_DIR,
      PENDING_ESCALATIONS_SUBDIR,
      `${request.id}.json`,
    );
    const text = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(text);
    expect(parsed).toMatchObject({
      version: 1,
      id: request.id,
      actionProposed: sampleInput().actionProposed,
      resolution: null,
    });
  });

  it('uses provided id + queuedAt when supplied', async () => {
    const request = await enqueueEscalation(
      {
        ...sampleInput(),
        id: '20260526120000-deadbe',
        queuedAt: '2026-05-26T12:00:00Z',
      },
      { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
    );
    expect(request.id).toBe('20260526120000-deadbe');
    expect(request.queuedAt).toBe('2026-05-26T12:00:00Z');
  });

  it('throws when actionProposed is empty', async () => {
    await expect(
      enqueueEscalation(
        { ...sampleInput(), actionProposed: '' },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      ),
    ).rejects.toThrow(/`actionProposed` must be non-empty/);
  });

  it('throws when reasoning is empty', async () => {
    await expect(
      enqueueEscalation(
        { ...sampleInput(), reasoning: '' },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      ),
    ).rejects.toThrow(/`reasoning` must be non-empty/);
  });

  it('throws when question is empty', async () => {
    await expect(
      enqueueEscalation(
        { ...sampleInput(), question: '' },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      ),
    ).rejects.toThrow(/`question` must be non-empty/);
  });

  it('throws when options list is empty', async () => {
    await expect(
      enqueueEscalation(
        { ...sampleInput(), options: [] },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      ),
    ).rejects.toThrow(/at least one option/);
  });

  it('throws on duplicate option ids', async () => {
    await expect(
      enqueueEscalation(
        {
          ...sampleInput(),
          options: [
            { id: 'a', summary: 'first' },
            { id: 'a', summary: 'second' },
          ],
        },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      ),
    ).rejects.toThrow(/duplicate option id "a"/);
  });
});

describe('readPendingEscalations', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'esc-queue-read-'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] when the dir does not exist', async () => {
    const out = await readPendingEscalations({
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
    expect(out).toEqual([]);
  });

  it('lists pending escalations chronologically by id', async () => {
    await enqueueEscalation(
      { ...sampleInput(), id: '20260526120000-aaa111' },
      { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
    );
    await enqueueEscalation(
      { ...sampleInput(), id: '20260526110000-bbb222' },
      { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
    );
    await enqueueEscalation(
      { ...sampleInput(), id: '20260526130000-ccc333' },
      { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
    );
    const out = await readPendingEscalations({
      repoRoot: root,
      runtimeDirOverride: RUNTIME_DIR,
    });
    expect(out.map((r) => r.id)).toEqual([
      '20260526110000-bbb222',
      '20260526120000-aaa111',
      '20260526130000-ccc333',
    ]);
  });

  it('throws on malformed JSON file in the pending dir', async () => {
    const dir = join(root, RUNTIME_DIR, PENDING_ESCALATIONS_SUBDIR);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bad.json'), '{not-json', 'utf8');
    await expect(
      readPendingEscalations({
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      }),
    ).rejects.toThrow(/cannot parse/);
  });

  it('skips temp files left by atomic-write', async () => {
    // Note: this test starts from a fresh root because the prior test
    // intentionally planted a malformed file that breaks subsequent reads.
    const freshRoot = await mkdtemp(join(tmpdir(), 'esc-queue-skip-'));
    try {
      const dir = join(freshRoot, RUNTIME_DIR, PENDING_ESCALATIONS_SUBDIR);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'somefile.json.tmp'), 'partial', 'utf8');
      await enqueueEscalation(
        { ...sampleInput(), id: '20260526120000-real00' },
        { repoRoot: freshRoot, runtimeDirOverride: RUNTIME_DIR },
      );
      const out = await readPendingEscalations({
        repoRoot: freshRoot,
        runtimeDirOverride: RUNTIME_DIR,
      });
      expect(out).toHaveLength(1);
      expect(out[0]?.id).toBe('20260526120000-real00');
    } finally {
      await rm(freshRoot, { recursive: true, force: true });
    }
  });
});

describe('resolveEscalation', () => {
  it('moves the file from pending → resolved with the resolution stamped', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-resolve-'));
    try {
      const queued = await enqueueEscalation(sampleInput(), {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      const resolved = await resolveEscalation(
        queued.id,
        {
          decisionTaken: 'go with cursed-narrow',
          selectedOptionId: 'cursed-narrow',
          resolvedAtOverride: '2026-05-26T14:00:00Z',
        },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      );
      expect(resolved.resolution).toEqual({
        resolvedAt: '2026-05-26T14:00:00Z',
        selectedOptionId: 'cursed-narrow',
        decisionTaken: 'go with cursed-narrow',
      });
      // The pending file is gone.
      const pendingDir = join(
        root,
        RUNTIME_DIR,
        PENDING_ESCALATIONS_SUBDIR,
      );
      const pendingEntries = await readdir(pendingDir);
      expect(pendingEntries.filter((e) => e === `${queued.id}.json`)).toEqual(
        [],
      );
      // The resolved file is present.
      const resolvedDir = join(
        root,
        RUNTIME_DIR,
        RESOLVED_ESCALATIONS_SUBDIR,
      );
      const resolvedEntries = await readdir(resolvedDir);
      expect(resolvedEntries).toContain(`${queued.id}.json`);
      // readPendingEscalations no longer surfaces it.
      const pendingList = await readPendingEscalations({
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      expect(pendingList.map((r) => r.id)).not.toContain(queued.id);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts a free-form decision with selectedOptionId=null', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-freeform-'));
    try {
      const queued = await enqueueEscalation(sampleInput(), {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      const resolved = await resolveEscalation(
        queued.id,
        {
          decisionTaken:
            'none of the options fit; widen the catalog with a new pattern type before deciding',
          selectedOptionId: null,
        },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      );
      expect(resolved.resolution?.selectedOptionId).toBeNull();
      expect(resolved.resolution?.decisionTaken).toMatch(/widen the catalog/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('throws when the id is unknown', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-unknown-'));
    try {
      await expect(
        resolveEscalation(
          'does-not-exist',
          { decisionTaken: 'whatever', selectedOptionId: null },
          { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
        ),
      ).rejects.toThrow(/no pending escalation with id "does-not-exist"/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('throws when selectedOptionId does not match any option', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-bad-opt-'));
    try {
      const queued = await enqueueEscalation(sampleInput(), {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      await expect(
        resolveEscalation(
          queued.id,
          { decisionTaken: 'pick X', selectedOptionId: 'made-up' },
          { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
        ),
      ).rejects.toThrow(
        /selectedOptionId "made-up" does not match any option/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('throws when decisionTaken is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-empty-dec-'));
    try {
      const queued = await enqueueEscalation(sampleInput(), {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      await expect(
        resolveEscalation(
          queued.id,
          { decisionTaken: '', selectedOptionId: null },
          { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
        ),
      ).rejects.toThrow(/`decisionTaken` must be non-empty/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('refuses to resolve an already-resolved escalation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-double-'));
    try {
      const queued = await enqueueEscalation(sampleInput(), {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      await resolveEscalation(
        queued.id,
        { decisionTaken: 'first', selectedOptionId: 'defer' },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      );
      // Plant a stale pending file with the same id so the resolver
      // can find it and reach the already-resolved guard. This
      // simulates a malformed-disk-state scenario (the queue's normal
      // resolve path unlinks the pending file).
      const stalePath = join(
        root,
        RUNTIME_DIR,
        PENDING_ESCALATIONS_SUBDIR,
        `${queued.id}.json`,
      );
      const resolvedPathAbs = join(
        root,
        RUNTIME_DIR,
        RESOLVED_ESCALATIONS_SUBDIR,
        `${queued.id}.json`,
      );
      const resolvedText = await readFile(resolvedPathAbs, 'utf8');
      await mkdir(
        join(root, RUNTIME_DIR, PENDING_ESCALATIONS_SUBDIR),
        { recursive: true },
      );
      await writeFile(stalePath, resolvedText, 'utf8');
      await expect(
        resolveEscalation(
          queued.id,
          { decisionTaken: 'second', selectedOptionId: 'defer' },
          { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
        ),
      ).rejects.toThrow(/already has a resolution/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('readResolvedEscalation', () => {
  it('returns null when no resolved file exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-no-resolved-'));
    try {
      const out = await readResolvedEscalation('whatever', {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      expect(out).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns the resolved escalation after resolveEscalation runs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'esc-queue-roundtrip-'));
    try {
      const queued = await enqueueEscalation(sampleInput(), {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      await resolveEscalation(
        queued.id,
        { decisionTaken: 'go cursed-narrow', selectedOptionId: 'cursed-narrow' },
        { repoRoot: root, runtimeDirOverride: RUNTIME_DIR },
      );
      const found = await readResolvedEscalation(queued.id, {
        repoRoot: root,
        runtimeDirOverride: RUNTIME_DIR,
      });
      expect(found).not.toBeNull();
      expect(found?.resolution?.selectedOptionId).toBe('cursed-narrow');
      expect(found?.resolution?.decisionTaken).toBe('go cursed-narrow');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
