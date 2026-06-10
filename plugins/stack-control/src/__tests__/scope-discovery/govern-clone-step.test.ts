// T066 RED — US7: governance implement-mode runs the per-codebase clone step
// (FR-032 / SC-011). Pins: the step detects a NEW intra-codebase clone and
// surfaces it in the governance output; and no TODO/placeholder remains in the
// governance code path for clone detection.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, type Fixture } from './fixture.js';
import { runCloneDetectionStep } from '../../govern/clone-step.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery -> __tests__ -> src
const SRC = resolve(HERE, '..', '..');

let fx: Fixture | null = null;
afterEach(() => {
  fx?.cleanup();
  fx = null;
});

describe('runCloneDetectionStep (govern implement-mode clone step)', () => {
  it('detects and surfaces a NEW intra-codebase clone', async () => {
    fx = makeFixture();
    const a = fx.install('a');
    fx.plantClone('a/src/one.ts', 'a/src/two.ts');

    let out = '';
    const result = await runCloneDetectionStep({
      repoRoot: a,
      write: (s) => {
        out += s;
      },
    });

    expect(result.ran).toBe(true);
    expect(result.newCount).toBeGreaterThan(0);
    expect(out).toMatch(/clone/i);
  }, 60_000);

  it('is advisory when the repo is not a stack-control installation (no fail)', async () => {
    fx = makeFixture(); // no installation marker
    fx.writeFile('src/x.ts', 'export const x = 1;\n');

    let out = '';
    const result = await runCloneDetectionStep({
      repoRoot: fx.root,
      write: (s) => {
        out += s;
      },
    });

    expect(result.ran).toBe(false);
    expect(out).toMatch(/clone/i);
  }, 60_000);

  it('leaves no TODO/placeholder for clone detection in the govern code path', () => {
    const governSrc = readFileSync(join(SRC, 'subcommands', 'govern.ts'), 'utf8');
    const protocolSrc = readFileSync(join(SRC, 'govern', 'protocol.ts'), 'utf8');
    // No "intentionally NOT invoked" / TODO placeholder for the clone step.
    expect(/clone[- ]detection step[\s\S]{0,80}(NOT invoked|TODO|placeholder)/i.test(governSrc)).toBe(false);
    expect(/clone[- ]detection step[\s\S]{0,80}(NOT invoked|TODO|placeholder)/i.test(protocolSrc)).toBe(false);
  });
});
