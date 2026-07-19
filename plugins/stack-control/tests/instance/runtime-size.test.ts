// T014 (RED guard, Instance Observability 037) — size-cap guard.
//
// CONTRACT (Constitution Principle VI — files under 300-500 lines; plan D9):
// - src/plane/runtime.ts MUST be <= 500 lines (fails now at 523; T015 splits it).
// - The new plane-layer modules for this feature MUST be <= 500 lines:
//   src/plane/instance-registry.ts, src/plane/http/instance-api.ts, and
//   src/plane/runtime-handlers.ts once it exists (guarded conditionally).
//
// Line counts are read from disk (never hardcoded) so the guard stays valid as
// files change.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 500;

// tests/instance/ -> plugin root is two levels up.
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Always-guarded plane-layer files for this feature.
const REQUIRED_FILES: readonly string[] = [
  'src/plane/runtime.ts',
  'src/plane/instance-registry.ts',
  'src/plane/http/instance-api.ts',
];

// Guarded only once they exist (created during the T015 split).
const CONDITIONAL_FILES: readonly string[] = [
  'src/plane/runtime-handlers.ts',
];

function lineCount(absPath: string): number {
  const parts = readFileSync(absPath, 'utf8').split('\n');
  // A trailing newline yields a final empty element; drop it so the count
  // matches `wc -l` (number of lines), not split-element arity.
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    return parts.length - 1;
  }
  return parts.length;
}

describe('plane-layer size cap (Constitution VI)', () => {
  for (const rel of REQUIRED_FILES) {
    it(`${rel} is <= ${MAX_LINES} lines`, () => {
      const abs = resolve(pluginRoot, rel);
      const count = lineCount(abs);
      expect(
        count,
        `${rel} is ${count} lines (cap ${MAX_LINES}); split it to comply with Constitution Principle VI`,
      ).toBeLessThanOrEqual(MAX_LINES);
    });
  }

  for (const rel of CONDITIONAL_FILES) {
    it(`${rel} is <= ${MAX_LINES} lines (if present)`, () => {
      const abs = resolve(pluginRoot, rel);
      if (!existsSync(abs)) {
        return;
      }
      const count = lineCount(abs);
      expect(
        count,
        `${rel} is ${count} lines (cap ${MAX_LINES}); split it to comply with Constitution Principle VI`,
      ).toBeLessThanOrEqual(MAX_LINES);
    });
  }
});
