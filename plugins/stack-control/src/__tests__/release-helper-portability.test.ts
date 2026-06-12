import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkPreconditions,
  dispatchReleaseHelper,
  validateVersion,
  verifyNpmStatus,
  type NpmViewer,
} from '../release/helpers.js';
import { readPluginFile } from './portability-helpers.js';
import { createRig } from '../../../../.claude/skills/release/test/fixtures.js';

const CLAUDE_WRAPPER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.claude/skills/release/lib/release-helpers.ts',
);

describe('portable release helper contract', () => {
  it('shared helper behavior now lives under stack-control', async () => {
    expect(validateVersion('0.9.0', 'v0.8.7')).toEqual({ ok: true });
    const viewer: NpmViewer = (spec) => spec.startsWith('@deskwork/core@');
    expect(verifyNpmStatus('0.9.6', viewer).published).toEqual(['@deskwork/core']);

    const rig = createRig();
    try {
      const report = await checkPreconditions({ cwd: rig.localPath });
      expect(report.ok).toBe(true);
      expect(report.head.branch).toBe('feature/test');
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
});
