import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atomicPush,
  checkPreconditions,
  dispatchReleaseHelper,
  validateVersion,
  verifyNpmStatus,
  type NpmLookupResult,
  type NpmViewer,
} from '../release/helpers.js';
import { readPluginFile } from './portability-helpers.js';
import { createReleaseRig } from './release-rig.js';

const CLAUDE_WRAPPER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.claude/skills/release/lib/release-helpers.ts',
);

describe('portable release helper contract', () => {
  it('shared helper behavior now lives under stack-control', async () => {
    expect(validateVersion('0.9.0', 'v0.8.7')).toEqual({ ok: true });
    const viewer: NpmViewer = (spec) =>
      spec.startsWith('@deskwork/core@') ? { kind: 'published' } : { kind: 'unpublished' };
    expect(verifyNpmStatus('0.9.6', viewer).published).toEqual(['@deskwork/core']);

    const rig = createReleaseRig();
    try {
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(true);
      expect(report.head.branch).toBe('feature/test');
    } finally {
      rig.cleanup();
    }
  });

  it('atomicPush pushes the explicit requested tag ref', async () => {
    const rig = createReleaseRig({ branch: 'feature/release-check' });
    try {
      rig.sh('git tag -a v9.9.9 -m "release tag"');
      await atomicPush({ tag: 'v9.9.9', branch: 'feature/release-check', cwd: rig.localPath });
      const remoteTag = execTag(rig.localPath, rig.remotePath, 'v9.9.9');
      expect(remoteTag).toMatch(/refs\/tags\/v9.9.9$/);
    } finally {
      rig.cleanup();
    }
  });

  it('atomicPush refuses a tag that does not point at HEAD', async () => {
    const rig = createReleaseRig({ branch: 'feature/release-mismatch' });
    try {
      rig.sh('git tag -a v9.9.9 -m "release tag"');
      rig.sh('echo after-tag > after-tag.txt && git add after-tag.txt && git commit -m "after tag"');
      await expect(
        atomicPush({ tag: 'v9.9.9', branch: 'feature/release-mismatch', cwd: rig.localPath }),
      ).rejects.toThrowError(/does not match the commit being released/i);
    } finally {
      rig.cleanup();
    }
  });

  it('the Claude-owned release helper is now a compatibility wrapper over stack-control', () => {
    const body = readPluginFile('../../.claude/skills/release/lib/release-helpers.ts');
    expect(body).toContain('Legacy Claude-hosted wrapper');
    expect(body).toContain("plugins/stack-control/src/release/helpers.js");
  });

  it('dispatches usage failures through the shared release helper surface', async () => {
    let stderr = '';
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await dispatchReleaseHelper(['assert-published']);
      expect(code).toBe(2);
    } finally {
      process.stderr.write = write;
    }
    expect(stderr).toMatch(/usage: assert-published/i);
    expect(CLAUDE_WRAPPER).toContain('.claude/skills/release/lib/release-helpers.ts');
  });

  it('fails loud when npm lookup fails for reasons other than a confirmed not-found', () => {
    const viewer: NpmViewer = () =>
      ({ kind: 'error', message: 'npm view failed for @deskwork/core@9.9.9: registry timeout' }) satisfies NpmLookupResult;
    expect(() => verifyNpmStatus('9.9.9', viewer)).toThrowError(/registry timeout/i);
  });

  it('rejects non-exact version specs in npm assertion subcommands', async () => {
    let stderr = '';
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await dispatchReleaseHelper(['assert-not-published', '0.44']);
      expect(code).toBe(1);
    } finally {
      process.stderr.write = write;
    }
    expect(stderr).toMatch(/MAJOR\.MINOR\.PATCH/);
  });
});

function execTag(localPath: string, remotePath: string, tag: string): string {
  return execSync(`git ls-remote --tags "${remotePath}" ${tag}`, {
    cwd: localPath,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
}
