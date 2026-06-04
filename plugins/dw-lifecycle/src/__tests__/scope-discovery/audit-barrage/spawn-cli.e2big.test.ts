/**
 * Bug-repro test for #397: argv-delivered prompt overflows OS ARG_MAX
 * with a structured E2BIG classifier that names the `{{prompt-stdin}}`
 * migration path.
 *
 * The companion happy-path is the 1MB `{{prompt-stdin}}` test at
 * `spawn-cli.test.ts` (Phase 19 — same delivery mechanism, opposite
 * end of the bug). Step 2 (regression-lock) for the `{{prompt}}` argv
 * path on a SMALL payload is also already covered there.
 *
 * Per Option D discipline: both halves of the contract (failure on
 * argv-large, success on stdin-large) are pinned so a future change
 * that papers over E2BIG without offering the migration path is
 * structurally impossible.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnCliAgainstModel } from '../../../scope-discovery/audit-barrage/spawn-cli.js';
import type { ModelConfig } from '../../../scope-discovery/audit-barrage/types.js';

const NODE_BIN = process.execPath;

/**
 * 5 MiB exceeds macOS's per-arg cap (~256 KB) AND Linux's
 * MAX_ARG_STRLEN (128 KB). A single argv element this large will
 * fail with E2BIG on any production OS the plugin runs on.
 */
const E2BIG_PAYLOAD = 'X'.repeat(5 * 1024 * 1024);

function evalArg(script: string): string {
  const b64 = Buffer.from(script, 'utf8').toString('base64');
  return `eval(Buffer.from('${b64}','base64').toString('utf8'))`;
}

describe('#397 — argv-delivered large prompt fails with structured E2BIG classifier', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'spawn-cli-e2big-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('bug-repro: {{prompt}} with a ~5MB payload spawn-errors with E2BIG + migration cue to {{prompt-stdin}}', async () => {
    const script = `process.stdout.write('argv-len:' + process.argv[1].length);`;
    const model: ModelConfig = {
      name: 'fake-argv-e2big',
      binary: NODE_BIN,
      argsTemplate: `-e ${evalArg(script)} {{prompt}}`,
      timeoutSeconds: 10,
    };
    const result = await spawnCliAgainstModel({
      model,
      prompt: E2BIG_PAYLOAD,
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(-2);
    expect(result.spawnError).toBeDefined();
    const msg = result.spawnError ?? '';
    // Structured classifier: must name the OS error AND the migration
    // path. An adopter who sees this message must be able to fix the
    // problem without reading the source.
    expect(msg).toMatch(/E2BIG/);
    expect(msg).toContain('{{prompt-stdin}}');
    // Migration cue points at the issue body / migration guide so the
    // operator can follow the link instead of guessing.
    expect(msg).toMatch(/#397|MIGRATING/i);
    // The byte count in the classifier helps the operator confirm the
    // prompt size is the cause (vs. e.g. environment bloat).
    expect(msg).toMatch(/\d+\s*(bytes|B)\b/);
  });

  it('counterfactual: {{prompt-stdin}} delivers the same ~5MB payload successfully', async () => {
    const script = `let buf=''; process.stdin.on('data', c => buf += c); process.stdin.on('end', () => process.stdout.write('len=' + buf.length));`;
    const model: ModelConfig = {
      name: 'fake-stdin-e2big-counter',
      binary: NODE_BIN,
      argsTemplate: `-e ${evalArg(script)} {{prompt-stdin}}`,
      timeoutSeconds: 10,
    };
    const result = await spawnCliAgainstModel({
      model,
      prompt: E2BIG_PAYLOAD,
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(0);
    expect(result.spawnError).toBeUndefined();
    const captured = await readFile(join(tmp, 'stdout.md'), 'utf8');
    expect(captured).toBe(`len=${E2BIG_PAYLOAD.length}`);
  });
});
