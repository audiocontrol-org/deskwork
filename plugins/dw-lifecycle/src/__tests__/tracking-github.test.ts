import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParentIssue, createPhaseIssues } from '../tracking-github.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';

describe('tracking-github', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  it('createParentIssue invokes gh with title + body', () => {
    vi.mocked(execFileSync).mockReturnValueOnce(
      Buffer.from('https://github.com/owner/repo/issues/42\n')
    );
    const result = createParentIssue({
      repo: 'owner/repo',
      title: 'Parent',
      body: 'Body',
      labels: ['enhancement'],
    });

    const call = vi.mocked(execFileSync).mock.calls[0];
    if (!call) throw new Error('expected execFileSync to be called');
    expect(call[0]).toBe('gh');
    const argsArray = call[1];
    if (!Array.isArray(argsArray)) throw new Error('expected args array');
    expect(argsArray).toContain('issue');
    expect(argsArray).toContain('create');
    expect(argsArray).toContain('--repo');
    expect(argsArray).toContain('owner/repo');
    expect(argsArray).toContain('--title');
    expect(argsArray).toContain('Parent');
    expect(argsArray).toContain('--body');
    expect(argsArray).toContain('Body');
    expect(argsArray).toContain('--label');
    expect(argsArray).toContain('enhancement');

    expect(result.url).toBe('https://github.com/owner/repo/issues/42');
    expect(result.number).toBe(42);
  });

  it('createPhaseIssues creates one issue per phase with parent reference', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(Buffer.from('https://github.com/owner/repo/issues/43\n'))
      .mockReturnValueOnce(Buffer.from('https://github.com/owner/repo/issues/44\n'));

    const results = createPhaseIssues({
      repo: 'owner/repo',
      parentNumber: 42,
      phases: [
        { name: 'Phase 1', body: 'P1' },
        { name: 'Phase 2', body: 'P2' },
      ],
      labels: ['enhancement'],
    });

    expect(results).toHaveLength(2);
    const first = results[0];
    const second = results[1];
    if (!first || !second) throw new Error('expected two results');
    expect(first.number).toBe(43);
    expect(second.number).toBe(44);

    const firstCall = vi.mocked(execFileSync).mock.calls[0];
    if (!firstCall) throw new Error('expected execFileSync to be called');
    const argsArray = firstCall[1];
    if (!Array.isArray(argsArray)) throw new Error('expected args array');
    const titleIdx = argsArray.indexOf('--title');
    const bodyIdx = argsArray.indexOf('--body');
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(argsArray[titleIdx + 1]).toBe('Phase 1');
    const bodyValue = argsArray[bodyIdx + 1];
    if (typeof bodyValue !== 'string') throw new Error('expected body string');
    expect(bodyValue).toContain('#42');
  });
});
