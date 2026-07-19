// specs/037-instance-observability — T030 [US3] RED test for the `phase.entered`
// emit seam (research.md D4; contracts/telemetry-events.md § phase.entered).
//
// THE CONTRACT (D4 — the ONE instrumentation seam for the whole
// design→spec→execute→govern timeline):
//
//   A COMMITTED workflow phase transition — `applyTransition` fired with
//   `apply === true` that LANDS (`outcome.committed === true`) inside
//   `emitAdvance` (src/subcommands/workflow-advance.ts) — emits a single
//   `phase.entered` telemetry event whose bounded snapshot is
//   `{ phase: t.to, from: t.from, item: r.item.identifier }`. `currentBearing`
//   is DERIVED downstream as `{ phase, item }` (analyze L2), so the seam carries
//   NO separate bearing/compass field — just `{ phase, from, item }`.
//
//   A DRY-RUN advance (`apply === false`, which returns BEFORE the commit at
//   workflow-advance.ts:~111) emits NOTHING.
//
//   The emit is FAIL-OPEN: a telemetry sink being unavailable never fails,
//   throws from, or perturbs the real phase advance (the transition still
//   commits; `emitAdvance` still returns cleanly).
//
// HOW WE OBSERVE (mirrors tests/instance/emit-stamps-identity.test.ts + the
// _ipc-fixture store-path binding): the production emit resolves its LOCAL
// socket from the installation root exactly as `resolveLocalSocketPath` does
// (`locateMachineState(root).socketPath`, proven equal to
// `store.socketPathFor(root)` by tests/fleet/machine-state-locate.test.ts:129).
// So we bind a REAL node:net recording peer at that resolved path and read the
// `event` frames it receives. No emitAdvance signature change is assumed — the
// RED failure is behavioral (no `phase.entered` observed), not a compile error.
//
// DELIVERY NOTE FOR THE IMPLEMENTER (T031): `emitAdvance` is synchronous, so at
// emit-time the eager socket connect has not completed — a `short-verb` buffer
// would DROP the event (buffer.ts: short-verb capacity 0). To be deliverable the
// phase.entered emit must hold the event across the connect gap (a `long-run`
// buffer drains on connect) and must NOT destroy the client before it connects.
// This is the implementer's concern; this test only waits for the frame to land.
//
// HOW WE DRIVE A REAL COMMITTED TRANSITION: a git-initialised fixture install
// carrying one `status: planned` roadmap node derives phase `planned`; its
// forward transition is `open-design` (planned → designing) whose exit-gate is
// `(none)` and whose effects END in `commit` — so `applyTransition` commits
// (`outcome.committed === true`), it is NOT a graduation, and `to !== closed`.
//
// Real node:net socket + real git + real temp dirs (.claude/rules/testing.md);
// relative `.js` imports under node16 (no `@/` alias in this plugin). No `any`,
// no `as`, no `@ts-ignore` (Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer, type Server, type Socket } from 'node:net';
import { useMachineStateStore, type MachineStateStore } from '../fleet/_machine-state-harness.js';
import { waitUntil } from '../fleet/_local-socket-peer.js';
import { splitFrameLines } from '../../src/telemetry/protocol.js';
import {
  makeWorkflowFixture,
  type WorkflowFixture,
} from '../../src/__tests__/fixtures/workflow/workflow-fixtures.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { emitAdvance } from '../../src/subcommands/workflow-advance.js';

const ITEM = 'multi:feature/phase-emit';
// open-design: planned → designing (the committed transition we drive).
const EXPECTED_SNAPSHOT = { phase: 'designing', from: 'planned', item: ITEM };

/** A real node:net UDS peer that records the newline-delimited frames it gets. */
interface RecordingPeer {
  readonly socketPath: string;
  readonly receivedLines: readonly string[];
  close(): Promise<void>;
}

/** Bind a recording peer at an EXACT socket path (the store-resolved emit
 * target), creating the 0700 parent dir first (PT-001), and resolve once it is
 * actually listening. */
