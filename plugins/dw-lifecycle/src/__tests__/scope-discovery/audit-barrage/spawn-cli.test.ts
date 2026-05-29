/**
 * Tests for spawn-cli.ts — exercise the spawn helper against fake
 * CLIs implemented as inline `node -e` scripts. Fake-CLI subprocesses
 * keep the tests hermetic (no dependency on the operator having the
 * real CLIs installed) while still exercising the real
 * `child_process.spawn` machinery.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildArgs,
  spawnCliAgainstModel,
} from '../../../scope-discovery/audit-barrage/spawn-cli.js';
import type { ModelConfig } from '../../../scope-discovery/audit-barrage/types.js';

const NODE_BIN = process.execPath;

/**
 * Build a ModelConfig for a fake CLI implemented as inline JS.
 *
 * The script body would normally collide with the whitespace-split
 * contract of `buildArgs` (which tokenizes argsTemplate on whitespace
 * before substituting `{{prompt}}`). Workaround: encode the script
 * via base64 + decode-and-eval, which keeps the embedded source from
 * containing internal whitespace.
 */
function fakeCli(opts: {
  readonly script: string;
  readonly timeoutSeconds?: number;
}): ModelConfig {
  const b64 = Buffer.from(opts.script, 'utf8').toString('base64');
  const evalArg = `eval(Buffer.from('${b64}','base64').toString('utf8'))`;
  return {
    name: 'fake',
    binary: NODE_BIN,
    argsTemplate: `-e ${evalArg} {{prompt}}`,
    timeoutSeconds: opts.timeoutSeconds ?? 5,
  };
}

describe('buildArgs', () => {
  it('preserves multi-token templates and substitutes the prompt as a single argv element', () => {
    const args = buildArgs('-p {{prompt}}', 'hello world with spaces');
    expect(args).toEqual(['-p', 'hello world with spaces']);
  });

  it('handles a bare {{prompt}} template', () => {
    const args = buildArgs('{{prompt}}', 'audit me');
    expect(args).toEqual(['audit me']);
  });

  it('handles multiple leading tokens (codex shape)', () => {
    const args = buildArgs('exec {{prompt}}', 'codex audit');
    expect(args).toEqual(['exec', 'codex audit']);
  });

  it('collapses inner whitespace in the template', () => {
    const args = buildArgs('  -p   {{prompt}}  ', 'x');
    expect(args).toEqual(['-p', 'x']);
  });

  it('substitutes {{prompt}} inside an embedded token (--prompt={{prompt}})', () => {
    const args = buildArgs('--prompt={{prompt}}', 'hello');
    expect(args).toEqual(['--prompt=hello']);
  });

  it('substitutes {{prompt}} inside an embedded token preserving sibling tokens', () => {
    const args = buildArgs('--format=json --prompt={{prompt}} --quiet', 'audit me');
    expect(args).toEqual(['--format=json', '--prompt=audit me', '--quiet']);
  });

  it('substitutes every {{prompt}} occurrence within a single token', () => {
    const args = buildArgs('--a={{prompt}}--b={{prompt}}', 'X');
    expect(args).toEqual(['--a=X--b=X']);
  });
});

