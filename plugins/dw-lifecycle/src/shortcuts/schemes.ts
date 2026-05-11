export type SchemeId = 'A' | 'B' | 'C';

export const SCHEME_IDS: ReadonlyArray<SchemeId> = ['A', 'B', 'C'];

export function isSchemeId(value: unknown): value is SchemeId {
  return typeof value === 'string'
    && (SCHEME_IDS as ReadonlyArray<string>).includes(value);
}

export interface SchemeMapping {
  readonly id: SchemeId;
  shimFor(command: string): string;
  entries(): ReadonlyArray<readonly [string, string]>;
}

export const COMMANDS = [
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
  ['review', 'dwr'],
  ['teardown', 'dwt'],
] as const satisfies ReadonlyArray<readonly [Command, string]>;

const SCHEME_B_ENTRIES = [
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
  ['review', 'dw-re'],
  ['teardown', 'dw-te'],
] as const satisfies ReadonlyArray<readonly [Command, string]>;

function makeTableScheme(
  id: SchemeId,
  table: ReadonlyArray<readonly [Command, string]>,
): SchemeMapping {
  const lookup = new Map<Command, string>(table);
  return {
    id,
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
  A: makeTableScheme('A', SCHEME_A_ENTRIES),
  B: makeTableScheme('B', SCHEME_B_ENTRIES),
  C: makeAlgorithmicScheme('C'),
} as const;

export function getScheme(id: SchemeId): SchemeMapping {
  return SCHEMES[id];
}
