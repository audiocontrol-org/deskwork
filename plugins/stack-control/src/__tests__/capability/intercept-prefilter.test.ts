// 026 Phase-3 audit (claude-04) — the bin/intercept fast pre-filter must cover EVERY
// registry backend identity, else adding a backend the grep pattern misses would
// silently disable mediation for it (the hook would exit 0 before spawning the verb).
// This pins the shipped bash pattern to the registry: a missed backend fails CI.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { backendNames } from '../../capability/intercept.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const shim = readFileSync(join(PLUGIN_ROOT, 'bin', 'intercept'), 'utf8');
const match = shim.match(/grep -qE '([^']+)'/);

describe('bin/intercept fast pre-filter (026 Phase-3 audit claude-04)', () => {
  it('has a grep pre-filter before dispatching to stackctl', () => {
    expect(match).not.toBeNull();
  });

  it('the pre-filter pattern covers EVERY registry backend identity (no silent miss)', () => {
    expect(match).not.toBeNull();
    const pattern = new RegExp(match![1]!);
    for (const name of backendNames(CAPABILITY_REGISTRY)) {
      expect(pattern.test(name), `pre-filter must match backend '${name}'`).toBe(true);
    }
  });
});
