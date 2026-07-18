// specs/036-fleet-control-plane — AUDIT-20260718-16 (RED-first): event-log
// crash safety.
//
// THE REGRESSION: `src/plane/event-log.ts` `append` wrote with plain
// `appendFileSync` (no `fsyncSync`), and boot replay (`createEventLog`)
// called `parseLine` on every non-empty line with NO recovery — any
// unparseable line, including a trailing line truncated by a crash
// mid-append, threw a hard error and bricked plane startup until an
// operator hand-edited the log file.
//
// THIS SUITE pins the observable crash-safety contract directly at the
// `event-log.ts` module boundary (no HTTP/runtime harness needed — the
// defect and its fix both live entirely inside this module):
//
//   1. A TRAILING truncated/unparseable line (the shape a crash
//      mid-`append` leaves — `append` always writes `${json}\n`, so a
//      healthy file's raw text always ends in `\n`; a crash instead leaves
//      a non-empty partial fragment as the final line) is RECOVERED:
//      `createEventLog` does not throw, and every prior, fully-durable
//      event still replays.
//   2. A malformed line found BEFORE the trailing line is genuine
//      corruption (not an artifact of a crash in progress) and still
//      fails loud — the original fail-loud contract is preserved.
//
// Real node:fs tmp dir (.claude/rules/testing.md — real fs, no mocks).
// Relative `.js` imports under node16 resolution. No `any`/`as`/`@ts-ignore`
// (Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventLog } from '../../src/plane/event-log.js';
import { mintUuidV7 } from '../../src/fleet/types.js';
import type { ClassifiedEvent } from '../../src/plane/registry.js';
import type { EventEnvelope } from '../../src/fleet/types.js';

const LOG_FILE = 'accepted-events.log';

const dirsToClean = new Set<string>();
afterEach(() => {
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  dirsToClean.clear();
});

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scf-event-log-crash-'));
  dirsToClean.add(dir);
  return dir;
}

function sampleEvent(runId: string, sequence: number): ClassifiedEvent {
  const envelope: EventEnvelope = {
    eventId: mintUuidV7(),
    installationId: '11111111-1111-4111-8111-111111111111',
    invocationId: `inv-${runId}`,
    runId,
    installationSequence: sequence,
    invocationSequence: sequence,
    schemaVersion: 1,
    type: 'run.started',
    wallClock: new Date().toISOString(),
    monotonicOffsetMs: 5,
    classification: 'durable',
  };
  return { envelope, classification: envelope.classification, type: envelope.type };
}

