// T017 (RED-first, US3, 008) — one-time, idempotent GitHub-issue import. The
// data path is exercised by calling importGithub() directly with the injected
// fixture issues (no network) + the REAL backlog binary for writes; the verb
// dry-run/apply wiring and the fail-loud gh path go through runCli with env
// seams (STACKCTL_GH_ISSUES_FILE feeds fixture JSON; STACKCTL_GH_BIN points the
// reader at a missing binary).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { importGithub, parseIssues, type GithubIssue } from '../../src/backlog/github-import.js';
import { tmpBacklog, fixturePath } from './helpers.js';

function fixtureIssues(): GithubIssue[] {
  return parseIssues(readFileSync(fixturePath('gh-issues.json'), 'utf8'));
}
function taskFilesContent(dir: string): string {
  const tasksDir = join(dir, 'backlog', 'tasks');
  return readdirSync(tasksDir)
    .map((f) => readFileSync(join(tasksDir, f), 'utf8'))
    .join('\n---FILE---\n');
}

describe('importGithub data path — real binary, injected issues (US3, T017)', () => {
  it('dry-run reports the would-import set and writes NOTHING (FR-013)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const res = importGithub({ backend, issues: fixtureIssues(), apply: false });
    expect(res.applied).toBe(false);
    expect(res.planned).toEqual([395, 100, 422]);
    expect(res.created).toHaveLength(0);
    expect(backend.list()).toHaveLength(0);
  });

  it('apply creates one imported-issue item per open issue with gh-<n> ref + carried labels (FR-009/011/014)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    const res = importGithub({ backend, issues: fixtureIssues(), apply: true });
    expect(res.created).toHaveLength(3);

    const items = backend.list();
    expect(items).toHaveLength(3);
    for (const it of items) expect(it.type).toBe('imported-issue');

    const i395 = items.find((i) => i.refs.includes('gh-395'));
    expect(i395).toBeDefined();
    expect(i395!.labels).toContain('enhancement');

    const i100 = items.find((i) => i.refs.includes('gh-100'));
    expect(i100!.labels).toEqual(expect.arrayContaining(['type:imported-issue', 'bug', 'good first issue']));
  });

  it('an issue body containing `#` imports cleanly — no corruption, no gate trip (FR-015)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    importGithub({ backend, issues: fixtureIssues(), apply: true });
    const allContent = taskFilesContent(dir);
    // The gh-395 body carries `## Repro` / `## Fix` and `#394` — preserved verbatim.
    expect(allContent).toMatch(/## Repro/);
    expect(allContent).toMatch(/#394/);
  });

  it('re-running the import creates ZERO duplicates — idempotent by gh-<n> ref (FR-012)', () => {
    const dir = tmpBacklog();
    const backend = createBacklogBackend({ cwd: dir });
    importGithub({ backend, issues: fixtureIssues(), apply: true });
    const second = importGithub({ backend, issues: fixtureIssues(), apply: true });
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toEqual([395, 100, 422]);
    expect(backend.list()).toHaveLength(3);
  });

  it('the injected GitHub source is never mutated (FR-010)', () => {
    const dir = tmpBacklog();
    const issues = fixtureIssues();
    const before = JSON.stringify(issues);
    importGithub({ backend: createBacklogBackend({ cwd: dir }), issues, apply: true });
    expect(JSON.stringify(issues)).toBe(before);
  });
});

describe('stackctl backlog import-github verb wiring (US3, T017)', () => {
  function runImport(args: string[], dir: string, extraEnv: Record<string, string>) {
    return runCli(['backlog', 'import-github', ...args], {
      env: { STACKCTL_BACKLOG_DIR: dir, ...extraEnv },
    });
  }

  it('dry-run (no --apply) reports the set and writes nothing; --apply creates items', () => {
    const dir = tmpBacklog();
    const seam = { STACKCTL_GH_ISSUES_FILE: fixturePath('gh-issues.json') };
    const dry = runImport([], dir, seam);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/would import/i);
    expect(createBacklogBackend({ cwd: dir }).list()).toHaveLength(0);

    const applied = runImport(['--apply'], dir, seam);
    expect(applied.status).toBe(0);
    expect(createBacklogBackend({ cwd: dir }).list()).toHaveLength(3);
  });

  it('a missing / unauthenticated gh → exit 2 with remediation (no empty-success)', () => {
    const dir = tmpBacklog();
    const r = runImport(['--apply'], dir, { STACKCTL_GH_BIN: '/nonexistent/gh' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/gh/i);
  });
});