async function startRecordingPeerAt(socketPath: string): Promise<RecordingPeer> {
  mkdirSync(dirname(socketPath), { recursive: true });
  chmodSync(dirname(socketPath), 0o700);
  const receivedLines: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket: Socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffered = '';
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      const { complete, remainder } = splitFrameLines(buffered);
      buffered = remainder;
      for (const line of complete) receivedLines.push(line);
    });
    socket.on('error', () => {
      /* a client that severs mid-frame is expected — never crash the peer. */
    });
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return {
    socketPath,
    receivedLines,
    async close(): Promise<void> {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** Structural narrow of an on-wire `event` frame carrying a typed phase snapshot,
 * without `any`/`as` — the `in` operator narrows `unknown` safely. */
function isPhaseSnapshotFrame(
  v: unknown,
): v is { kind: 'event'; event: { envelope: { type: string }; snapshot: Record<string, unknown> } } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'kind' in v &&
    v.kind === 'event' &&
    'event' in v &&
    typeof v.event === 'object' &&
    v.event !== null &&
    'envelope' in v.event &&
    typeof v.event.envelope === 'object' &&
    v.event.envelope !== null &&
    'type' in v.event.envelope &&
    typeof v.event.envelope.type === 'string' &&
    'snapshot' in v.event &&
    typeof v.event.snapshot === 'object' &&
    v.event.snapshot !== null
  );
}

/** Every `phase.entered` snapshot the peer has received so far. */
function phaseEnteredSnapshots(peer: RecordingPeer): Record<string, unknown>[] {
  return peer.receivedLines
    .map(parseLine)
    .filter(isPhaseSnapshotFrame)
    .filter((f) => f.event.envelope.type === 'phase.entered')
    .map((f) => f.event.snapshot);
}

describe('phase.entered emit seam (T030, D4 — committed advance emits; dry-run is silent; fail-open)', () => {
  const store = useMachineStateStore();
  const originalCwd = process.cwd();
  const fixtures: WorkflowFixture[] = [];
  const peers: RecordingPeer[] = [];

  /** A git-initialised install with one planned node, baseline-committed so the
   * advance-touched paths (ROADMAP.md, journal) are clean, then made cwd (the
   * root `emitAdvance` resolves via `resolveInstallation(process.cwd())`). */
  function drivableInstall(): WorkflowFixture {
    const f = makeWorkflowFixture([{ identifier: ITEM, status: 'planned' }], { git: true });
    fixtures.push(f);
    f.commitAll('baseline');
    process.chdir(f.root);
    return f;
  }

  async function peerAtEmitTarget(s: MachineStateStore, f: WorkflowFixture): Promise<RecordingPeer> {
    const peer = await startRecordingPeerAt(s.socketPathFor(f.root));
    peers.push(peer);
    return peer;
  }

  afterEach(async () => {
    process.chdir(originalCwd);
    for (const peer of peers.splice(0)) await peer.close();
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  it('a COMMITTED applyTransition (apply=true) emits phase.entered {phase,from,item}', async () => {
    const f = drivableInstall();
    const peer = await peerAtEmitTarget(store(), f);

    await emitAdvance(ITEM, true, {});

    // Sanity: the real transition actually LANDED (open-design → status in-flight),
    // so we are observing a COMMITTED advance, not a refused/no-op one.
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)?.status).toBe('in-flight');

    await waitUntil(() => phaseEnteredSnapshots(peer).length >= 1);
    const [snapshot] = phaseEnteredSnapshots(peer);
    expect(snapshot).toEqual(EXPECTED_SNAPSHOT);
  });

  it('a DRY-RUN advance (apply=false) emits NOTHING', async () => {
    const f = drivableInstall();
    const peer = await peerAtEmitTarget(store(), f);

    await emitAdvance(ITEM, false, {});

    // Dry-run wrote nothing (status unchanged) — and must have emitted nothing.
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)?.status).toBe('planned');
    // Give any (erroneous) emit a real chance to connect + deliver before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(phaseEnteredSnapshots(peer)).toEqual([]);
  });

  it('FAIL-OPEN: with NO telemetry sink the phase advance still commits and never throws', async () => {
    const f = drivableInstall();
    // Deliberately bind NO peer — the emit target socket is absent, the canonical
    // fail-open condition (sidecar unavailable). The advance must be unperturbed.
    // emitAdvance is async (its bounded deliver-or-budget wait — T048): assert the
    // RETURNED PROMISE resolves, not a synchronous throw, or a rejected promise
    // (a real fail-open regression) would sail past a `() => ...).not.toThrow()`.
    await expect(emitAdvance(ITEM, true, {})).resolves.toBeUndefined();
    expect(loadRoadmap(f.roadmapPath, f.opts).byId.get(ITEM)?.status).toBe('in-flight');
  });
});
