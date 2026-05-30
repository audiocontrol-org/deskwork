/**
 * AUDIT-20260529-40 — missing-member rows lose declared insertion
 * order.
 *
 * The loader splits resolved + missing UUIDs into separate arrays
 * (`members: Entry[]` and `missingMemberUuids: string[]`); the
 * renderer walks all resolved rows BEFORE all missing rows. So a
 * group declared as `[missing-a, real-b, missing-c]` displays as
 * `[real-b, missing-a, missing-c]`, violating the list-mode contract
 * that members preserve `group.members[]` insertion order.
 *
 * Fix: introduce an ordered member-item structure that carries
 * `{kind: 'resolved', entry} | {kind: 'missing', uuid} | {kind:
 * 'corrupt', uuid}` per original UUID position. The loader emits
 * this ordered sequence; the renderer walks it directly so insertion
 * order is preserved end-to-end.
 *
 * Per `.claude/rules/ui-verification.md` § "spec-compliance probes":
 * this test asserts ORDERED row positions, not just that all UUIDs
 * appear. We seed a group as
 * `[MISSING_A, GOOD_B, CORRUPT_C, MISSING_D, GOOD_E]` and check the
 * rendered rows appear in EXACTLY that order in the HTML output.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';

const GROUP_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// Declared order: MISSING_A, GOOD_B, CORRUPT_C, MISSING_D, GOOD_E.
// The renderer must preserve this exact sequence.
const MISSING_A_UUID = '11111111-1111-4111-8111-111111111111';
const GOOD_B_UUID    = '22222222-2222-4222-8222-222222222222';
const CORRUPT_C_UUID = '33333333-3333-4333-8333-333333333333';
const MISSING_D_UUID = '44444444-4444-4444-8444-444444444444';
const GOOD_E_UUID    = '55555555-5555-4555-8555-555555555555';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
    defaultSite: 'd',
  };
}

function makeEntry(
  overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>,
): Entry {
  return {
    keywords: [],
    source: 'manual',
    iterationByStage: { [overrides.currentStage]: 1 },
    createdAt: '2026-05-29T10:00:00.000Z',
    updatedAt: '2026-05-29T10:00:00.000Z',
    ...overrides,
  } as Entry;
}

function writeLaneConfig(
  root: string,
  id: string,
  name: string,
  pipeline: string,
  contentDir: string,
): Promise<void> {
  return writeFile(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
  );
}

/**
 * Extract the list-view body section from the full server-rendered
 * HTML. The list-view is what the `?members=list` URL surfaces; the
 * composed-view body is also server-rendered alongside it (hidden
 * via toggle), so scoping to the list-view body is required for the
 * UUID-position check to mean "list-view row position" rather than
 * "first DOM occurrence anywhere in the page."
 */
function extractListBody(html: string): string {
  // The list-view body sits under `<div class="er-members-body-list"
  // data-body-list ...>...</div>`. Slice from the opening marker to
  // the next `</section>` to capture the whole body block.
  const startMarker = 'data-body-list';
  const start = html.indexOf(startMarker);
  if (start === -1) {
    throw new Error('list-view body not found in rendered HTML');
  }
  const end = html.indexOf('</section>', start);
  if (end === -1) {
    throw new Error('list-view body closing tag not found');
  }
  return html.slice(start, end);
}

/**
 * Find the index of each UUID's row in the list-view body slice.
 * Returns -1 if not found.
 */
function rowIndex(listBody: string, uuid: string): number {
  return listBody.indexOf(uuid);
}

describe('AUDIT-40 — list-view preserves declared insertion order', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-audit-40-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');

    // MISSING_A → no file written; readSidecar throws ENOENT.

    await writeSidecar(projectRoot, makeEntry({
      uuid: GOOD_B_UUID,
      slug: 'good-b',
      title: 'Good B member',
      currentStage: 'Drafting',
      lane: 'default',
    }));

    // CORRUPT_C → file present, JSON invalid.
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${CORRUPT_C_UUID}.json`),
      '{ not json',
    );

    // MISSING_D → no file written.

    await writeSidecar(projectRoot, makeEntry({
      uuid: GOOD_E_UUID,
      slug: 'good-e',
      title: 'Good E member',
      currentStage: 'Drafting',
      lane: 'default',
    }));

    // Group declares the five UUIDs in this exact order. The renderer
    // must surface them in this order in list view (the operator's
    // expectation per the brief's acceptance criterion).
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_UUID,
      slug: 'order-test-group',
      title: 'Order-test group',
      currentStage: 'Drafting',
      lane: 'default',
      members: [
        MISSING_A_UUID,
        GOOD_B_UUID,
        CORRUPT_C_UUID,
        MISSING_D_UUID,
        GOOD_E_UUID,
      ],
      artifactPath: 'docs/g/index.md',
    }));
    await mkdir(join(projectRoot, 'docs', 'g'), { recursive: true });
    await writeFile(join(projectRoot, 'docs', 'g', 'index.md'), '# g\n');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders all five rows in declared order (resolved + missing + corrupt interleaved)', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(
      new Request(`http://x/dev/editorial-review/entry/${GROUP_UUID}?members=list`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // Scope the index search to the list-view body slice — the
    // composed-view body is also server-rendered (hidden behind the
    // toggle) and would contaminate the search with first-occurrence-
    // anywhere-in-page artifacts. We're checking ORDER WITHIN the
    // list view, not "did the UUID appear somewhere on the page."
    const listBody = extractListBody(html);

    // All five UUIDs must appear in the list view (sanity check).
    const idxA = rowIndex(listBody, MISSING_A_UUID);
    const idxB = rowIndex(listBody, GOOD_B_UUID);
    const idxC = rowIndex(listBody, CORRUPT_C_UUID);
    const idxD = rowIndex(listBody, MISSING_D_UUID);
    const idxE = rowIndex(listBody, GOOD_E_UUID);
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(-1);
    expect(idxC).toBeGreaterThan(-1);
    expect(idxD).toBeGreaterThan(-1);
    expect(idxE).toBeGreaterThan(-1);

    // The five rows must appear in declared order:
    // MISSING_A < GOOD_B < CORRUPT_C < MISSING_D < GOOD_E.
    // Before the fix, the renderer concatenated resolved rows first
    // (B, E), then corrupt rows (C), then missing rows (A, D) —
    // producing order B, E, C, A, D, which violates the operator's
    // declared insertion order.
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
    expect(idxC).toBeLessThan(idxD);
    expect(idxD).toBeLessThan(idxE);
  });
});
