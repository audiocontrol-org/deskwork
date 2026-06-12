import { describe, expect, it } from 'vitest';
import { BacklogError, createBacklogBackend } from '../backlog/backend.js';
import { tmpBacklog } from '../../tests/backlog/helpers.js';

describe('backlog portability runtime contract', () => {
  it('translates missing backend execution into stack-control backlog terms', () => {
    const backend = createBacklogBackend({
      cwd: tmpBacklog(),
      binaryPath: '/nonexistent/path/to/backlog',
    });
    expect(() => backend.create({ title: 'x', labels: ['agent-found', 'type:bug'] })).toThrowError(
      BacklogError,
    );
    try {
      backend.create({ title: 'x', labels: ['agent-found', 'type:bug'] });
    } catch (err) {
      const text = String(err);
      expect(text).toMatch(/backlog backend/i);
      expect(text).not.toMatch(/backlog\.md/);
    }
  });
});
