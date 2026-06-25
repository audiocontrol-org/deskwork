import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './_run-helpers.js';
import { resolveSpecDir } from '../subcommands/spec-dir.js';

// gh-505 / TASK-449: `spec-check` and `execute-check` must resolve the SAME
// `--spec` argument the SAME way. Both share `resolveSpecDir`, which preserves
// cwd-relative resolution (never breaks a working call) and then rescues with an
// installation-root-relative path so `specs/NNN` works from any subdir of the
// installation — instead of a spurious "spec dir not found" FATAL.
describe('resolveSpecDir (gh-505)', () => {
  let work: string;
  beforeEach(() => {
    work = realpathSync(mkdtempSync(join(tmpdir(), 'stackctl-specdir-')));
    // A full installation: `.stack-control/config.yaml` + a runnable spec dir.
    mkdirSync(join(work, '.stack-control'), { recursive: true });
    writeFileSync(join(work, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
    const spec = join(work, 'specs', '999-fixture');
    mkdirSync(spec, { recursive: true });
    writeFileSync(join(spec, 'spec.md'), '# fixture\n');
    writeFileSync(join(spec, 'plan.md'), '# fixture\n');
    writeFileSync(join(spec, 'tasks.md'), '# fixture\n');
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('resolves a cwd-relative path when it exists (unchanged behavior)', () => {
    const got = resolveSpecDir('specs/999-fixture', work);
    expect(got).toBe(join(work, 'specs', '999-fixture'));
  });

  it('rescues an installation-root-relative path from a subdir', () => {
    const sub = join(work, 'specs'); // a subdir of the installation
    const got = resolveSpecDir('specs/999-fixture', sub);
    expect(got).toBe(join(work, 'specs', '999-fixture'));
  });

  it('passes an absolute path through unchanged', () => {
    const abs = join(work, 'specs', '999-fixture');
    expect(resolveSpecDir(abs, work)).toBe(abs);
  });

  it('execute-check and spec-check both accept the install-root-relative path from a subdir', () => {
    const sub = join(work, 'specs');
    const exec = runCli(['execute-check', '--spec', 'specs/999-fixture'], { cwd: sub });
    const spec = runCli(['spec-check', '--spec', 'specs/999-fixture'], { cwd: sub });
    expect(exec.status).toBe(0);
    expect(exec.stdout).toMatch(/runnable/);
    expect(spec.status).toBe(0);
    expect(spec.stdout).toMatch(/tasks=yes/);
  });
});
