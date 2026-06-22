import { describe, it, expect, jest } from '@jest/globals';
import { handleCommandEvent } from '../opencode/events.js';
import { parseSkillCommand } from '../opencode/skills.js';

describe('events', () => {
  describe('handleCommandEvent', () => {
    it('should ignore non-stack-control commands', async () => {
      const mockApi = {
        $: jest.fn(),
        log: jest.fn(),
        error: jest.fn(),
      };

      const event = {
        type: 'command.executed',
        command: '/some-other-command',
        context: { session_id: 'test-session' },
      };

      await handleCommandEvent(event as any, mockApi);

      expect(mockApi.log).not.toHaveBeenCalled();
      expect(mockApi.error).not.toHaveBeenCalled();
    });

    it('should parse stack-control commands', () => {
      const result = parseSkillCommand('/stack-control:define arg1 arg2');
      expect(result).toEqual({
        skill: 'define',
        args: ['arg1', 'arg2'],
      });
    });

    it('should return null for invalid commands', () => {
      const result = parseSkillCommand('/other-command:define');
      expect(result).toBeNull();
    });
  });
});
