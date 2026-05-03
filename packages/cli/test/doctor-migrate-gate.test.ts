/**
 * Unit tests for the doctor command's legacy-schema migration gate
 * (Phase 29). Covers the four control-flow branches in `maybeMigrate`:
 *
 *  1. Schema is already entry-centric → handled=false (caller falls
 *     through to the rule loop with no migration work).
 *  2. Legacy schema + --check → dry-run preview, handled=true, exit 1.
 *  3. Legacy schema, no --fix, no --check → how-to-fix hint on stderr,
 *     handled=true, exit 1.
 *  4. Legacy schema + --fix → migration applied, handled=false (caller
 *     proceeds into the rule loop against the freshly-migrated tree).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maybeMigrate } from '../src/commands/doctor-migrate-gate.ts';

let project: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function stdoutText(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
}

function stderrText(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-doctor-gate-'));
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  rmSync(project, { recursive: true, force: true });
});

const LEGACY_CALENDAR = `# Editorial Calendar

## Ideas
| UUID | Slug | Title | Description | Keywords | Source |
|------|------|------|------|------|------|
| 550e8400-e29b-41d4-a716-446655440000 | idea-one | Idea One |  | kw | manual |

## Paused
*No entries.*

## Review
*No entries.*
`;

function setupLegacyProject(): void {
  mkdirSync(join(project, '.deskwork'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    LEGACY_CALENDAR,
    'utf-8',
  );
}

function setupCurrentProject(): void {
  // Entry-centric schema: .deskwork/entries dir exists, calendar has no
  // legacy section names.
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
}

describe('maybeMigrate', () => {
  it('falls through (handled=false) when schema is already entry-centric', async () => {
    setupCurrentProject();
    const out = await maybeMigrate(project, false, false);
    expect(out.handled).toBe(false);
    expect(out.exitCode).toBe(0);
    expect(stdoutText()).toBe('');
    expect(stderrText()).toBe('');
  });

  it('dry-run preview when --check is set on a legacy project', async () => {
    setupLegacyProject();
    const out = await maybeMigrate(project, false, true);
    expect(out.handled).toBe(true);
    expect(out.exitCode).toBe(1);
    expect(stdoutText()).toMatch(/legacy schema detected/);
    expect(stdoutText()).toMatch(/dry run/);
    // Dry run must NOT touch the sidecar tree.
    expect(existsSync(join(project, '.deskwork', 'entries'))).toBe(false);
  });

  it('emits how-to-fix hint and exits 1 in audit-only mode on legacy project', async () => {
    setupLegacyProject();
    const out = await maybeMigrate(project, false, false);
    expect(out.handled).toBe(true);
    expect(out.exitCode).toBe(1);
    expect(stderrText()).toMatch(/pre-redesign schema/);
    expect(stderrText()).toMatch(/--fix=all/);
    expect(stderrText()).toMatch(/--check/);
    // Audit-only must NOT touch the sidecar tree.
    expect(existsSync(join(project, '.deskwork', 'entries'))).toBe(false);
  });

  it('applies migration and falls through (handled=false) when --fix is set', async () => {
    setupLegacyProject();
    const out = await maybeMigrate(project, true, false);
    expect(out.handled).toBe(false);
    expect(out.exitCode).toBe(0);
    expect(stdoutText()).toMatch(/migrated 1 entries/);
    // Sidecar must be written and the calendar regenerated without
    // legacy section names.
    expect(existsSync(join(project, '.deskwork', 'entries'))).toBe(true);
    const sidecars = readdirSync(join(project, '.deskwork', 'entries'));
    expect(sidecars).toHaveLength(1);
  });
});
