// Types for opencode plugin API
export interface Plugin {
  name: string;
  version: string;
  skills: Skill[];
  onCommand?: (event: CommandEvent) => Promise<void>;
}

export interface Skill {
  name: string;
  command: string;
  description: string;
  handler: (args: string[]) => Promise<string>;
}

export interface CommandEvent {
  type: 'command.executed';
  command: string;
  context: {
    session_id: string;
    [key: string]: unknown;
  };
}

export interface ShellAPI {
  (command: string, options?: {
    cwd?: string;
    env?: Record<string, string>;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

export interface OpencodeAPI {
  $: ShellAPI;
  log: (message: string) => void;
  error: (message: string) => void;
}
