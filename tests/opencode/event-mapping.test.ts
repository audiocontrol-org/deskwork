import { describe, it, expect, jest } from '@jest/globals';
import { handleCommandEvent } from '../opencode/events.js';

describe('events/event-mapping', () => {
  it('should route command.executed events', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: 'success',
      stderr: '',
      exitCode: 0,
    });

    const mockApi = {
      $: mock$,
      log: jest.fn(),
      error: jest.fn(),
    };

    const event = {
      type: 'command.executed',
      command: '/stack-control:roadmap status',
      context: { session_id: 'test-session' },
    };

    await handleCommandEvent(event as any, mockApi);

    expect(mock$).toHaveBeenCalled();
    expect(mockApi.log).toHaveBeenCalled();
  });

  it('should filter non-stack-control commands', async () => {
    const mock$ = jest.fn();
    const mockApi = {
      $: mock$,
      log: jest.fn(),
      error: jest.fn(),
    };

    const event = {
      type: 'command.executed',
      command: '/other-command',
      context: { session_id: 'test-session' },
    };

    await handleCommandEvent(event as any, mockApi);

    expect(mock$).not.toHaveBeenCalled();
    expect(mockApi.log).not.toHaveBeenCalled();
  });

  it('should handle multiple stack-control commands', async () => {
    const mock$ = jest.fn().mockResolvedValue({
      stdout: 'success',
      stderr: '',
      exitCode: 0,
    });

    const mockApi = {
      $: mock$,
      log: jest.fn(),
      error: jest.fn(),
    };

    const commands = [
      '/stack-control:define',
      '/stack-control:extend',
      '/stack-control:execute',
    ];

    for (const command of commands) {
      const event = {
        type: 'command.executed',
        command,
        context: { session_id: 'test-session' },
      };

      await handleCommandEvent(event as any, mockApi);
      expect(mock$).toHaveBeenCalled();
    }
  });
});