describe('event-log survives a crash mid-append (AUDIT-20260718-16)', () => {
  it('recovers the good prefix when the trailing line is a truncated fragment (does not throw, does not brick boot)', () => {
    const dir = makeDir();

    // Persist two genuinely durable events through the real `append` path.
    const seed = createEventLog(dir);
    seed.append(sampleEvent('run-a', 1));
    seed.append(sampleEvent('run-b', 1));

    // Simulate a crash mid-write to the THIRD line: real appends always
    // write a full `${json}\n`; a crash leaves a partial, non-newline-
    // terminated fragment as the file's new tail — exactly what
    // `appendFileSync` (or any partial `write()`) can leave behind when the
    // process dies before the write completes.
    const path = join(dir, LOG_FILE);
    appendFileSync(path, '{"envelope":{"eventId":"trunc-would-continue-he');

    // Pre-fix, this constructor call throws (parseLine has no recovery path
    // for the trailing line) — that throw is the actual "plane cannot
    // start" defect AUDIT-20260718-16 names. Post-fix it must NOT throw.
    const recovered = createEventLog(dir);

    // The two prior, fully-durable events survive the crash; only the
    // truncated tail is dropped.
    expect(recovered.replayed).toHaveLength(2);
    expect(recovered.replayed[0]?.envelope.runId).toBe('run-a');
    expect(recovered.replayed[1]?.envelope.runId).toBe('run-b');

    // The recovered log is still writable — a fresh append lands after the
    // (dropped) truncated tail, and a subsequent boot sees all three good
    // events (the truncated fragment never resurfaces).
    recovered.append(sampleEvent('run-c', 1));
    const rebooted = createEventLog(dir);
    expect(rebooted.replayed).toHaveLength(3);
    expect(rebooted.replayed.map((e) => e.envelope.runId)).toEqual(['run-a', 'run-b', 'run-c']);
  });

  it('recovers even when the truncated tail is not valid JSON at all (not just an incomplete object)', () => {
    const dir = makeDir();
    const seed = createEventLog(dir);
    seed.append(sampleEvent('run-only', 1));

    const path = join(dir, LOG_FILE);
    appendFileSync(path, 'not even json{{{');

    const recovered = createEventLog(dir);
    expect(recovered.replayed).toHaveLength(1);
    expect(recovered.replayed[0]?.envelope.runId).toBe('run-only');
  });

  it('still fails loud on a malformed line found BEFORE the trailing line (genuine corruption, not a crash artifact)', () => {
    const dir = makeDir();
    const path = join(dir, LOG_FILE);
    const good = JSON.stringify(sampleEvent('run-good', 1));
    // A malformed line in the MIDDLE, followed by another well-formed
    // trailing line — this is NOT the "crash truncated the last write"
    // shape (there is a complete, well-formed line after it), so it must
    // still throw rather than being silently dropped.
    writeFileSync(path, `${good}\nthis line is not json at all\n${good}\n`);

    expect(() => createEventLog(dir)).toThrow(/corrupt line/);
  });

  it('AUDIT-20260718-42: a torn write that removes ONLY the trailing newline (JSON body intact, parseable) does not corrupt the next append', () => {
    const dir = makeDir();

    // Persist one genuinely durable event through the real `append` path —
    // `append` always writes `${json}\n`, so this file is currently
    // newline-terminated.
    const seed = createEventLog(dir);
    seed.append(sampleEvent('run-first', 1));

    // Simulate a torn write cut short by EXACTLY the final `\n` byte: the
    // JSON body is fully intact and parses fine (unlike the other tests in
    // this suite, which truncate mid-record) — only the terminator byte is
    // lost. This is the crash timing AUDIT-20260718-42 names: the file's
    // last line "parses fine", so `replayLog`'s existing branches treat it
    // as healthy and never re-terminate it on disk.
    const path = join(dir, LOG_FILE);
    const durable = readFileSync(path, 'utf8');
    expect(durable.endsWith('\n')).toBe(true);
    writeFileSync(path, durable.slice(0, -1));

    // Recovery replays the intact-but-unterminated record without throwing
    // (its JSON body is genuinely well-formed).
    const recovered = createEventLog(dir);
    expect(recovered.replayed).toHaveLength(1);
    expect(recovered.replayed[0]?.envelope.runId).toBe('run-first');

    // The next durable append must NOT land directly after the
    // unterminated tail (which would concatenate the two records into one
    // unparseable line). Pre-fix, `appendDurably` opens in plain append
    // mode and writes `${json}\n` with no separator logic of its own, so
    // this call silently corrupts the file on disk.
    recovered.append(sampleEvent('run-second', 1));

    // A THIRD boot must recover BOTH records — the first (already fsynced
    // before the torn write) and the second (fsynced by the append above).
    // Pre-fix, this throws: the on-disk line is now
    // `{...run-first}{...run-second}\n`, which is found as a NON-trailing
    // line by `replayLog` (a genuine trailing empty element follows it) and
    // so is parsed with no crash-recovery fallback — `parseLine` throws
    // "corrupt line", turning one crash-in-progress append into permanent,
    // total loss of BOTH the already-fsynced records on the next restart.
    const rebooted = createEventLog(dir);
    expect(rebooted.replayed).toHaveLength(2);
    expect(rebooted.replayed.map((e) => e.envelope.runId)).toEqual(['run-first', 'run-second']);
  });

  it('append is durable: content is visible via an independently-opened read immediately after append returns', () => {
    const dir = makeDir();
    const path = join(dir, LOG_FILE);
    const log = createEventLog(dir);
    log.append(sampleEvent('run-durable', 1));

    // A completely independent `readFileSync` call (not touching the
    // module's internal state) sees the appended bytes with a trailing
    // newline — proving the write completed (open→write→fsync→close)
    // before `append` returned, not deferred to some later flush.
    const raw = readFileSync(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.trim().length).toBeGreaterThan(0);
    const lines = raw.split('\n').filter((line) => line.trim() !== '');
    expect(lines).toHaveLength(1);
    const parsed: unknown = JSON.parse(lines[0] ?? '');
    expect(parsed).toMatchObject({ envelope: { runId: 'run-durable' } });
  });
});
