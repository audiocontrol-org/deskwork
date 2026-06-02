/**
 * Phase 14 Task 3 — `validate-return --response-file -` reads from stdin.
 *
 * Closes AUDIT-20260529-14.
 *
 * Mirrors the `gh issue create --body-file -` convention. Removes the
 * mktemp + Write round-trip the orchestrator currently does for every
 * reviewer dispatch.
 *
 * Behavior contract:
 *   - `responseFile === '-'` reads bytes from the supplied stdin stream
 *     until EOF, treats them as UTF-8.
 *   - Empty stdin emits a clear EmptyStdinError (the CLI surfaces it as
 *     exit 2 with an actionable message; tests assert the thrown error
 *     type/message).
 *   - `responseFile !== '-'` reads from disk via the existing fs path,
 *     unchanged.
 *
 * The library helper `readResponseSource(responseFile, stdin)` is the
 * test seam. The top-level `validateReturn` CLI shim still calls
 * `process.exit` and is not unit-tested here.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readResponseSource,
  EmptyStdinError,
  parseFlags,
} from '../../subcommands/validate-return.js';

function stdinFrom(text: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(text, 'utf8')]);
}

function emptyStdin(): NodeJS.ReadableStream {
  return Readable.from([]);
}

describe('parseFlags — accepts `-` as --response-file value', () => {
  it("treats '-' as a valid --response-file value (the stdin sentinel)", () => {
    const r = parseFlags(['--response-file', '-', '--agent-type', 'reviewer']);
    expect(r.ok).toBe(true);
    if (!r.ok || r.args === undefined) throw new Error('unreachable');
    expect(r.args.responseFile).toBe('-');
    expect(r.args.agentType).toBe('reviewer');
  });
});

describe('readResponseSource — stdin branch + file fallback', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'vr-stdin-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("reads UTF-8 bytes from stdin when responseFile === '-'", async () => {
    const body = [
      'Searched: foo — 3 matches',
      'Included: src/foo.ts:1',
      'Excluded: src/bar.ts:1 — descriptive reason',
      '',
    ].join('\n');
    const result = await readResponseSource('-', stdinFrom(body));
    expect(result).toBe(body);
  });

  it('reads multi-chunk stdin to EOF (large body)', async () => {
    const big = 'A'.repeat(64 * 1024);
    const streamed = new Readable({
      read(): void {
        this.push(Buffer.from(big.slice(0, 32 * 1024), 'utf8'));
        this.push(Buffer.from(big.slice(32 * 1024), 'utf8'));
        this.push(null);
      },
    });
    const result = await readResponseSource('-', streamed);
    expect(result.length).toBe(big.length);
    expect(result).toBe(big);
  });

  it('throws EmptyStdinError on zero-byte stdin', async () => {
    await expect(readResponseSource('-', emptyStdin())).rejects.toThrow(
      EmptyStdinError,
    );
  });

  it("EmptyStdinError carries an actionable message that names '--response-file'", async () => {
    let caught: unknown = null;
    try {
      await readResponseSource('-', emptyStdin());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(EmptyStdinError);
    if (!(caught instanceof EmptyStdinError)) throw new Error('unreachable');
    expect(caught.message).toMatch(/--response-file/);
    expect(caught.message).toMatch(/stdin|empty/i);
  });

  it("reads from disk when responseFile is NOT '-'", async () => {
    const path = join(tmp, 'response.txt');
    const body = 'on-disk response body';
    await writeFile(path, body, 'utf8');
    const result = await readResponseSource(path, emptyStdin());
    expect(result).toBe(body);
  });

  it("file-path mode does NOT consume stdin (even when stdin has bytes)", async () => {
    const path = join(tmp, 'response.txt');
    const onDisk = 'from file';
    await writeFile(path, onDisk, 'utf8');
    const result = await readResponseSource(
      path,
      stdinFrom('this should be ignored'),
    );
    expect(result).toBe(onDisk);
  });

  // Review-finding integration — Track 3 #4 (AUDIT-20260529-20).
  // `body.length === 0` only catches zero-byte stdin; whitespace-only
  // (e.g. `echo "" | ...`) passes through as a non-empty body and the
  // operator gets a confusing DispatchRejected instead of EmptyStdinError.
  // Fix: trim before the empty check.

  it("throws EmptyStdinError on newline-only stdin (whitespace-only sentinel)", async () => {
    await expect(
      readResponseSource('-', stdinFrom('\n')),
    ).rejects.toThrow(EmptyStdinError);
  });

  it("throws EmptyStdinError on CRLF-only stdin", async () => {
    await expect(
      readResponseSource('-', stdinFrom('\r\n')),
    ).rejects.toThrow(EmptyStdinError);
  });

  it("throws EmptyStdinError on multi-newline + whitespace-only stdin (echo-empty case)", async () => {
    await expect(
      readResponseSource('-', stdinFrom('   \n\n   \t\n')),
    ).rejects.toThrow(EmptyStdinError);
  });

  it("does NOT throw on stdin with one valid byte surrounded by whitespace", async () => {
    const result = await readResponseSource('-', stdinFrom('  x  '));
    expect(result).toBe('  x  ');
  });
});
