// specs/014 US2 (TASK-30 / gh-446): a legacy dw-lifecycle barrage config
// is silently ignored today — the loader reads only the stack-control
// path and never probes `.dw-lifecycle/**`, so an adopter who migrated
// from dw-lifecycle runs on the built-in defaults without ever learning
// their tuned config stopped applying.
//
// Contract under test (cli-contracts §config loading; research R2):
// whenever `.dw-lifecycle/scope-discovery/audit-barrage-config.yaml`
// exists, the loader emits a loud three-part stderr notice naming the
// ignored legacy path, the path actually read (active override or
// built-in defaults), and the migration step. The notice NEVER changes
// which config wins, and never fires when no legacy file exists.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_OVERRIDE_PATH,
  loadAuditBarrageConfig,
} from '../scope-discovery/audit-barrage/config-loader.js';

const LEGACY_REL = '.dw-lifecycle/scope-discovery/audit-barrage-config.yaml';

const LEGACY_BODY = [
  'models:',
  '  - name: legacy-model',
  '    binary: legacy-bin',
  '    args_template: "-p {{prompt}}"',
  '    timeout_seconds: 60',
  '',
].join('\n');

const OVERRIDE_BODY = [
  'models:',
  '  - name: override-model',
  '    binary: override-bin',
  '    args_template: "-p {{prompt}}"',
  '    timeout_seconds: 120',
  '',
].join('\n');

function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), 'barrage-legacy-'));
}

function writeLegacy(repo: string): string {
  const legacyAbs = join(repo, LEGACY_REL);
  mkdirSync(join(repo, '.dw-lifecycle', 'scope-discovery'), { recursive: true });
  writeFileSync(legacyAbs, LEGACY_BODY, 'utf8');
  return legacyAbs;
}

function writeOverride(repo: string): string {
  const overrideAbs = join(repo, CONFIG_OVERRIDE_PATH);
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(overrideAbs, OVERRIDE_BODY, 'utf8');
  return overrideAbs;
}

async function loadCollectingWarnings(
  repo: string,
): Promise<{ config: Awaited<ReturnType<typeof loadAuditBarrageConfig>>; warnings: string }> {
  const lines: string[] = [];
  const config = await loadAuditBarrageConfig(repo, (line: string) => {
    lines.push(line);
  });
  return { config, warnings: lines.join('') };
}

describe('US2 — legacy dw-lifecycle barrage config detection', () => {
  it('legacy-only: notice names the ignored path, the read source (built-in defaults), and the migration step; defaults still win', async () => {
    const repo = makeRepo();
    try {
      const legacyAbs = writeLegacy(repo);
      const { config, warnings } = await loadCollectingWarnings(repo);

      expect(warnings).toMatch(/legacy dw-lifecycle config present and IGNORED/);
      expect(warnings).toContain(legacyAbs);
      expect(warnings).toMatch(/built-in defaults/);
      expect(warnings).toMatch(/migrate with: mv /);
      expect(warnings).toContain(CONFIG_OVERRIDE_PATH);
      // AUDIT-20260611-09: legacy-only — no active override exists, so
      // mv-to-override is safe; pin the exact copy-pasteable command.
      expect(warnings).toContain(
        `migrate with: mv ${legacyAbs} ${join(repo, CONFIG_OVERRIDE_PATH)} (then review)`,
      );

      // Selection unchanged: the legacy file's battery must NOT load.
      expect(config.models.some((m) => m.name === 'legacy-model')).toBe(false);
      expect(config.models.length).toBeGreaterThan(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('both present: notice fires AND the stack-control override wins', async () => {
    const repo = makeRepo();
    try {
      const legacyAbs = writeLegacy(repo);
      const overrideAbs = writeOverride(repo);
      const { config, warnings } = await loadCollectingWarnings(repo);

      expect(warnings).toMatch(/legacy dw-lifecycle config present and IGNORED/);
      expect(warnings).toContain(legacyAbs);
      // The "reading" line names the active override, not the defaults.
      expect(warnings).toContain(overrideAbs);
      expect(warnings).not.toMatch(/built-in defaults/);
      // AUDIT-20260611-09: the remediation must NEVER print an mv whose
      // destination is the operator's ACTIVE override — pasting it would
      // clobber the tuned battery with the legacy one (self-concealing:
      // once moved, this notice never fires again). The both-present
      // remediation archives/removes the legacy file instead.
      expect(warnings).not.toContain(`mv ${legacyAbs} ${overrideAbs}`);
      expect(warnings).toMatch(/archive the legacy file/);
      expect(warnings).toContain(`mv ${legacyAbs} ${legacyAbs}.migrated-to-stack-control`);
      expect(warnings).toMatch(/do NOT mv it over the active override/);

      expect(config.models).toHaveLength(1);
      expect(config.models[0]?.name).toBe('override-model');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('neither: completely silent, defaults load', async () => {
    const repo = makeRepo();
    try {
      const { config, warnings } = await loadCollectingWarnings(repo);
      expect(warnings).toBe('');
      expect(config.models.length).toBeGreaterThan(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('override-only (no legacy file): silent, override wins (no false positive)', async () => {
    const repo = makeRepo();
    try {
      writeOverride(repo);
      const { config, warnings } = await loadCollectingWarnings(repo);
      expect(warnings).toBe('');
      expect(config.models[0]?.name).toBe('override-model');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