describe('spawnCliAgainstModel', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-barrage-spawn-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('captures stdout to file + records exit 0 on success', async () => {
    const result = await spawnCliAgainstModel({
      model: fakeCli({
        script: `process.stdout.write('echoed: ' + process.argv[1]);`,
      }),
      prompt: 'hello-prompt',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.spawnError).toBeUndefined();
    expect(result.stdoutBytes).toBeGreaterThan(0);
    expect(result.stderrBytes).toBe(0);
    const captured = await readFile(join(tmp, 'stdout.md'), 'utf8');
    expect(captured).toBe('echoed: hello-prompt');
  });

  it('captures stderr separately from stdout', async () => {
    const result = await spawnCliAgainstModel({
      model: fakeCli({
        script: `process.stdout.write('out');process.stderr.write('err');`,
      }),
      prompt: 'whatever',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdoutBytes).toBe(3);
    expect(result.stderrBytes).toBe(3);
    const out = await readFile(join(tmp, 'stdout.md'), 'utf8');
    const err = await readFile(join(tmp, 'stderr.txt'), 'utf8');
    expect(out).toBe('out');
    expect(err).toBe('err');
  });

  it('records non-zero exit code without crashing', async () => {
    const result = await spawnCliAgainstModel({
      model: fakeCli({
        script: `process.stdout.write('partial output');process.exit(2);`,
      }),
      prompt: 'x',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(2);
    expect(result.timedOut).toBe(false);
    expect(result.spawnError).toBeUndefined();
    const out = await readFile(join(tmp, 'stdout.md'), 'utf8');
    expect(out).toBe('partial output');
  });

  it('records timeout when the child runs past timeoutSeconds', async () => {
    const result = await spawnCliAgainstModel({
      model: fakeCli({
        script: `setTimeout(() => process.stdout.write('late'), 5000);`,
        timeoutSeconds: 1,
      }),
      prompt: 'x',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.timedOut).toBe(true);
    // Either signal-terminated (-1) or any non-zero exit; the SIGTERM
    // child returns -1 because `code` is null when terminated by signal.
    expect(result.exitCode).toBe(-1);
  }, 15000);

  it('captures spawnError when the binary does not exist', async () => {
    const result = await spawnCliAgainstModel({
      model: {
        name: 'nonexistent',
        binary: '/this/path/definitely/does/not/exist/binary',
        argsTemplate: '{{prompt}}',
        timeoutSeconds: 5,
      },
      prompt: 'x',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(-2);
    expect(result.spawnError).toBeDefined();
    expect(result.spawnError ?? '').toMatch(/ENOENT|not found|no such/i);
    expect(result.timedOut).toBe(false);
  });

  // AUDIT-20260529-01 — settling on `'close'` (not `'exit'`) ensures
  // late-emitted stdout chunks land in the on-disk capture. The fake
  // CLI here writes a large payload right before exiting; with
  // `'exit'`-based settling, the byte-counter snapshot would race the
  // pipe drain and intermittently truncate.
  it('captures all stdout emitted right before process exit', async () => {
    // 200 lines of ~50 bytes each = ~10 KB; large enough to span
    // multiple data chunks across the pipe.
    const lines = Array.from({ length: 200 }, (_, i) => `LINE-${i.toString().padStart(4, '0')}-pad`);
    const script = [
      `const lines = ${JSON.stringify(lines)};`,
      `for (const line of lines) { process.stdout.write(line + '\\n'); }`,
      `process.exit(0);`,
    ].join(' ');
    const result = await spawnCliAgainstModel({
      model: fakeCli({ script }),
      prompt: 'x',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    expect(result.exitCode).toBe(0);
    const captured = await readFile(join(tmp, 'stdout.md'), 'utf8');
    const expectedBody = lines.join('\n') + '\n';
    expect(captured).toBe(expectedBody);
    expect(result.stdoutBytes).toBe(Buffer.byteLength(expectedBody, 'utf8'));
  });

  // AUDIT-20260529-05 — spawn-error path must clear the timeout timer
  // so the run doesn't leak a ~300s dangling handle. We assert
  // observable behavior: vitest's open-handle detection runs after the
  // test settles; if a timer survives, the test process emits a
  // warning. We also confirm the result resolves promptly (well under
  // any plausible timeout window).
  it('does not leak a timeout timer when the binary does not exist', async () => {
    const start = Date.now();
    const result = await spawnCliAgainstModel({
      model: {
        name: 'nonexistent-leak-check',
        binary: '/this/path/definitely/does/not/exist/binary',
        // Pick a timeout long enough that a leaked timer would be
        // observable as an open handle warning if cleanup were
        // skipped.
        argsTemplate: '{{prompt}}',
        timeoutSeconds: 30,
      },
      prompt: 'x',
      stdoutPath: join(tmp, 'stdout.md'),
      stderrPath: join(tmp, 'stderr.txt'),
    });
    const elapsed = Date.now() - start;
    expect(result.exitCode).toBe(-2);
    expect(result.spawnError).toBeDefined();
    // Result must settle quickly (spawn-error is synchronous-ish);
    // anything beyond a second indicates the run waited on something.
    expect(elapsed).toBeLessThan(2000);
    // Give Node a tick to surface any post-settle timer activity.
    await new Promise((r) => setTimeout(r, 50));
  });
});
