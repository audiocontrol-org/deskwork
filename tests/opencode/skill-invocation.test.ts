import { describe, it, expect, jest } from '@jest/globals';
import { handleCommandEvent } from '../opencode/events.js';
import { findSkill } from '../opencode/skills.js';

describe('events/skill-invocation', () => {
  it('should route skill invocation to handler', async () => {
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
      command: '/stack-control:define',
      context: { session_id: 'test-session' },
    };

    await handleCommandEvent(event as any, mockApi);

    expect(mock$).toHaveBeenCalled();
    expect(mockApi.log).toHaveBeenCalled();
  });

  it('should handle skill with arguments', async () => {
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
      command: '/stack-control:define --help',
      context: { session_id: 'test-session' },
    };

    await handleCommandEvent(event as any, mockApi);

    expect(mock$).toHaveBeenCalled();
  });

  it('should error on unknown skill', async () => {
    const mockApi = {
      $: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };

    const event = {
      type: 'command.executed',
      command: '/stack-control:unknown-skill',
      context: { session_id: 'test-session' },
    };

    await handleCommandEvent(event as any, mockApi);

    expect(mockApi.error).toHaveBeenCalled();
  });
});
