// T030 — the `stackctl curate` verb + dispatcher registration, per
// contracts/curate.md exit codes.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function tmpDoc(body: string, name = 'INBOX.md') {
  const dir = mkdtempSync(join(tmpdir(), 'verb-curate-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { docPath };
}

// Disordered: two `captured` entries out of identifier order (Zeta before
// Alpha), plus a `promoted` (terminal) entry still live.
const DISORDERED = [
  '---',
  'doc-grammar: design-inbox',
  '---',
  '',
  '# Inbox',
  '',
  '### Zeta idea',
  '- **Status:** **captured**',
  '',
  '### Alpha idea',
  '- **Status:** **captured**',
  '',
  '### Done idea',
  '- **Status:** **promoted**',
  '',
].join('\n');

describe('stackctl curate verb (T030)', () => {
  it('missing --doc → exit 2', () => {
    expect(runCli(['curate']).status).toBe(2);
  });

  it('dry-run reports findings (disorder + unarchived-terminal), exit 0, writes nothing', () => {
    const { docPath } = tmpDoc(DISORDERED);
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/disorder/);
    expect(r.stdout).toMatch(/unarchived-terminal/);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('--apply reorders + archives, exit 0', () => {
    const { docPath } = tmpDoc(DISORDERED);
    const r = runCli(['curate', '--doc', docPath, '--apply']);
    expect(r.status).toBe(0);
    // Reordered (Alpha before Zeta) and the terminal `Done idea` archived out;
    // both `captured` entries remain live.
    const live = readFileSync(docPath, 'utf8');
    expect(live).toContain('### Alpha idea');
    expect(live).toContain('### Zeta idea');
    expect(live).not.toContain('### Done idea');
    expect(live.indexOf('### Alpha idea')).toBeLessThan(live.indexOf('### Zeta idea'));
  });

  it('ungovernable document → exit 2', () => {
    const { docPath } = tmpDoc('# Plain\n\nno grammar\n');
    expect(runCli(['curate', '--doc', docPath]).status).toBe(2);
  });
});
