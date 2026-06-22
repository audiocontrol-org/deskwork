import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createPlugin } from '../opencode/plugin.js';
import type { OpencodeAPI } from '../types/opencode.js';

describe('plugin', () => {
  let mockApi: OpencodeAPI;

  beforeEach(() => {
    mockApi = {
      $: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };
  });

  it('should create plugin with skills', () => {
    const plugin = createPlugin(mockApi);
    expect(plugin).toBeDefined();
    expect(plugin.skills).toBeDefined();
  });

  it('should have initialize method', () => {
    const plugin = createPlugin(mockApi);
    expect(plugin.initialize).toBeInstanceOf(Function);
  });

  it('should have handleCommand method', () => {
    const plugin = createPlugin(mockApi);
    expect(plugin.handleCommand).toBeInstanceOf(Function);
  });
});
