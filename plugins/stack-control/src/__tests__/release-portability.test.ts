import { describe, expect, it } from 'vitest';
import { collectPortableReleaseState, verifyPortableReleaseState } from '../release/portable.js';
import { runReleaseCheck } from '../subcommands/release-check.js';

describe('portable release contract', () => {
  it('pins one lockstep version across the shipped monorepo artifacts and stack-control host distributions', () => {
    const state = collectPortableReleaseState();
    expect(state.canonicalVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(state.artifacts.length).toBeGreaterThan(5);
    expect(state.stackControlDistributions.claudePluginVersion).toBe(state.canonicalVersion);
    expect(state.stackControlDistributions.codexPluginVersion).toBe(state.canonicalVersion);
    expect(state.stackControlDistributions.claudeMarketplaceVersion).toBe(state.canonicalVersion);
  });

  it('fails loud on version drift instead of tolerating host-specific release streams', () => {
    expect(() =>
      verifyPortableReleaseState([
        { name: 'root', path: 'package.json', kind: 'root-package', version: '1.2.3' },
        {
          name: 'stack-control codex plugin manifest',
          path: 'plugins/stack-control/.codex-plugin/plugin.json',
          kind: 'codex-plugin',
          version: '1.2.4',
        },
      ]),
    ).toThrowError(/lockstep release drift detected/i);
  });

  it('exposes the portable release check through the shared stackctl release surface', async () => {
    let stdout = '';
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof process.stdout.write;
    try {
      await runReleaseCheck([]);
    } finally {
      process.stdout.write = write;
    }
    expect(stdout).toContain('portable release: lockstep version');
    expect(stdout).toContain('codex-plugin=');
    expect(stdout).toContain('claude-marketplace=');
  });
});
