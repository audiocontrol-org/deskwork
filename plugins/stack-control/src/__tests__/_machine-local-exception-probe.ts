// specs/036-fleet-control-plane — T126 helper (not a *.test.ts, so vitest does
// not collect it). Factored out of installation-isolation-probe.test.ts to keep
// that file under the 300–500 line cap; the describe/it.each stays there, this
// module owns the ops table + the per-op bound assertions.
//
// BOUND the declared machine-local exception (FR-008 / SC-001; plan.md §
// Complexity Tracking, "the isolation exception must be tested, not assumed").
//
// 036 DELIBERATELY persists identity OUTSIDE the installation tree — the
// installationId, the bearer token, and the installationSequence high-water mark
// live in a MACHINE-LOCAL durable store (HOME/XDG-located), never in the
// version-controlled `.stack-control/`. That is the SOLE sanctioned outside-tree
// write. Each op below asserts the exception is (a) real + exercised — the write
// reaches the machine-local store — and (b) bounded on every other axis: the
// outer tree, the real `$HOME` (the T009 poison tripwire), and the installation
// tree all receive NOTHING. A machine-local write that leaked to any of those
// three, or created a durable file outside `KNOWN_DURABLE_FILES`, fails the bound
// instead of passing silently.
//
// No `any`, no `as`, no `@ts-ignore`. Relative `.js` imports (node16). Real
// filesystem via the redirected store — never a mocked fs.

import { expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  diffSnapshots,
  snapshotDirTree,
  snapshotOutsideInstallation,
  type NestedFixture,
} from './_isolation-harness.js';
import {
  assertTripwireEmpty,
  type MachineStateStore,
} from '../../tests/fleet/_machine-state-harness.js';
import { locateMachineState } from '../machine-state/locate.js';
import {
  mintOrReadInstallationId,
  readInstallationId,
} from '../machine-state/identity.js';
import {
  advanceHighWaterMark,
  readHighWaterMark,
} from '../machine-state/highwater.js';
import { openTokenCustody } from '../machine-state/token.js';

/** The COMPLETE set of durable filenames 036 machine-local state may create.
 *  A durable file outside this set is an unbounded new outside-tree write and
 *  MUST fail the bound (T126) rather than be silently admitted — extend this set
 *  deliberately when a new machine-local field is added, never quietly. */
export const KNOWN_DURABLE_FILES: ReadonlySet<string> = new Set([
  'installation-id', // identity.ts (T026)
  'bearer-token', // token.ts (T118)
  'installation-sequence-highwater.json', // highwater.ts (T028)
]);

export interface MachineLocalOp {
  readonly name: string;
  /** Perform the 036 machine-local write against `fixture.installationRoot`. */
  readonly run: (fixture: NestedFixture) => Promise<void> | void;
  /** Durable filename(s) this op MUST have created (positive: exception real). */
  readonly mustCreate: readonly string[];
  /**
   * When true, the durable dir must contain EXACTLY `mustCreate` (a single
   * in-process writer touches nothing else). When false (the CLI verb, which
   * also mints id + advances the high-water mark on its emit path), the dir is
   * only required to be a SUBSET of `KNOWN_DURABLE_FILES` — still a hard bound
   * that catches an unknown new durable file.
   */
  readonly exactDurable: boolean;
}

