export type SchemeId = 'A' | 'B' | 'C';

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

const COMMAND_SET: ReadonlySet<string> = new Set(COMMANDS);

function assertKnownCommand(command: string): asserts command is Command {
  if (!COMMAND_SET.has(command)) {
    throw new Error(
      `unknown command: ${command} (expected one of: ${COMMANDS.join(', ')})`,
    );
  }
}

const SCHEME_A_MAP: Readonly<Record<Command, string>> = {
  implement: 'dwi',
  setup: 'dws',
  ship: 'dwsh',
  'session-start': 'dwss',
  'session-end': 'dwse',
  define: 'dwd',
  doctor: 'dwdo',
  customize: 'dwc',
  complete: 'dwco',
  extend: 'dwe',
  help: 'dwh',
  install: 'dwin',
  issues: 'dwis',
  pickup: 'dwp',
  review: 'dwr',
  teardown: 'dwt',
} as const;

const SCHEME_B_MAP: Readonly<Record<Command, string>> = {
  implement: 'dw-im',
  setup: 'dw-se',
  define: 'dw-de',
  ship: 'dw-sh',
  'session-start': 'dw-ss',
  'session-end': 'dw-en',
  customize: 'dw-cu',
  complete: 'dw-co',
  doctor: 'dw-do',
  extend: 'dw-ex',
  help: 'dw-he',
  install: 'dw-in',
  issues: 'dw-is',
  pickup: 'dw-pi',
  review: 'dw-re',
  teardown: 'dw-te',
} as const;

function makeTableScheme(
  id: SchemeId,
  table: Readonly<Record<Command, string>>,
  order: ReadonlyArray<Command>,
): SchemeMapping {
  const ordered: ReadonlyArray<readonly [string, string]> = order.map(
    (cmd) => [cmd, table[cmd]] as const,
  );
  return {
    id,
    shimFor(command: string): string {
      assertKnownCommand(command);
      return table[command];
    },
    entries(): ReadonlyArray<readonly [string, string]> {
      return ordered;
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

const SCHEME_A_ORDER: ReadonlyArray<Command> = [
  'implement',
  'setup',
  'ship',
  'session-start',
  'session-end',
  'define',
  'doctor',
  'customize',
  'complete',
  'extend',
  'help',
  'install',
  'issues',
  'pickup',
  'review',
  'teardown',
];

const SCHEME_B_ORDER: ReadonlyArray<Command> = [
  'implement',
  'setup',
  'define',
  'ship',
  'session-start',
  'session-end',
  'customize',
  'complete',
  'doctor',
  'extend',
  'help',
  'install',
  'issues',
  'pickup',
  'review',
  'teardown',
];

export const SCHEMES: Readonly<Record<SchemeId, SchemeMapping>> = {
  A: makeTableScheme('A', SCHEME_A_MAP, SCHEME_A_ORDER),
  B: makeTableScheme('B', SCHEME_B_MAP, SCHEME_B_ORDER),
  C: makeAlgorithmicScheme('C'),
} as const;

export function getScheme(id: SchemeId): SchemeMapping {
  return SCHEMES[id];
}
