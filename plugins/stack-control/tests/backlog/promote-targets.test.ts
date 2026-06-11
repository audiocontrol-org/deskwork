// T003 (RED-first, Foundational, 012) — target-ref parsing + shape-validation
// for `backlog promote --to <target-ref>` (contract tests 6, 11). Three typed
// kinds: spec / tasks / roadmap. Shape-validated only (no disk check —
// record-don't-create, D4); a malformed/unknown/empty kind is a usage error the
// verb maps to exit 2.

import { describe, it, expect } from 'vitest';
import { parseTarget, allowsBatch, TargetRefError } from '../../src/backlog/promote-targets.js';

describe('promote target-ref parsing — well-formed (T003, contract 11)', () => {
  it('parses a spec: ref into kind=spec with the spec-dir path', () => {
    const t = parseTarget('spec:specs/012-backlog-promotion-seam');
    expect(t.kind).toBe('spec');
    expect(t.ref).toBe('spec:specs/012-backlog-promotion-seam');
    expect(t.path).toBe('specs/012-backlog-promotion-seam');
  });

  it('parses a tasks: ref into kind=tasks with the spec-dir path', () => {
    const t = parseTarget('tasks:specs/008-backlog-surface');
    expect(t.kind).toBe('tasks');
    expect(t.path).toBe('specs/008-backlog-surface');
  });

  it('parses a roadmap: ref into kind=roadmap with no filesystem path', () => {
    const t = parseTarget('roadmap:impl:feature/execution-engine');
    expect(t.kind).toBe('roadmap');
    expect(t.ref).toBe('roadmap:impl:feature/execution-engine');
    expect(t.path).toBeUndefined();
  });
});

describe('promote target-ref parsing — malformed → TargetRefError (T003, contract 6)', () => {
  it('rejects an unknown kind prefix', () => {
    expect(() => parseTarget('issue:gh-12')).toThrow(TargetRefError);
  });

  it('rejects a bare ref with no kind prefix', () => {
    expect(() => parseTarget('specs/012-backlog-promotion-seam')).toThrow(TargetRefError);
  });

  it('rejects an empty ref', () => {
    expect(() => parseTarget('')).toThrow(TargetRefError);
  });

  it('rejects a kind prefix with an empty body', () => {
    expect(() => parseTarget('spec:')).toThrow(TargetRefError);
  });

  it('rejects a spec/tasks ref whose path is not a specs/NNN-slug dir', () => {
    expect(() => parseTarget('spec:not-a-specs-path')).toThrow(TargetRefError);
  });
});

describe('promote batch eligibility by kind (T003, D5)', () => {
  it('only a tasks: target permits a multi-item batch', () => {
    expect(allowsBatch('tasks')).toBe(true);
    expect(allowsBatch('spec')).toBe(false);
    expect(allowsBatch('roadmap')).toBe(false);
  });
});
