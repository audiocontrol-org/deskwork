// T005 [US1] — the spec-governance extension's after_clarify hook resolves
// to the speckit.spec-governance.govern-spec command, and after_specify is
// intentionally undeclared (FR-011 / research R5). Guards the manifest wiring
// as a falsifiable test rather than a one-shot read.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = resolve(here, '..', '..', 'spec-kit', 'spec-governance');
const EXT_YML = join(EXT_DIR, 'extension.yml');

interface HookEntry {
  command?: string;
  optional?: boolean;
}
interface ExtensionManifest {
  extension?: { id?: string; version?: string };
  requires?: { tools?: Array<{ name?: string; required?: boolean }> };
  provides?: { commands?: Array<{ name?: string; file?: string }> };
  hooks?: Record<string, HookEntry>;
}

function load(): ExtensionManifest {
  return parse(readFileSync(EXT_YML, 'utf8')) as ExtensionManifest;
}

describe('spec-governance extension wiring (T005 / US1)', () => {
  it('declares id spec-governance', () => {
    expect(load().extension?.id).toBe('spec-governance');
  });

  it('after_clarify hook resolves to speckit.spec-governance.govern-spec and is non-optional', () => {
    const hook = load().hooks?.after_clarify;
    expect(hook?.command).toBe('speckit.spec-governance.govern-spec');
    expect(hook?.optional).toBe(false);
  });

  it('after_plan hook is declared and optional (configurable per project)', () => {
    const hook = load().hooks?.after_plan;
    expect(hook?.command).toBe('speckit.spec-governance.govern-spec');
    expect(hook?.optional).toBe(true);
  });

  it('after_specify is intentionally NOT declared (FR-011)', () => {
    expect(load().hooks?.after_specify).toBeUndefined();
  });

  it('declares dw-lifecycle as a required tool (in-house composition, FR-006)', () => {
    const tools = load().requires?.tools ?? [];
    const dw = tools.find((t) => t.name === 'dw-lifecycle');
    expect(dw?.required).toBe(true);
  });

  it('the provided command points at a command file that exists on disk', () => {
    const cmd = (load().provides?.commands ?? []).find(
      (c) => c.name === 'speckit.spec-governance.govern-spec',
    );
    expect(cmd?.file).toBeDefined();
    expect(existsSync(join(EXT_DIR, cmd!.file!))).toBe(true);
  });

  it('extension version is lockstep with the stack-control plugin.json (AUDIT-20260607-13)', () => {
    // The manifest version must NOT drift from the monorepo lockstep version.
    // bump-version.ts now bumps this extension.yml; this assertion turns any
    // future drift (a bump that skips it) into a red test, not silent rot.
    const pluginJson = JSON.parse(
      readFileSync(resolve(EXT_DIR, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as { version?: string };
    expect(load().extension?.version).toBeDefined();
    expect(load().extension?.version).toBe(pluginJson.version);
  });
});
