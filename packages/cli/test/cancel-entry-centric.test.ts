/**
 * deskwork CLI `cancel` subcommand — entry-centric atomic transition.
 *
 * Mirrors block-entry-centric.test.ts. Cancel is stage-equivalent to
 * block — both transition to off-pipeline stages with priorStage
 * preserved — but cancel signals abandonment intent vs. block's pause
 * intent.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-cancel-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
});

afterEach(() => { rmSync(project, { recursive: true, force: true }); });

function writeSidecar(uuid: string, slug: string, currentStage: string): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid, slug, title: slug,
      keywords: [], source: 'manual',
      currentStage,
      iterationByStage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function readSidecar(uuid: string): { currentStage: string; priorStage?: string } {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}

function readJournalEvents(): Array<{ kind: string; from?: string; to?: string; reason?: string }> {
  const dir = join(project, '.deskwork', 'review-journal', 'history');
  try {
    const files = readdirSync(dir);
    return files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
  } catch { return []; }
}

function cancel(slug: string, ...extraArgs: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['cancel', project, slug, ...extraArgs], { encoding: 'utf-8' });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('deskwork cancel — entry-centric off-pipeline transition', () => {
  it('cancels an Outlining entry → Cancelled + records priorStage', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    writeSidecar(uuid, 'abandoning', 'Outlining');

    const res = cancel('abandoning');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const sidecar = readSidecar(uuid);
    expect(sidecar.currentStage).toBe('Cancelled');
    expect(sidecar.priorStage).toBe('Outlining');

    const transitions = readJournalEvents().filter((e) => e.kind === 'stage-transition');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ from: 'Outlining', to: 'Cancelled' });
  });

  it('refuses to cancel an already-Cancelled entry', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    writeSidecar(uuid, 'dead', 'Cancelled');

    const res = cancel('dead');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already Cancelled/i);
  });

  it('refuses to cancel a Published entry (Published is terminal)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440002';
    writeSidecar(uuid, 'shipped', 'Published');

    const res = cancel('shipped');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Published is terminal|Cannot cancel/i);
  });

  it('passes --reason through to the journal event', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440003';
    writeSidecar(uuid, 'scope-creep', 'Drafting');

    const res = cancel('scope-creep', '--reason', 'scope crept; abandoning');
    expect(res.code).toBe(0);

    const transitions = readJournalEvents().filter((e) => e.kind === 'stage-transition');
    expect(transitions[0]).toMatchObject({
      from: 'Drafting',
      to: 'Cancelled',
      reason: 'scope crept; abandoning',
    });
  });
});
