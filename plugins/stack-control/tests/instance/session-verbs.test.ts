// specs/037-instance-observability — T025 (RED-first), pairs with T026's impl.
//
// The session lifecycle PRODUCER behavior (contracts/telemetry-events.md
// § session.started / session.ended; data-model.md D9; spec.md FR-007/
// FR-009a/FR-012):
//
//   - `session-start` MINTS the current-session record
//     (`src/machine-state/current-session.ts` `mint`) AND emits a
//     `session.started` event whose SNAPSHOT is `{ sessionId, startedAt }`.
//   - `session-end` emits a `session.ended` event whose SNAPSHOT is
//     `{ sessionId, endedAt, reason: 'ended' }` AND clears the current-session
//     record.
//   - Both are FAIL-OPEN (`.claude/rules/session-skills-never-block.md`): the
//     verb completes (never blocks/throws) even when the sidecar/plane is
//     unreachable — no peer bound at the resolved socket at all.
//   - SUPERSEDE (FR-009a): a SECOND `session-start` over an existing
//     current-session record emits `session.ended{reason:'abandoned'}` for the
//     OLD sessionId first, then mints the new record.
//
// AS OF THIS TASK neither `runSessionStartCli` nor `runSessionEndCli` mints/
// clears the current-session record or emits anything — every assertion below
// FAILS RED: `CurrentSession.read()` never observes a record, and no
// `session.*` event frame ever reaches the peer.
//
// MECHANISM (mirrors tests/instance/emit-stamps-identity.test.ts, T019): a
// REAL `node:net` UDS peer, bound at the EXACT socket path
// `locateMachineState(<installationRoot>).socketPath` resolves to under the
// harness-redirected runtime dir (`src/telemetry/emit.ts`'s
// `resolveLocalSocketPath` derives the same path from the same
// `locateMachineState` call — no override seam exists on the session verbs,
// so the peer must be bound at the path the verb will actually dial). The
// verbs are invoked IN-PROCESS (not via a subprocess), exactly like T019
// drives `runInvocationWithTelemetry` directly — this keeps the peer and the
// verb call in the same event loop for `waitUntil` polling.
//
// `CurrentSession.mint/read/clear` accept an OPTIONAL installation root
// (module header, current-session.ts; AUDIT-20260719-02): omitted it resolves
// `resolveInstallation(process.cwd())`, but the `--at`-resolved verbs pass
// their target root so the record follows the target. The cwd-less scenarios
// below (session-start with no `--at`) assert against the REAL enclosing
// installation (this plugin's own repo root, which vitest runs from); the
// session-end scenarios pass the SAME `--at` fixture root to
// `CurrentSession.mint/read` so the record they seed lives under the target
// session-end reads/clears — mirroring session-end.ts threading
// `installation.root` (the `--at` value) through every concern (record, git
// commit/push, and the reused emit path). A real session-end MUST NEVER run
// against this actual repository from a test (it would commit/push for real) —
// `--at <fixture>` + `--no-push` is the isolation boundary that makes this test
// safe to run at all.
//
// Real UDS peer + real temp dirs + real git fixture; relative `.js` imports
// under node16 (no `@/` alias configured for this plugin). No `any`/`as`/
// `@ts-ignore` (Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Socket } from 'node:net';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from '../fleet/_machine-state-harness.js';
import { waitUntil } from '../fleet/_local-socket-peer.js';
import {
  LOCAL_PROTOCOL_VERSION,
  buildHelloAckFrame,
  parseCliToSidecarFrame,
  serializeFrame,
  splitFrameLines,
} from '../../src/telemetry/protocol.js';
import { locateMachineState } from '../../src/machine-state/locate.js';
import * as CurrentSession from '../../src/machine-state/current-session.js';
import { runSessionStartCli } from '../../src/subcommands/session-start.js';
import { runSessionEndCli } from '../../src/subcommands/session-end.js';

const roots: string[] = [];
const peers: AtPathPeer[] = [];

