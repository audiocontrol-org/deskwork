import type { ShellAPI } from '../../types/opencode.js';
import type { CLIResult } from '../../types/cli.js';

const CLI_NAME = 'stackctl';

export async function invokeCLI(
  command: string,
  args: string[],
  $: ShellAPI
): Promise<CLIResult> {
  const fullCommand = `${CLI_NAME} ${command} ${args.join(' ')}`;
  
  try {
    const result = await $(fullCommand);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

export async function checkCLIAvailable($: ShellAPI): Promise<boolean> {
  const result = await invokeCLI('--version', [], $);
  return result.exitCode === 0;
}

export function formatCLIError(result: CLIResult): string {
  if (result.exitCode !== 0) {
    if (result.stderr.includes('command not found') || result.stderr.includes('stackctl')) {
      return 'Error: stackctl CLI not found. Please install it with: npm install -g @stack-control/cli';
    }
    return `Error: stackctl command failed with exit code ${result.exitCode}\n${result.stderr}`;
  }
  return result.stdout;
}

export function formatCLIOutput(result: CLIResult): string {
  if (result.exitCode === 0) {
    return result.stdout.trim();
  }
  return formatCLIError(result);
}
