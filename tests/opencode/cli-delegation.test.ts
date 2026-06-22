import { describe, it, expect, jest } from '@jest/globals';
import { invokeCLI, formatCLIOutput } from '../opencode/cli.js';

describe('cli/cli-delegation', () => {
  it('should construct stackctl command correctly', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: 'success',
      stderr: '',
      exitCode: 0,
    });

    await invokeCLI('workflow', ['compass', 'design:feature/test'], mock$ as any);

    expect(mock$).toHaveBeenCalledWith('stackctl workflow compass design:feature/test');
  });

  it('should capture stdout and stderr', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: 'output line 1\noutput line 2',
      stderr: 'error line 1',
      exitCode: 1,
    });

    const result = await invokeCLI('version', [], mock$ as any);

    expect(result.stdout).toContain('output line');
    expect(result.stderr).toContain('error line');
  });

  it('should handle non-zero exit codes', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: '',
      stderr: 'stackctl: command not found',
      exitCode: 127,
    });

    const result = await invokeCLI('version', [], mock$ as any);

    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('stackctl');
  });
});
