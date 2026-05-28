/**
 * Shared multi-lane fixture builder for Phase 5 Task 5.6 — used by
 * both the node-env server integration test
 * (`dashboard-swimlane-integration.test.ts`) and the jsdom-env
 * client integration test
 * (`dashboard-swimlane-integration-client.test.ts`).
 *
 * The two test files MUST share one fixture-builder so the canonical
 * "3 lanes × 2 entries" tree shape is asserted exactly once and
 * exercised on both sides of the wire.
 *
 * Stage assignments per lane (chosen so each lane has one linear and
 * one locked stage, surfacing the lockedStages dispatch + verb-chip
 * chrome in both view modes):
 *   - default (editorial pipeline): Drafting (linear) + Final (locked)
 *   - mockups (visual pipeline):    Sketched + Approved (locked)
 *   - qa      (qa-plan pipeline):   Drafted + Reviewed (locked)
 *
 * The two-file split is forced by an environment incompatibility:
 * `@deskwork/studio/src/server.ts` transitively imports `esbuild`,
 * whose module-level invariant
 * `new TextEncoder().encode("") instanceof Uint8Array` fails under
 * jsdom (jsdom's Uint8Array shim breaks the cross-realm check). The
 * node-env file boots the real server and asserts the HTML+CSS
 * contract end-to-end against the on-disk fixture; the jsdom-env
 * file mounts a synthesised DOM mirroring the server's output shape
 * + exercises the real client controllers. Together they cover the
 * full integration contract Task 5.6 specifies.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';

/** Stable UUIDs — 2 entries per lane × 3 lanes = 6 entries total. */
export const UUID_DEFAULT_DRAFTING = '11111111-1111-4111-8111-111111111111';
export const UUID_DEFAULT_FINAL = '12121212-1212-4121-8121-121212121212';
export const UUID_MOCKUPS_SKETCHED = '22222222-2222-4222-8222-222222222222';
export const UUID_MOCKUPS_APPROVED = '33333333-3333-4333-8333-333333333333';
export const UUID_QA_DRAFTED = '44444444-4444-4444-8444-444444444444';
export const UUID_QA_REVIEWED = '45454545-4545-4545-8545-454545454545';

export function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
}

export function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    uuid: UUID_DEFAULT_DRAFTING,
    slug: 'placeholder',
    title: 'Placeholder',
    keywords: [],
    source: 'manual',
    currentStage: 'Ideas',
    iterationByStage: { Ideas: 0 },
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-28T10:00:00.000Z',
    ...overrides,
  };
}

function writeLane(
  root: string,
  id: string,
  name: string,
  pipelineTemplate: string,
  contentDir: string,
): void {
  writeFileSync(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate, contentDir }, null, 2),
    'utf8',
  );
}

/**
 * Build the canonical Task 5.6 multi-lane fixture in a fresh tmp
 * directory. Returns the absolute path to the fixture root. Callers
 * are responsible for `rmSync` on cleanup.
 */
export async function buildMultiLaneFixture(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-task-5-6-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
  writeLane(root, 'default', 'Editorial', 'editorial', 'docs');
  writeLane(root, 'mockups', 'Mockups', 'visual', 'mockups');
  writeLane(root, 'qa', 'QA', 'qa-plan', 'qa');
  // default lane — Drafting + Final.
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_DEFAULT_DRAFTING,
      slug: 'default-1',
      title: 'Default Drafting',
      currentStage: 'Drafting',
      iterationByStage: { Drafting: 1 },
      lane: 'default',
    }),
  );
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_DEFAULT_FINAL,
      slug: 'default-2',
      title: 'Default Final',
      currentStage: 'Final',
      iterationByStage: { Final: 0 },
      lane: 'default',
    }),
  );
  // mockups lane — Sketched + Approved.
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_MOCKUPS_SKETCHED,
      slug: 'mockups-1',
      title: 'Mockups Sketched',
      currentStage: 'Sketched',
      iterationByStage: { Sketched: 0 },
      lane: 'mockups',
    }),
  );
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_MOCKUPS_APPROVED,
      slug: 'mockups-2',
      title: 'Mockups Approved',
      currentStage: 'Approved',
      iterationByStage: { Approved: 0 },
      lane: 'mockups',
    }),
  );
  // qa lane — Drafted + Reviewed.
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_QA_DRAFTED,
      slug: 'qa-1',
      title: 'QA Drafted',
      currentStage: 'Drafted',
      iterationByStage: { Drafted: 0 },
      lane: 'qa',
    }),
  );
  await writeSidecar(
    root,
    makeEntry({
      uuid: UUID_QA_REVIEWED,
      slug: 'qa-2',
      title: 'QA Reviewed',
      currentStage: 'Reviewed',
      iterationByStage: { Reviewed: 0 },
      lane: 'qa',
    }),
  );
  return root;
}
