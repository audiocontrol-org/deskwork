import { describe, it, expect, jest } from '@jest/globals';
import { getCLIVersion, checkVersionMatch } from '../opencode/version.js';

describe('version/version-sync', () => {
  it('should detect CLI version', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: '0.1.0\n',
      stderr: '',
      exitCode: 0,
    });

    const version = await getCLIVersion(mock$ as any);

    expect(version).toBe('0.1.0');
  });

  it('should report version mismatch', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: '0.2.0\n',
      stderr: '',
      exitCode: 0,
    });

    const match = await checkVersionMatch(mock$ as any);

    expect(match).toBe(false);
  });

  it('should handle version with extra whitespace', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: '  0.1.0  \n',
      stderr: '',
      exitCode: 0,
    });

    const version = await getCLIVersion(mock$ as any);

    expect(version).toBe('0.1.0');
  });

  it('should handle CLI version command failure', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: '',
      stderr: 'stackctl: command not found',
      exitCode: 1,
    });

    const version = await getCLIVersion(mock$ as any);

    expect(version).toBeNull();
  });
});
