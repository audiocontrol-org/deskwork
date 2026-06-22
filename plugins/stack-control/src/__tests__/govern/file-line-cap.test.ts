// 030 US9 T077 (SC-007 / FR-022): the MISSING T062 cap test. Every source file in
// the govern subsystem this feature owns must be ≤500 lines (the project's hard
// refactor cap). RED now: govern.ts (1003), payload-implement.ts (801), and
// protocol.ts (555) exceed the cap — T086 decomposes them (and T085 deletes
// payload-implement.ts, removing it from this glob entirely).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..'); // plugins/stack-control/src
const CAP = 500;

/** Every non-test `.ts` file under a directory, recursively. */
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '__tests__') continue;
      out.push(...tsFiles(p));
    } else if (ent.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

describe('030 T077 — no govern-subsystem source file exceeds the 500-line cap (SC-007, FR-022)', () => {
  const files = [...tsFiles(join(SRC, 'govern')), join(SRC, 'subcommands', 'govern.ts')];
  for (const f of files) {
    const lineCount = readFileSync(f, 'utf8').split('\n').length;
    it(`${relative(SRC, f)} is ≤${CAP} lines`, () => {
      expect(lineCount, `${relative(SRC, f)} has ${lineCount} lines; the cap is ${CAP}`).toBeLessThanOrEqual(CAP);
    });
  }
});
