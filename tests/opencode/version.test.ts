import { describe, it, expect, jest } from '@jest/globals';
import { getPluginVersion, getCLIVersion, checkVersionMatch } from '../opencode/version.js';

describe('version', () => {
  describe('getPluginVersion', () => {
    it('should return plugin version', async () => {
      const version = await getPluginVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
    });
  });

  describe('getCLIVersion', () => {
    it('should return CLI version when available', async () => {
      const mock$ = jest.fn().mockResolvedValue({
        stdout: '0.1.0\n',
        stderr: '',
        exitCode: 0,
      });

      const version = await getCLIVersion(mock$ as any);
      expect(version).toBe('0.1.0');
    });

    it('should return null when CLI not available', async () => {
      const mock$ = jest.fn().mockResolvedValue({
        stdout: '',
        stderr: 'command not found',
        exitCode: 1,
      });

      const version = await getCLIVersion(mock$ as any);
      expect(version).toBeNull();
    });
  });

  describe('checkVersionMatch', () => {
    it('should return false when versions mismatch', async () => {
      const mock$ = jest.fn().mockResolvedValue({
        stdout: '0.2.0\n',
        stderr: '',
        exitCode: 0,
      });

      const match = await checkVersionMatch(mock$ as any);
      expect(match).toBe(false);
    });

    it('should return false when CLI version unknown', async () => {
      const mock$ = jest.fn().mockResolvedValue({
        stdout: '',
        stderr: 'command not found',
        exitCode: 1,
      });

      const match = await checkVersionMatch(mock$ as any);
      expect(match).toBe(false);
    });
  });
});
