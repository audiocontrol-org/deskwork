export type SchemeId = 'A' | 'B' | 'C';

export const SCHEME_IDS: ReadonlyArray<SchemeId> = ['A', 'B', 'C'];

export function isSchemeId(value: unknown): value is SchemeId {
  return typeof value === 'string'
    && (SCHEME_IDS as ReadonlyArray<string>).includes(value);
}

export interface SchemeMapping {
  readonly id: SchemeId;
  /**
   * The leading shim-name prefix this scheme uses. Scheme A uses `dw`
   * (no hyphen — shims are `dwi`, `dws`, `dwsh`, ...). Schemes B and C
   * use `dw-` (shims are `dw-im`, `dw-implement`, ...). Surfaced here so
   * rename mechanics consult a single source of truth rather than
   * guessing from the shim string.
   */
  readonly prefix: string;
  shimFor(command: string): string;
  entries(): ReadonlyArray<readonly [string, string]>;
}

// The 19 lifecycle commands that get shortcut shims. The plugin also
// ships `install-shortcuts` and `uninstall-shortcuts` as meta-commands;
// those are intentionally excluded here — they bootstrap and roll back
// the shim install itself, so giving them shims would be a chicken-and-
// egg shape. The on-disk parity test in __tests__/shortcuts.test.ts
// accounts for the exclusion explicitly.
//
// `audit-barrage` is the multi-model audit barrage skill (the third
// independent audit surface alongside the in-band self-audit and the
// SDD two-reviewer cycle). It's an operator-triggered skill the
// implementation team invokes during a feature's lifecycle, so it
// earns a shim slot — same posture as `audit` and `review`.
//
// `promote-findings` is the Phase 13 audit-finding-to-workplan bridge.
// It's an operator-triggered skill the implementation team invokes
// after every audit cycle (in-band, SDD review, audit-barrage), so it
// earns a shim slot — same posture as `audit-barrage` and `review`.
export const COMMANDS = [
  'audit',
  'audit-barrage',
  'complete',
  'customize',
  'define',
  'doctor',
  'extend',
  'help',
  'implement',
  'install',
  'issues',
  'pickup',
  'promote-findings',
  'review',
  'session-end',
  'session-start',
  'setup',
  'ship',
  'teardown',
] as const;

type Command = (typeof COMMANDS)[number];

// Widened to ReadonlySet<string> so .has() accepts unknown input
// without a forbidden `as Command` cast in assertKnownCommand.
const COMMAND_SET: ReadonlySet<string> = new Set(COMMANDS);

function assertKnownCommand(command: string): asserts command is Command {
  if (!COMMAND_SET.has(command)) {
    throw new Error(
      `unknown command: ${command} (expected one of: ${COMMANDS.join(', ')})`,
    );
  }
}

const SCHEME_A_ENTRIES = [
  ['audit', 'dwa'],
  ['audit-barrage', 'dwab'],
  ['implement', 'dwi'],
  ['setup', 'dws'],
  ['ship', 'dwsh'],
  ['session-start', 'dwss'],
  ['session-end', 'dwse'],
  ['define', 'dwd'],
  ['doctor', 'dwdo'],
  ['customize', 'dwc'],
  ['complete', 'dwco'],
  ['extend', 'dwe'],
  ['help', 'dwh'],
  ['install', 'dwin'],
  ['issues', 'dwis'],
  ['pickup', 'dwp'],
  ['promote-findings', 'dwpf'],
  ['review', 'dwr'],
  ['teardown', 'dwt'],
] as const satisfies ReadonlyArray<readonly [Command, string]>;

const SCHEME_B_ENTRIES = [
  ['audit', 'dw-au'],
  ['audit-barrage', 'dw-ab'],
  ['implement', 'dw-im'],
  ['setup', 'dw-se'],
  ['define', 'dw-de'],
  ['ship', 'dw-sh'],
  ['session-start', 'dw-ss'],
  ['session-end', 'dw-en'],
  ['customize', 'dw-cu'],
  ['complete', 'dw-co'],
  ['doctor', 'dw-do'],
  ['extend', 'dw-ex'],
  ['help', 'dw-he'],
  ['install', 'dw-in'],
  ['issues', 'dw-is'],
  ['pickup', 'dw-pi'],
  ['promote-findings', 'dw-pf'],
  ['review', 'dw-re'],
  ['teardown', 'dw-te'],
] as const satisfies ReadonlyArray<readonly [Command, string]>;

function makeTableScheme(
  id: SchemeId,
  prefix: string,
  table: ReadonlyArray<readonly [Command, string]>,
): SchemeMapping {
  const lookup = new Map<Command, string>(table);
  return {
    id,
    prefix,
    shimFor(command: string): string {
      assertKnownCommand(command);
      const shim = lookup.get(command);
      if (shim === undefined) {
        throw new Error(
          `scheme ${id} has no shim for command: ${command}`,
        );
      }
      return shim;
    },
    entries(): ReadonlyArray<readonly [string, string]> {
      return table;
    },
  };
}

function makeAlgorithmicScheme(id: SchemeId): SchemeMapping {
  const ordered: ReadonlyArray<readonly [string, string]> = COMMANDS.map(
    (cmd) => [cmd, `dw-${cmd}`] as const,
  );
  return {
    id,
    prefix: 'dw-',
    shimFor(command: string): string {
      assertKnownCommand(command);
      return `dw-${command}`;
    },
    entries(): ReadonlyArray<readonly [string, string]> {
      return ordered;
    },
  };
}

export const SCHEMES: Readonly<Record<SchemeId, SchemeMapping>> = {
  A: makeTableScheme('A', 'dw', SCHEME_A_ENTRIES),
  B: makeTableScheme('B', 'dw-', SCHEME_B_ENTRIES),
  C: makeAlgorithmicScheme('C'),
} as const;

export function getScheme(id: SchemeId): SchemeMapping {
  return SCHEMES[id];
}
