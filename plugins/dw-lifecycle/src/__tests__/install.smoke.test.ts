import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../subcommands/install.js';

describe('install (smoke)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-lifecycle-install-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('writes a default config to .dw-lifecycle/config.json', async () => {
    await install([tmp]);
    const cfgPath = join(tmp, '.dw-lifecycle/config.json');
    expect(existsSync(cfgPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(cfg.version).toBe(1);
    expect(cfg.docs.byVersion).toBe(true);
    expect(cfg.tracking.platform).toBe('github');
  });
});