export const MACHINE_LOCAL_OPS: readonly MachineLocalOp[] = [
  {
    // identity.ts (T026) in-process: mint-once persists installationId, and
    // NOTHING else, into the machine-local durable dir.
    name: 'mintOrReadInstallationId (identity.ts)',
    run: (fixture) => {
      const id = mintOrReadInstallationId(fixture.installationRoot);
      expect(readInstallationId(fixture.installationRoot)).toBe(id);
    },
    mustCreate: ['installation-id'],
    exactDurable: true,
  },
  {
    // highwater.ts (T028) in-process: advancing the durable mark writes exactly
    // the high-water file into the machine-local durable dir.
    name: 'advanceHighWaterMark (highwater.ts)',
    run: (fixture) => {
      const location = locateMachineState(fixture.installationRoot);
      const advanced = advanceHighWaterMark(location, readHighWaterMark(location) + 7);
      expect(advanced).toBe(7);
    },
    mustCreate: ['installation-sequence-highwater.json'],
    exactDurable: true,
  },
  {
    // token.ts (T118) in-process: custody write places the bearer token, and
    // only it, into the machine-local durable dir.
    name: 'openTokenCustody().write (token.ts)',
    run: (fixture) => {
      const location = locateMachineState(fixture.installationRoot);
      openTokenCustody(location.durableDir).write('custody-bearer-abc');
      expect(openTokenCustody(location.durableDir).read()).toBe('custody-bearer-abc');
    },
    mustCreate: ['bearer-token'],
    exactDurable: true,
  },
];

/**
 * Run one machine-local op and assert the full bound: the write lands in the
 * machine-local durable store (exception real + exercised), that store is the
 * ONLY outside-tree write (outer tree byte-identical + tripwire empty), and the
 * installation tree receives nothing. Caller owns the fixture lifecycle and the
 * active machine-state redirect (`store`).
 */
export async function assertMachineLocalExceptionBound(
  op: MachineLocalOp,
  fixture: NestedFixture,
  store: MachineStateStore,
): Promise<void> {
  // Baselines: the whole outer tree (excl. installation) + the whole
  // installation subtree, BEFORE the machine-local write.
  const outerBefore = snapshotOutsideInstallation(fixture);
  const installBefore = snapshotDirTree(fixture.installationRoot);

  await op.run(fixture);

  // (1) EXCEPTION REAL + EXERCISED — the write reached the machine-local durable
  //     store, which is genuinely OUTSIDE the tree and under the REDIRECTED store
  //     (a disposable temp, never a real $HOME).
  const location = locateMachineState(fixture.installationRoot);
  expect(
    location.durableDir.startsWith(fixture.outerRoot),
    'durable dir must NOT live under the installation/outer tree',
  ).toBe(false);
  expect(
    location.durableDir.startsWith(store.root),
    'durable dir must resolve under the redirected (hermetic) store',
  ).toBe(true);
  for (const file of op.mustCreate) {
    expect(
      existsSync(join(location.durableDir, file)),
      `expected machine-local durable file ${file} after ${op.name}`,
    ).toBe(true);
  }

  // The durable dir contents are BOUNDED: exactly `mustCreate` for a single
  // in-process writer; a subset of the known durable filenames for the CLI verb.
  // Either way, an UNKNOWN new durable file fails here (a future 036 field is
  // caught, not silently admitted).
  const durableEntries = readdirSync(location.durableDir).sort();
  if (op.exactDurable) {
    expect(durableEntries).toEqual([...op.mustCreate].sort());
  } else {
    for (const entry of durableEntries) {
      expect(
        KNOWN_DURABLE_FILES.has(entry),
        `unbounded machine-local durable file '${entry}' — extend KNOWN_DURABLE_FILES deliberately (T126)`,
      ).toBe(true);
    }
    for (const file of op.mustCreate) {
      expect(durableEntries).toContain(file);
    }
  }

  // (2) The machine-local store is the ONLY outside-tree write: the OUTER repo is
  //     byte-identical, and NO durable identity leaked to a real $HOME (the
  //     import-time poison tripwire is empty).
  expect(
    diffSnapshots(outerBefore, snapshotOutsideInstallation(fixture)),
    'a machine-local op mutated the outer tree (isolation invariant FR-001)',
  ).toEqual([]);
  assertTripwireEmpty();

  // (3) The INSTALLATION tree receives NOTHING from the machine-local op — the
  //     exception writes machine-local, never into the tree.
  expect(
    diffSnapshots(installBefore, snapshotDirTree(fixture.installationRoot)),
    'a machine-local op wrote into the installation tree (FR-008 exception must not smear into the tree)',
  ).toEqual([]);
}
