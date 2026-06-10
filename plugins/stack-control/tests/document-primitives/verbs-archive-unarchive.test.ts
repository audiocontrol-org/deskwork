// T021–T023 (RED-first) — the `stackctl archive` / `unarchive` verbs + their
// dispatcher registration, per contracts/archive.md + contracts/unarchive.md.
// Exit codes: 0 success/dry-run, 1 write/coherence failure, 2 usage/config
// (missing flag, ungovernable, parse failure, identifier violation, locate
// failure, collision).

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

const INBOX = [
  '---',
  'doc-grammar: design-inbox',
  '---',
  '',
  '# Inbox',
  '',
  '### Active idea',
  '- **Status:** **captured**',
  '',
  '### Shipped idea',
  '- **Status:** **promoted**',
  '',
].join('\n');

function tmpDoc(body: string, name = 'INBOX.md') {
  const dir = mkdtempSync(join(tmpdir(), 'verbs-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

describe('stackctl archive verb (T021/T023)', () => {
  it('missing --doc → exit 2', () => {
    expect(runCli(['archive']).status).toBe(2);
  });

  it('dry-run (default) reports planned moves, writes nothing, exit 0', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    const r = runCli(['archive', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Shipped idea');
    expect(existsSync(archivePath)).toBe(false);
  });

  it('--apply moves terminal Units, exit 0', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);
    const r = runCli(['archive', '--doc', docPath, '--apply']);
    expect(r.status).toBe(0);
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(docPath, 'utf8')).not.toContain('### Shipped idea');
  });

  it('ungovernable document → exit 2', () => {
    const { docPath } = tmpDoc('# Plain doc\n\nNo grammar.\n');
    const r = runCli(['archive', '--doc', docPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/governable/i);
  });
});

describe('stackctl unarchive verb (T022/T023)', () => {
  it('missing --id → exit 2', () => {
    const { docPath } = tmpDoc(INBOX);
    expect(runCli(['unarchive', '--doc', docPath]).status).toBe(2);
  });

  it('restores an archived Unit, exit 0', () => {
    const { docPath } = tmpDoc(INBOX);
    expect(runCli(['archive', '--doc', docPath, '--apply']).status).toBe(0);
    const r = runCli(['unarchive', '--doc', docPath, '--id', 'Shipped idea', '--apply']);
    expect(r.status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toContain('### Shipped idea');
  });

  it('locate failure (unknown id) → exit 2', () => {
    const { docPath } = tmpDoc(INBOX);
    runCli(['archive', '--doc', docPath, '--apply']);
    const r = runCli(['unarchive', '--doc', docPath, '--id', 'Bogus', '--apply']);
    expect(r.status).toBe(2);
  });
});
