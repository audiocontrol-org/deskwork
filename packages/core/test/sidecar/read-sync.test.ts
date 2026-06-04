/**
 * Phase 39c-2b(a) — `readSidecarSync`.
 *
 * The shortform/longform workflow path resolvers (`review/workflow-paths.ts`)
 * are synchronous and now need the sidecar's `artifactPath`. `readSidecar`
 * is async; this sync variant reads the same sidecar with `readFileSync`
 * and shares the JSON/schema parse + error messages with the async reader.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSidecarSync } from '../../src/sidecar/read.ts';

let project: string;
const UUID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-read-sync-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function writeSidecar(extras: Record<string, unknown> = {}): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${UUID}.json`),
    JSON.stringify({
      uuid: UUID,
      slug: 'sync-post',
      title: 'Sync Post',
      keywords: [],
      source: 'manual',
      currentStage: 'Drafting',
      iterationByStage: {},
      createdAt: '2026-06-02T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
      ...extras,
    }),
    'utf-8',
  );
}

describe('readSidecarSync — 39c-2b(a)', () => {
  it('reads + validates a sidecar synchronously, returning the parsed Entry', () => {
    writeSidecar({ artifactPath: 'docs/sync-post/index.md' });
    const entry = readSidecarSync(project, UUID);
    expect(entry.uuid).toBe(UUID);
    expect(entry.slug).toBe('sync-post');
    expect(entry.artifactPath).toBe('docs/sync-post/index.md');
  });

  it('throws sidecar-not-found for a missing sidecar', () => {
    expect(() => readSidecarSync(project, UUID)).toThrow(/sidecar not found/);
  });
});
