// RED-first: code-only audit lens omits the documentation-drift bullet.
// T014 writes the RED test (this file); T015 implements buildImplementVars'
// 5th parameter (codeOnly: boolean) to make the test pass.
//
// The test asserts:
//   - codeOnly === true → audit_lens omits "Documentation drift" bullet
//   - codeOnly === false → audit_lens includes "Documentation drift" bullet
//   - both variants retain other bullets (e.g. "Correctness bugs") to prove
//     the code-only variant is the full lens minus one bullet, not empty.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildImplementVars } from '../govern/govern-vars.js';
import { CODE_AUDIT_LENS } from '../govern/audit-constants.js';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'code-scope-lens-'));
}

describe('buildImplementVars — code-only audit lens (T014)', () => {
  it('code-only variant (codeOnly === true) omits the "Documentation drift" bullet', () => {
    const repo = tmpRepo();
    try {
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined, true);
      expect(built.vars.audit_lens).not.toContain('Documentation drift');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('original variant (codeOnly === false) includes the "Documentation drift" bullet', () => {
    const repo = tmpRepo();
    try {
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined, false);
      expect(built.vars.audit_lens).toContain('Documentation drift');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('code-only variant still contains other bullets (e.g. "Correctness bugs")', () => {
    const repo = tmpRepo();
    try {
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined, true);
      expect(built.vars.audit_lens).toContain('Correctness bugs');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('original variant contains all bullets from CODE_AUDIT_LENS', () => {
    const repo = tmpRepo();
    try {
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined, false);
      expect(built.vars.audit_lens).toBe(CODE_AUDIT_LENS);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
