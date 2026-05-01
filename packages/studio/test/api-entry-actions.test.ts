/**
 * POST /api/dev/editorial-review/entry/:entryId/{approve,block,cancel,induct}
 * — Phase 30 entry-stage actions wired into the studio (#146).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar, readSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

const KNOWN_UUID = '11111111-1111-4111-8111-111111111111';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'docs',
        calendarPath: 'docs/cal-a.md',
      },
    },
    defaultSite: 'a',
  };
}

function entry(stage: Entry['currentStage'], overrides: Partial<Entry> = {}): Entry {
  return {
    uuid: KNOWN_UUID,
    slug: 'foo',
    title: 'Foo',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: {},
    createdAt: '2026-04-30T10:00:00.000Z',
    updatedAt: '2026-04-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('POST /api/dev/editorial-review/entry/:entryId/<action>', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-entry-actions-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('approve graduates Ideas → Planned', async () => {
    await writeSidecar(projectRoot, entry('Ideas'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${KNOWN_UUID}/approve`, { method: 'POST' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fromStage).toBe('Ideas');
    expect(body.toStage).toBe('Planned');
    const sidecar = await readSidecar(projectRoot, KNOWN_UUID);
    expect(sidecar.currentStage).toBe('Planned');
  });

  it('approve refuses Final (publish, not approve)', async () => {
    await writeSidecar(projectRoot, entry('Final'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${KNOWN_UUID}/approve`, { method: 'POST' }),
    );
    expect(res.status).toBe(400);
  });

  it('block moves Drafting → Blocked, records priorStage', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${KNOWN_UUID}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'stalled' }),
      }),
    );
    expect(res.status).toBe(200);
    const sidecar = await readSidecar(projectRoot, KNOWN_UUID);
    expect(sidecar.currentStage).toBe('Blocked');
    expect(sidecar.priorStage).toBe('Drafting');
  });

  it('cancel moves Ideas → Cancelled', async () => {
    await writeSidecar(projectRoot, entry('Ideas'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${KNOWN_UUID}/cancel`, {
        method: 'POST',
      }),
    );
    expect(res.status).toBe(200);
    const sidecar = await readSidecar(projectRoot, KNOWN_UUID);
    expect(sidecar.currentStage).toBe('Cancelled');
  });

  it('induct returns a Blocked entry to its priorStage', async () => {
    await writeSidecar(projectRoot, entry('Blocked', { priorStage: 'Outlining' }));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${KNOWN_UUID}/induct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStage: 'Outlining' }),
      }),
    );
    expect(res.status).toBe(200);
    const sidecar = await readSidecar(projectRoot, KNOWN_UUID);
    expect(sidecar.currentStage).toBe('Outlining');
    expect(sidecar.priorStage).toBeUndefined();
  });

  it('induct rejects invalid targetStage', async () => {
    await writeSidecar(projectRoot, entry('Drafting'));
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/api/dev/editorial-review/entry/${KNOWN_UUID}/induct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStage: 'NotAStage' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
