// 009 T010 (RED-first, US1) — auto-on-first-use parity (FR-015/016/017,
// Principle V). A verb inside an installation whose working file is missing
// scaffolds it (announced, contentless) and proceeds; the scaffolded artifact is
// byte-identical to `setup`'s. A verb run OUTSIDE any installation fails loud
// directing to `stackctl setup` (no bundled-copy fallback). (quickstart Scenario 6.)

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function freshProject(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'sc-auto-')));
}

/** An installation whose config exists but whose working files do not. */
function bareInstallation(): string {
  const proj = freshProject();
  mkdirSync(join(proj, '.stack-control'), { recursive: true });
  writeFileSync(join(proj, '.stack-control', 'config.yaml'), 'version: 1\n');
  return proj;
}

describe('auto-on-first-use', () => {
  it('a verb with the working file missing scaffolds + announces + proceeds', () => {
    const proj = bareInstallation();
    const r = runCli(['inbox', 'list'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/scaffold|created/i);
    expect(existsSync(join(proj, 'DESIGN-INBOX.md'))).toBe(true);
    expect(r.stdout).toMatch(/0 entr/);
  });

  it('the auto-scaffolded file is byte-identical to setup\'s scaffold (FR-017)', () => {
    const viaSetupProj = freshProject();
    expect(runCli(['setup', '--apply'], { cwd: viaSetupProj }).status).toBe(0);
    const viaSetup = readFileSync(join(viaSetupProj, 'DESIGN-INBOX.md'), 'utf8');

    const viaAutoProj = bareInstallation();
    runCli(['inbox', 'list'], { cwd: viaAutoProj });
    const viaAuto = readFileSync(join(viaAutoProj, 'DESIGN-INBOX.md'), 'utf8');

    expect(viaAuto).toBe(viaSetup);
  });

  it('a verb run OUTSIDE any installation fails loud directing to stackctl setup', () => {
    const lonely = freshProject();
    const r = runCli(['inbox', 'list'], { cwd: lonely });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/stackctl setup/);
  });

  it('an explicit --doc still works outside an installation (operator escape hatch)', () => {
    const lonely = freshProject();
    const doc = join(lonely, 'custom-inbox.md');
    writeFileSync(
      doc,
      '---\ndoc-grammar: design-inbox\n---\n\n# Inbox\n\nCustom.\n',
    );
    const r = runCli(['inbox', 'list', '--doc', doc], { cwd: lonely });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 entr/);
  });
});
