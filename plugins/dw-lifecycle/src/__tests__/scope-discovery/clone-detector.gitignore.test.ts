/**
 * Regression: the clone gate must not scan gitignored directories (#354).
 *
 * A gitignored sandbox (the real case was a 593MB `.audiocontrol.org`
 * dogfood clone) tripped the jscpd clone gate because the committed
 * `.jscpd.json` files lacked `"gitignore": true` — jscpd scanned the
 * ignored tree and reported its ~65 files as NEW clone groups, blocking
 * a merge commit that the same gate passed on a worktree without the
 * sandbox. Setting `gitignore: true` makes jscpd honor the repo's
 * `.gitignore`, so gitignored paths never reach the detector.
 *
 * Two guards:
 *   1. Config wiring — every committed `.jscpd.json` (repo root,
 *      scope-discovery, and the adopter template seed) carries
 *      `gitignore: true`. This is the literal #354 fix; it fails red
 *      until the configs are patched.
 *   2. Behavior — running the gate exactly as the pre-commit hook does
 *      (cwd-scan, no `--root`) with `gitignore: true`, a clone pair in a
 *      gitignored directory is NOT flagged while a clone pair in a
 *      tracked directory IS. The tracked-pair assertion gives the guard
 *      teeth: a gate that blanket-ignored everything would fail it too.
 *
 * Note (verified 2026-05-29, jscpd 4.2.3): jscpd already respects a
 * `.gitignore` in the scan cwd by DEFAULT, so the explicit
 * `gitignore: true` is belt-and-suspenders — it makes the intent
 * auditable and survives a future jscpd default change. A clean on/off
 * control via config is therefore not possible; guard 2 uses a
 * single-run tracked-vs-gitignored contrast instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture, runDetector } from './util/detector-harness.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/ -> repo root is five levels up.
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

const COMMITTED_JSCPD_CONFIGS = [
  '.jscpd.json',
  '.dw-lifecycle/scope-discovery/.jscpd.json',
  'plugins/dw-lifecycle/templates/scope-discovery/.jscpd.json',
] as const;

// Two distinct clone bodies, each large enough to trip the fixture's
// minLines:5/minTokens:50. The TRACKED pair guarantees jscpd finds at
// least one duplicate and therefore writes a report (jscpd writes NO
// report when it detects zero clones); the SANDBOX pair lives in a
// gitignored directory and is what the gate must NOT see.
const SANDBOX_BODY = `export function sandboxCalc(x: number, y: number): number {
  const sum = x + y;
  const product = x * y;
  const diff = x - y;
  const quot = y === 0 ? 0 : x / y;
  return sum + product + diff + quot;
}
`;

const TRACKED_BODY = `export function trackedReduce(a: number, b: number): number {
  const total = a + b;
  const scaled = a * b;
  const delta = a - b;
  const ratio = b === 0 ? 0 : a / b;
  return total + scaled + delta + ratio;
}
`;

interface JsonReport {
  readonly groups: readonly { readonly members: readonly string[] }[];
}

/**
 * Narrow the detector's `--json` stdout to {@link JsonReport} via the
 * project's `isPlainObject` guard — no `as Type` cast (CLAUDE.md
 * "never bypass typing").
 */
function parseJsonReport(stdout: string): JsonReport {
  const parsed: unknown = JSON.parse(stdout);
  if (!isPlainObject(parsed) || !Array.isArray(parsed.groups)) {
    throw new Error(`detector --json output missing groups[]; got:\n${stdout}`);
  }
  const groups = parsed.groups.map((g): { members: string[] } => {
    if (!isPlainObject(g) || !Array.isArray(g.members)) {
      throw new Error(`clone group missing members[]: ${JSON.stringify(g)}`);
    }
    return { members: g.members.filter((m): m is string => typeof m === 'string') };
  });
  return { groups };
}

describe('clone gate — committed .jscpd.json configs honor .gitignore (#354)', () => {
  for (const rel of COMMITTED_JSCPD_CONFIGS) {
    it(`${rel} sets "gitignore": true`, () => {
      const cfg: unknown = JSON.parse(readFileSync(resolve(REPO_ROOT, rel), 'utf8'));
      if (!isPlainObject(cfg)) throw new Error(`${rel} is not a JSON object`);
      expect(cfg.gitignore).toBe(true);
    });
  }
});

describe('clone gate — gitignored directories are not scanned (#354)', () => {
  it('with gitignore:true (cwd-scan), a gitignored clone pair is skipped but a tracked pair is caught', async () => {
    const fixture = await makeFixture('gitignore', { jscpdConfig: { gitignore: true } });
    try {
      // Tracked clone pair at the fixture root — scanned; guarantees a
      // report (jscpd writes none when zero clones are found) and proves
      // the gate actually ran.
      await fixture.writeFile('tracked-a.ts', TRACKED_BODY);
      await fixture.writeFile('tracked-b.ts', TRACKED_BODY);
      // Gitignored sandbox clone pair — mirrors the real `.audiocontrol.org`
      // case the gate must skip.
      await fixture.writeFile('.gitignore', '.sandbox.org/\n');
      await fixture.writeFile('.sandbox.org/x.ts', SANDBOX_BODY);
      await fixture.writeFile('.sandbox.org/y.ts', SANDBOX_BODY);

      // Run exactly as the pre-commit hook does: cwd-scan, no `--root`.
      // (A positional `--root` path changes jscpd's traversal and is not
      // the real gate's invocation shape.)
      const args = ['check-clones', '--baseline', fixture.baseline, '--quiet', '--json'];
      const run = await runDetector(args, fixture.dir);
      expect(run.code, `stderr:\n${run.stderr}`).toBe(0);

      const report = parseJsonReport(run.stdout);
      const members = report.groups.flatMap((g) => g.members);
      // Teeth: the tracked pair IS detected — the gate ran and finds clones.
      expect(
        members.some((m) => m.includes('tracked-')),
        `expected the tracked clone pair to be detected; groups:\n${JSON.stringify(report.groups, null, 2)}`,
      ).toBe(true);
      // #354: the gitignored sandbox pair is invisible to the gate.
      expect(
        members.some((m) => m.includes('.sandbox.org')),
        `gitignored sandbox leaked into the gate; groups:\n${JSON.stringify(report.groups, null, 2)}`,
      ).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});