afterEach(async () => {
  for (const peer of peers.splice(0)) await peer.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// --- a real UDS 'ack' peer bound at an EXACT (not auto-generated) path -----
// (`tests/fleet/_local-socket-peer.ts`'s `startLocalSocketPeer` always mints
// its own path; the session verbs have no `--socketPath`/options override
// seam like `runInvocationWithTelemetry`, so the peer must instead be bound
// at the path the verb will independently resolve via `locateMachineState`.)

interface AtPathPeer {
  readonly socketPath: string;
  readonly receivedLines: readonly string[];
  close(): Promise<void>;
}

async function startAckPeerAt(socketPath: string): Promise<AtPathPeer> {
  const receivedLines: string[] = [];
  const sockets = new Set<Socket>();

  const server = createServer((socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.setEncoding('utf8');
    let buffered = '';
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      const { complete, remainder } = splitFrameLines(buffered);
      buffered = remainder;
      for (const line of complete) {
        receivedLines.push(line);
        const parsed = parseCliToSidecarFrame(line);
        if (parsed.ok && parsed.frame.kind === 'hello') {
          socket.write(serializeFrame(buildHelloAckFrame(parsed.frame, LOCAL_PROTOCOL_VERSION)));
        }
      }
    });
    socket.on('error', () => {
      /* a client that severs mid-frame is expected — never crash the peer. */
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  let closed = false;
  return {
    socketPath,
    receivedLines,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// --- frame parsing (mirrors emit-stamps-identity.test.ts's eventEnvelopes) -

interface EnvelopeShape {
  readonly type: string;
  readonly sessionId: string | null;
}

interface SnapshotShape {
  readonly sessionId?: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly reason?: string;
}

function eventPairs(peer: AtPathPeer): Array<{ envelope: EnvelopeShape; snapshot: SnapshotShape }> {
  return peer.receivedLines
    .map((line) => JSON.parse(line))
    .filter(
      (f): f is { kind: string; event: { envelope: EnvelopeShape; snapshot: SnapshotShape } } =>
        f !== null && typeof f === 'object' && f.kind === 'event',
    )
    .map((f) => ({ envelope: f.event.envelope, snapshot: f.event.snapshot }));
}

// --- a disposable git fixture for session-end (NEVER the real dev repo) ----

const ROADMAP = `---
doc-grammar: roadmap
---

# Roadmap

## impl:feature/x
- status: planned
`;

function makeGitFixture(): string {
  // realpathSync matters here: on macOS both "/tmp" and (less obviously)
  // "/var/folders/..." (os.tmpdir()) are symlinks into "/private/...".
  // tests/session/end-commit-push.test.ts's equivalent fixture is driven via
  // `runCli` (a SPAWNED subprocess), where the OS's own `getcwd()` silently
  // canonicalizes `cwd` for the child — so `process.cwd()` inside that
  // subprocess is already realpath'd. This test drives `runSessionEndCli`
  // IN-PROCESS (matching T019's pattern), so no such auto-canonicalization
  // happens: the raw mkdtemp path must be realpath'd by hand before use as
  // `--at`, or `git rev-parse --show-toplevel` (session-end.ts's
  // `gitToplevel`) returns the resolved form while the un-realpath'd `--at`
  // does not, and `path.relative` emits a bogus "outside repository" path.
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'scf-sessend-')));
  roots.push(repo);
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(repo, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(repo, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repo });
  return repo;
}

describe('session-start / session-end telemetry producers (T025, FR-007/FR-009a/FR-012)', () => {
  // Registers beforeEach/afterEach that redirect the machine-local store to a
  // fresh temp dir per test (harness — never a real developer $HOME/state).
  useMachineStateStore();

  it('session-start MINTS the current-session record and emits session.started{sessionId,startedAt}', async () => {
    // session-start.ts has no --at in this scenario, so it (and
    // current-session.ts) both resolve against process.cwd() — this plugin's
    // own installation, the same one every other cwd-less current-session
    // caller resolves. Session-start is proven read-only/0-on-disk-change
    // (tests/session/start-readonly.test.ts), so driving it against the real
    // repo tree is safe.
    const location = locateMachineState(process.cwd());
    const peer = await startAckPeerAt(location.socketPath);
    peers.push(peer);

    await runSessionStartCli([]);

    const record = CurrentSession.read();
    expect(record).not.toBeNull();
    const sessionId = record?.sessionId;
    const startedAt = record?.startedAt;

    await waitUntil(() => eventPairs(peer).some((e) => e.envelope.type === 'session.started'));
    const started = eventPairs(peer).find((e) => e.envelope.type === 'session.started');
    expect(started).toBeDefined();
    expect(started?.snapshot).toEqual({ sessionId, startedAt });
  });

  it('FAIL-OPEN: session-start still mints the record and completes when the sidecar is unreachable (no peer bound)', async () => {
    // Deliberately no peer at all — the resolved socket is unreachable.
    await expect(runSessionStartCli([])).resolves.toBeUndefined();
    expect(CurrentSession.read()).not.toBeNull();
  });

  it('session-end emits session.ended{sessionId,endedAt,reason:"ended"} and clears the record', async () => {
    const repo = makeGitFixture();
    const location = locateMachineState(repo);
    const peer = await startAckPeerAt(location.socketPath);
    peers.push(peer);

    // Open a session UNDER THE TARGET (`--at` value) — session-end reads/clears
    // the record for the installation it targets (AUDIT-20260719-02), so the
    // record must be seeded under that same root, not cwd.
    const sessionId = 'session-end-open-1';
    CurrentSession.mint(sessionId, '2026-07-18T09:00:00Z', repo);

    await runSessionEndCli(['--at', repo, '--no-push']);

    expect(CurrentSession.read(repo)).toBeNull();

    await waitUntil(() => eventPairs(peer).some((e) => e.envelope.type === 'session.ended'));
    const ended = eventPairs(peer).find((e) => e.envelope.type === 'session.ended');
    expect(ended).toBeDefined();
    expect(ended?.snapshot.sessionId).toBe(sessionId);
    expect(ended?.snapshot.reason).toBe('ended');
    expect(typeof ended?.snapshot.endedAt).toBe('string');
  });

  it('FAIL-OPEN: session-end still clears the record and completes when the sidecar is unreachable (no peer bound)', async () => {
    const repo = makeGitFixture();
    // Seed the record under the TARGET (`--at` value); session-end clears the
    // target's record (AUDIT-20260719-02).
    CurrentSession.mint('session-failopen-1', '2026-07-18T09:30:00Z', repo);

    // Deliberately no peer at all.
    await expect(runSessionEndCli(['--at', repo, '--no-push'])).resolves.toBeUndefined();
    expect(CurrentSession.read(repo)).toBeNull();
  });

  it('SUPERSEDE (FR-009a): a second session-start emits session.ended{reason:"abandoned"} for the old session before minting the new one', async () => {
    const location = locateMachineState(process.cwd());
    const peer = await startAckPeerAt(location.socketPath);
    peers.push(peer);

    await runSessionStartCli([]);
    const first = CurrentSession.read();
    expect(first).not.toBeNull();
    const firstId = first?.sessionId;
    await waitUntil(() => eventPairs(peer).some((e) => e.envelope.type === 'session.started'));

    await runSessionStartCli([]);
    const second = CurrentSession.read();
    expect(second).not.toBeNull();
    const secondId = second?.sessionId;
    expect(secondId).not.toBe(firstId);

    await waitUntil(() =>
      eventPairs(peer).some((e) => e.envelope.type === 'session.ended' && e.snapshot.sessionId === firstId),
    );
    const abandoned = eventPairs(peer).find(
      (e) => e.envelope.type === 'session.ended' && e.snapshot.sessionId === firstId,
    );
    expect(abandoned).toBeDefined();
    expect(abandoned?.snapshot.reason).toBe('abandoned');

    // Both sessions' session.started events are present (new mint always fires
    // its own session.started — supersede does not swallow it). The second
    // session.started is fire-and-forget, so wait for BOTH to arrive before
    // asserting — otherwise this races under heavy parallel load.
    await waitUntil(
      () => eventPairs(peer).filter((e) => e.envelope.type === 'session.started').length >= 2,
    );
    const startedIds = eventPairs(peer)
      .filter((e) => e.envelope.type === 'session.started')
      .map((e) => e.snapshot.sessionId)
      .sort();
    expect(startedIds).toEqual([firstId, secondId].sort());

    // FR-009a ORDERING (AUDIT-20260719-08): the old session's
    // session.ended{abandoned} MUST be emitted BEFORE the new session's
    // session.started — a consumer must never observe two open sessions with no
    // intervening end. session-start.ts awaits the abandoned emit (bounded
    // delivery) before the new started emit, so received order == emit order.
    const received = eventPairs(peer);
    const abandonedIdx = received.findIndex(
      (e) => e.envelope.type === 'session.ended' && e.snapshot.sessionId === firstId,
    );
    const newStartedIdx = received.findIndex(
      (e) => e.envelope.type === 'session.started' && e.snapshot.sessionId === secondId,
    );
    expect(abandonedIdx).toBeGreaterThanOrEqual(0);
    expect(newStartedIdx).toBeGreaterThanOrEqual(0);
    expect(abandonedIdx).toBeLessThan(newStartedIdx);
  });
});

// AUDIT-20260719-02 (HIGH) — the current-session RECORD must follow the verb's
// `--at` TARGET installation, not the caller's cwd. Before the fix, `mint`/
// `read`/`clear` ignored the resolved `--at` root and always resolved
// `process.cwd()`: `session-start --at <target>` emitted `session.started` for
// <target> but wrote the OPEN-SESSION record under the CWD installation, and
// `session-end --at <target>` then read/cleared the CWD record — so <target>'s
// real record was never closed and its session lifecycle accounting was silently
// wrong. This is the regression test for that split. It uses a target
// installation DISTINCT from the test's cwd; both durable dirs land under the
// SAME harness-redirected machine-state store, keyed by their respective roots.
describe('session-start / session-end honor --at for the current-session RECORD (AUDIT-20260719-02)', () => {
  useMachineStateStore();

  it('session-start --at <target> writes the record under the TARGET (not cwd); session-end --at <target> reads+clears it and emits the matching session id', async () => {
    // A target installation DISTINCT from cwd. makeGitFixture() realpaths the
    // temp path, so /tmp↔/private/tmp cannot spuriously mismatch the
    // realpath'd store key that locateMachineState derives.
    const target = makeGitFixture();
    const targetLoc = locateMachineState(target);
    const cwdLoc = locateMachineState(process.cwd());
    // Sanity: the two installations resolve to genuinely different durable dirs.
    expect(targetLoc.durableDir).not.toBe(cwdLoc.durableDir);

    const targetRecord = join(targetLoc.durableDir, 'current-session');
    const cwdRecord = join(cwdLoc.durableDir, 'current-session');

    const peer = await startAckPeerAt(targetLoc.socketPath);
    peers.push(peer);

    // --- session-start --at <target>: the record must land under TARGET, not cwd.
    await runSessionStartCli(['--at', target]);

    // FAILS RED today: the record is written under cwd's durable dir instead.
    expect(existsSync(targetRecord)).toBe(true);
    expect(existsSync(cwdRecord)).toBe(false);

    // The emitted session.started id is the id of the session now open on TARGET.
    await waitUntil(() => eventPairs(peer).some((e) => e.envelope.type === 'session.started'));
    const started = eventPairs(peer).find((e) => e.envelope.type === 'session.started');
    expect(started).toBeDefined();
    const startedId = started?.snapshot.sessionId;
    expect(typeof startedId).toBe('string');

    // --- session-end --at <target>: it must read + CLEAR the TARGET's record and
    // emit session.ended for the SAME session id session-start opened on TARGET.
    await runSessionEndCli(['--at', target, '--no-push']);

    // FAILS RED today: session-end reads/clears cwd's record, leaving TARGET's open.
    expect(existsSync(targetRecord)).toBe(false);

    await waitUntil(() => eventPairs(peer).some((e) => e.envelope.type === 'session.ended'));
    const ended = eventPairs(peer).find((e) => e.envelope.type === 'session.ended');
    expect(ended).toBeDefined();
    expect(ended?.snapshot.sessionId).toBe(startedId);
    expect(ended?.snapshot.reason).toBe('ended');
  });
});
