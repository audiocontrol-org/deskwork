/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/install-agent-prompts.test.ts
 *
 * Tests for `dw-lifecycle install-agent-prompts`. Each test creates a
 * fresh tmpdir, populates `.claude/agents/<name>.md` with operator-
 * authored content, runs the installer, and asserts the FS state.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  install,
  isAgentFilePath,
  main,
  parseCli,
  STEP_0_BEGIN_MARKER,
  STEP_0_END_MARKER,
  TARGET_AGENTS,
} from '../../scope-discovery/install-agent-prompts.js';
import { readExistingManifest } from '../../scope-discovery/install-scope-discovery-hooks.js';

function seedAgents(tmp: string, agents: ReadonlyArray<string>): void {
  for (const rel of agents) {
    const abs = join(tmp, rel);
    mkdirSync(join(tmp, rel, '..'), { recursive: true });
    writeFileSync(
      abs,
      `# ${rel.split('/').pop()}\n\nExisting operator content.\n`,
      'utf8',
    );
  }
}

describe('install-agent-prompts — parseCli', () => {
  it('defaults', () => {
    const opts = parseCli([]);
    expect(opts.merge).toBe(false);
    expect(opts.force).toBe(false);
    expect(opts.dryRun).toBe(false);
  });

  it('--merge / --force / --dry-run', () => {
    expect(parseCli(['--merge']).merge).toBe(true);
    expect(parseCli(['--force']).force).toBe(true);
    expect(parseCli(['--dry-run']).dryRun).toBe(true);
  });

  it('--target requires a value', () => {
    expect(() => parseCli(['--target'])).toThrow(/--target requires a path/);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('install-agent-prompts — install() against tmpdir', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-install-agents-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('greenfield (both agents present): appends to both', () => {
    seedAgents(tmp, TARGET_AGENTS);
    const result = install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    expect(result.code).toBe(0);
    expect(result.actions.length).toBe(2);
    for (const action of result.actions) {
      expect(action.action).toBe('appended');
    }
    for (const rel of TARGET_AGENTS) {
      const content = readFileSync(join(tmp, rel), 'utf8');
      expect(content).toContain('Existing operator content.');
      expect(content).toContain(STEP_0_BEGIN_MARKER);
      expect(content).toContain(STEP_0_END_MARKER);
      expect(content).toContain('Step 0 — refactor-precondition verification');
    }
  });

  it('idempotent: re-run skips already-appended files', () => {
    seedAgents(tmp, TARGET_AGENTS);
    install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    const second = install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    expect(second.code).toBe(0);
    for (const action of second.actions) {
      expect(action.action).toBe('skipped');
    }
    for (const rel of TARGET_AGENTS) {
      const content = readFileSync(join(tmp, rel), 'utf8');
      const occurrences = content.split(STEP_0_BEGIN_MARKER).length - 1;
      expect(occurrences).toBe(1);
    }
  });

  it('refuses (exit 2) when target file does not exist', () => {
    // No seeding; .claude/agents/ doesn't exist
    const result = install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    expect(result.code).toBe(2);
    expect(result.actions.length).toBe(2);
    for (const action of result.actions) {
      expect(action.action).toBe('missing');
      expect(action.reason).toContain('not present');
    }
  });

  it('partial: only one agent file present → that one appended, other reported missing', () => {
    const oneAgent = TARGET_AGENTS[0];
    if (oneAgent === undefined) throw new Error('TARGET_AGENTS empty');
    seedAgents(tmp, [oneAgent]);
    const result = install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    expect(result.code).toBe(2);
    const appended = result.actions.filter((a) => a.action === 'appended');
    const missing = result.actions.filter((a) => a.action === 'missing');
    expect(appended.length).toBe(1);
    expect(missing.length).toBe(1);
  });

  it('preserves operator content above the appended block', () => {
    seedAgents(tmp, TARGET_AGENTS);
    install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    const content = readFileSync(
      join(tmp, TARGET_AGENTS[0] ?? ''),
      'utf8',
    );
    const idxOperator = content.indexOf('Existing operator content.');
    const idxBegin = content.indexOf(STEP_0_BEGIN_MARKER);
    expect(idxOperator).toBeGreaterThan(-1);
    expect(idxBegin).toBeGreaterThan(idxOperator);
  });

  it('--dry-run does not modify files', () => {
    seedAgents(tmp, TARGET_AGENTS);
    const before = TARGET_AGENTS.map((rel) =>
      readFileSync(join(tmp, rel), 'utf8'),
    );
    install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: true,
    });
    const after = TARGET_AGENTS.map((rel) =>
      readFileSync(join(tmp, rel), 'utf8'),
    );
    expect(after).toEqual(before);
  });

  it('writes manifest entries for appended files only', () => {
    seedAgents(tmp, TARGET_AGENTS);
    install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    const manifest = readExistingManifest(
      join(tmp, '.dw-lifecycle', 'scope-discovery', 'hooks-installed.json'),
    );
    expect(manifest).not.toBeNull();
    if (manifest === null) return;
    expect(manifest.files.length).toBe(TARGET_AGENTS.length);
    for (const file of manifest.files) {
      expect(file.managed).toBe(true);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('co-exists with hooks manifest (does not clobber existing entries)', () => {
    seedAgents(tmp, TARGET_AGENTS);
    const manifestPath = join(
      tmp,
      '.dw-lifecycle',
      'scope-discovery',
      'hooks-installed.json',
    );
    // Pre-seed a hooks manifest with a different file entry
    mkdirSync(join(tmp, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    writeFileSync(
      manifestPath,
      JSON.stringify({
        installed_at: '2026-05-25T00:00:00Z',
        installed_by: 'dw-lifecycle install-scope-discovery-hooks v0.22.2',
        husky_detected: false,
        files: [
          {
            path: join(tmp, '.githooks', 'pre-commit'),
            sha256: 'a'.repeat(64),
            managed: true,
          },
        ],
      }),
      'utf8',
    );
    install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    const merged = readExistingManifest(manifestPath);
    expect(merged).not.toBeNull();
    if (merged === null) return;
    // 1 pre-existing + 2 agents = 3
    expect(merged.files.length).toBe(3);
    const paths = merged.files.map((f) => f.path);
    expect(paths).toContain(join(tmp, '.githooks', 'pre-commit'));
  });

  it('--merge / --force on already-installed file is a safe no-op (no duplicate block)', () => {
    seedAgents(tmp, TARGET_AGENTS);
    install({
      target: tmp,
      merge: false,
      force: false,
      dryRun: false,
    });
    install({
      target: tmp,
      merge: true,
      force: true,
      dryRun: false,
    });
    for (const rel of TARGET_AGENTS) {
      const content = readFileSync(join(tmp, rel), 'utf8');
      const occurrences = content.split(STEP_0_BEGIN_MARKER).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});

describe('install-agent-prompts — main()', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-install-agents-main-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns 0 when both agents seeded', async () => {
    seedAgents(tmp, TARGET_AGENTS);
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(0);
  });

  it('returns 2 when agent files missing', async () => {
    const result = await main(['--target', tmp]);
    expect(result.code).toBe(2);
  });

  it('returns 2 on unknown flag', async () => {
    const result = await main(['--target', tmp, '--bogus']);
    expect(result.code).toBe(2);
  });
});

describe('install-agent-prompts — isAgentFilePath helper', () => {
  it('identifies code-reviewer.md as managed', () => {
    expect(isAgentFilePath('/foo/.claude/agents/code-reviewer.md')).toBe(true);
  });

  it('identifies codebase-auditor.md as managed', () => {
    expect(isAgentFilePath('/foo/.claude/agents/codebase-auditor.md')).toBe(
      true,
    );
  });

  it('returns false for hook paths', () => {
    expect(isAgentFilePath('/foo/.githooks/pre-commit')).toBe(false);
  });
});
