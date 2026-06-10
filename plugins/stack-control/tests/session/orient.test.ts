// 011 T007 (RED-first) — orient(): assemble the orientation inputs through the
// resolved installation config — roadmap ready/blocked (006 reasoner), latest
// journal entry, and open backlog items (008 list()). All reads go through
// resolvePaths; NO GitHub-issue query anywhere (FR-001). US1.

import { describe, it, expect, afterEach } from 'vitest';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveInstallation } from '../../src/config/installation.js';
import { createBacklogBackend } from '../../src/backlog/backend.js';
import { orient } from '../../src/session/orient.js';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMITTED_BACKLOG_CONFIG = resolve(PLUGIN_ROOT, 'backlog', 'config.yml');

let root: string;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const ROADMAP = `---
doc-grammar: roadmap
---

# Roadmap

## impl:feature/done
- status: shipped

## impl:feature/ready-one
- status: planned
- depends-on: impl:feature/done

## impl:feature/blocked-one
- status: planned
- depends-on: impl:feature/ready-one
`;

// The preamble title is itself an H2 (## ) — as in the real DEVELOPMENT-NOTES.md
// — so "latest entry" must be the first ## AFTER the --- separator, not the title.
const JOURNAL = `## Development Notes

Session journal preamble.

---

## 2026-06-10: latest entry title
Body of the most recent entry.

## 2026-06-09: older entry
Older body.
`;

function mkInstallation(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc-orient-'));
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  writeFileSync(join(dir, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(dir, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(dir, 'DEVELOPMENT-NOTES.md'), JOURNAL);
  return dir;
}

/** Provision a real backlog store at the installation's default backlog dir
 * (<root>/.stack-control/backlog) and create one item via the real binary. */
function seedBacklog(installRoot: string, title: string): void {
  const storeParent = join(installRoot, '.stack-control'); // backlog binary runs here
  mkdirSync(join(storeParent, 'backlog'), { recursive: true });
  copyFileSync(COMMITTED_BACKLOG_CONFIG, join(storeParent, 'backlog', 'config.yml'));
  createBacklogBackend({ cwd: storeParent }).create({ title, labels: ['agent-found', 'type:bug'] });
}

describe('orient', () => {
  it('assembles roadmap ready/blocked + latest journal entry through resolved config paths', () => {
    root = mkInstallation();
    const inst = resolveInstallation(root);
    const report = orient({ installation: inst, repoRoot: root });

    expect(report.installationRoot).toBe(root);
    expect(report.roadmap.ready.map((i) => i.identifier)).toContain('impl:feature/ready-one');
    expect(report.roadmap.blocked.map((i) => i.identifier)).toContain('impl:feature/blocked-one');
    // shipped (terminal) items are neither ready nor blocked
    expect(report.roadmap.ready.map((i) => i.identifier)).not.toContain('impl:feature/done');

    expect(report.latestJournalEntry).not.toBeNull();
    expect(report.latestJournalEntry!.heading).toContain('latest entry title');
  });

  it('reports a null latest journal entry when the journal has no entries', () => {
    root = mkInstallation();
    writeFileSync(join(root, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
    const inst = resolveInstallation(root);
    const report = orient({ installation: inst, repoRoot: root });
    expect(report.latestJournalEntry).toBeNull();
  });

  it('reports open backlog items from list() and never queries GitHub', () => {
    root = mkInstallation();
    seedBacklog(root, 'a found bug');
    const inst = resolveInstallation(root);
    const report = orient({ installation: inst, repoRoot: root });
    expect(report.openBacklog.map((i) => i.title)).toContain('a found bug');
  });
});
