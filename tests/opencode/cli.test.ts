import { describe, it, expect, jest } from '@jest/globals';
import { invokeCLI, formatCLIOutput } from '../opencode/cli.js';

describe('cli', () => {
  describe('invokeCLI', () => {
    it('should invoke stackctl CLI with command and args', async () => {
      const mock$ = jest.fn().mockResolvedValue({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
      });

      const result = await invokeCLI('version', [], mock$ as any);

      expect(mock$).toHaveBeenCalledWith('stackctl version');
      expect(result).toEqual({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
      });
    });

    it('should handle CLI errors', async () => {
      const mock$ = jest.fn().mockResolvedValue({
        stdout: '',
        stderr: 'command not found',
        exitCode: 1,
      });

      const result = await invokeCLI('version', [], mock$ as any);

      expect(result.exitCode).toBe(1);
    });
  });

  describe('formatCLIOutput', () => {
    it('should return stdout for successful commands', () => {
      const result = formatCLIOutput({
        stdout: 'version 1.0.0',
        stderr: '',
        exitCode: 0,
      });

      expect(result).toBe('version 1.0.0');
    });

    it('should handle error output', () => {
      const result = formatCLIOutput({
        stdout: '',
        stderr: 'error message',
        exitCode: 1,
      });

      expect(result).toContain('error message');
    });
  });
});
