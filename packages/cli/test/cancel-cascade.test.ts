/**
 * deskwork CLI `cancel --cascade` — group cancel propagation.
 *
 * Phase 7 Task 7.2 Step 7.2.6 (graphical-entries). Per the
 * universal-verb-no-cascade rule (DESKWORK-STATE-MACHINE.md
 * Commandment II + PRD § Group lifecycle), cancel on a group does
 * NOT propagate to members by default. The `--cascade` flag is the
 * operator's opt-in signal.
 *
 * Verifies:
 *   - default cancel on a group leaves members untouched.
 *   - `--cascade` cancels the group AND every member.
 *   - members already off-pipeline are SKIPPED (not refused).
 *   - non-group entries ignore `--cascade` (no-op).
 *   - missing-member UUIDs surface as skipped reads rather than aborting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-cancel-cascade-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  mkdirSync(join(project, '.deskwork', 'lanes'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'lanes', 'default.json'),
    JSON.stringify({
      id: 'default',
      name: 'Default',
      pipelineTemplate: 'editorial',
    }),
    'utf-8',
  );
});

afterEach(() => { rmSync(project, { recursive: true, force: true }); });

interface SidecarOpts {
  readonly members?: readonly string[];
  readonly currentStage?: string;
}

function writeSidecar(
  uuid: string,
  slug: string,
  opts: SidecarOpts = {},
): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid,
      slug,
      title: slug,
      keywords: [],
      source: 'manual',
      currentStage: opts.currentStage ?? 'Drafting',
      iterationByStage: {},
      lane: 'default',
      ...(opts.members !== undefined && { members: opts.members }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function readSidecar(uuid: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cancel(slug: string, ...extra: string[]): RunResult {
  const r = spawnSync(
    deskworkBin,
    ['cancel', project, slug, ...extra],
    { encoding: 'utf-8' },
  );
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

describe('deskwork cancel --cascade', () => {
  const groupUuid = '550e8400-e29b-41d4-a716-446655440701';
  const memberA = '550e8400-e29b-41d4-a716-446655440702';
  const memberB = '550e8400-e29b-41d4-a716-446655440703';

  it('default behaviour: cancel on a group does NOT propagate to members', () => {
    writeSidecar(memberA, 'm-a', { currentStage: 'Drafting' });
    writeSidecar(memberB, 'm-b', { currentStage: 'Outlining' });
    writeSidecar(groupUuid, 'my-group', {
      members: [memberA, memberB],
      currentStage: 'Drafting',
    });

    const res = cancel('my-group');
    expect(res.code).toBe(0);

    // Group cancelled
    expect(readSidecar(groupUuid)['currentStage']).toBe('Cancelled');
    // Members UNTOUCHED
    expect(readSidecar(memberA)['currentStage']).toBe('Drafting');
    expect(readSidecar(memberB)['currentStage']).toBe('Outlining');
  });

  it('--cascade: cancels the group AND every member', () => {
    writeSidecar(memberA, 'm-a', { currentStage: 'Drafting' });
    writeSidecar(memberB, 'm-b', { currentStage: 'Outlining' });
    writeSidecar(groupUuid, 'my-group', {
      members: [memberA, memberB],
      currentStage: 'Drafting',
    });

    const res = cancel('my-group', '--cascade');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    expect(readSidecar(groupUuid)['currentStage']).toBe('Cancelled');
    expect(readSidecar(memberA)['currentStage']).toBe('Cancelled');
    expect(readSidecar(memberB)['currentStage']).toBe('Cancelled');

    const parsed = JSON.parse(res.stdout) as {
      cascade: boolean;
      cascadedMembers: Array<{ slug: string }>;
      skippedMembers: unknown[];
    };
    expect(parsed.cascade).toBe(true);
    expect(parsed.cascadedMembers.map((m) => m.slug).sort()).toEqual(['m-a', 'm-b']);
    expect(parsed.skippedMembers).toHaveLength(0);
  });

  it('--cascade: skips members already off-pipeline (Cancelled / Blocked)', () => {
    writeSidecar(memberA, 'm-a', { currentStage: 'Cancelled' });
    writeSidecar(memberB, 'm-b', { currentStage: 'Drafting' });
    writeSidecar(groupUuid, 'my-group', {
      members: [memberA, memberB],
      currentStage: 'Drafting',
    });

    const res = cancel('my-group', '--cascade');
    expect(res.code).toBe(0);

    const parsed = JSON.parse(res.stdout) as {
      cascadedMembers: Array<{ slug: string }>;
      skippedMembers: Array<{ slug: string; reason: string }>;
    };
    expect(parsed.cascadedMembers.map((m) => m.slug)).toEqual(['m-b']);
    expect(parsed.skippedMembers).toHaveLength(1);
    expect(parsed.skippedMembers[0].slug).toBe('m-a');
    expect(parsed.skippedMembers[0].reason).toMatch(/already off-pipeline/);
  });

  it('--cascade: skips members at the terminal stage (Published)', () => {
    writeSidecar(memberA, 'm-a-pub', { currentStage: 'Published' });
    writeSidecar(memberB, 'm-b-draft', { currentStage: 'Drafting' });
    writeSidecar(groupUuid, 'my-group', {
      members: [memberA, memberB],
      currentStage: 'Drafting',
    });

    const res = cancel('my-group', '--cascade');
    expect(res.code).toBe(0);

    const parsed = JSON.parse(res.stdout) as {
      skippedMembers: Array<{ slug: string; reason: string }>;
    };
    const pubSkip = parsed.skippedMembers.find((m) => m.slug === 'm-a-pub');
    expect(pubSkip).toBeDefined();
    expect(pubSkip?.reason).toMatch(/terminal/);
    // The Published member's stage is preserved
    expect(readSidecar(memberA)['currentStage']).toBe('Published');
  });

  it('--cascade: missing member UUID surfaces as a skipped read', () => {
    const missing = '550e8400-e29b-41d4-a716-446655440799';
    writeSidecar(memberA, 'm-a-present', { currentStage: 'Drafting' });
    writeSidecar(groupUuid, 'dangling-group', {
      members: [memberA, missing],
      currentStage: 'Drafting',
    });

    const res = cancel('dangling-group', '--cascade');
    expect(res.code).toBe(0);

    const parsed = JSON.parse(res.stdout) as {
      cascadedMembers: Array<{ slug: string }>;
      skippedMembers: Array<{ slug: string; reason: string }>;
    };
    expect(parsed.cascadedMembers.map((m) => m.slug)).toEqual(['m-a-present']);
    expect(parsed.skippedMembers).toHaveLength(1);
    expect(parsed.skippedMembers[0].reason).toMatch(/sidecar not found/);
  });

  it('--cascade is a no-op on non-group entries (no members[])', () => {
    writeSidecar('550e8400-e29b-41d4-a716-446655440801', 'plain', {
      currentStage: 'Drafting',
    });
    const res = cancel('plain', '--cascade');
    expect(res.code).toBe(0);

    const parsed = JSON.parse(res.stdout) as {
      cascade: boolean;
      cascadedMembers: unknown[];
      skippedMembers: unknown[];
    };
    expect(parsed.cascade).toBe(true);
    expect(parsed.cascadedMembers).toEqual([]);
    expect(parsed.skippedMembers).toEqual([]);
  });

  it('--cascade emits stage-transition events for every member', () => {
    writeSidecar(memberA, 'evt-a', { currentStage: 'Drafting' });
    writeSidecar(memberB, 'evt-b', { currentStage: 'Outlining' });
    writeSidecar(groupUuid, 'evt-group', {
      members: [memberA, memberB],
      currentStage: 'Drafting',
    });

    cancel('evt-group', '--cascade');

    const dir = join(project, '.deskwork', 'review-journal', 'history');
    const events = readdirSync(dir).map((name) =>
      JSON.parse(readFileSync(join(dir, name), 'utf-8')) as {
        kind: string;
        to?: string;
        entryId?: string;
      },
    );
    const transitions = events.filter((e) => e.kind === 'stage-transition');
    // Three transitions: one per entry (group + two members)
    expect(transitions).toHaveLength(3);
    const cancelled = transitions
      .filter((e) => e.to === 'Cancelled')
      .map((e) => e.entryId)
      .sort();
    expect(cancelled).toEqual([groupUuid, memberA, memberB].sort());
  });
});
