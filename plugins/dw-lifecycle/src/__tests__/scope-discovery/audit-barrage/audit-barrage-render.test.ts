/**
 * Tests for the audit-barrage-render subcommand — flag parsing +
 * vars payload validation. The full subcommand entry calls
 * `process.exit`; tests cover its pure-function pieces directly.
 */

import { describe, expect, it } from 'vitest';
import {
  parseRenderFlags,
  validateVarsPayload,
} from '../../../subcommands/audit-barrage-render.js';

describe('parseRenderFlags', () => {
  it('accepts --feature + --vars-file as the minimal valid invocation', () => {
    const result = parseRenderFlags([
      '--feature',
      'scope-discovery',
      '--vars-file',
      '/tmp/v.json',
    ]);
    expect(result.ok).toBe(true);
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.featureSlug).toBe('scope-discovery');
    expect(result.flags.varsFilePath).toBe('/tmp/v.json');
    expect(result.flags.outputPath).toBeUndefined();
  });

  it('accepts --output to direct rendered prompt to a file', () => {
    const result = parseRenderFlags([
      '--feature',
      'sample',
      '--vars-file',
      '/tmp/v.json',
      '--output',
      '/tmp/prompt.md',
    ]);
    expect(result.ok).toBe(true);
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.outputPath).toBe('/tmp/prompt.md');
  });

  it('emits help when --help is supplied', () => {
    const result = parseRenderFlags(['--help']);
    expect(result.ok).toBe(true);
    expect(result.help).toBe(true);
  });

  it('rejects missing --feature', () => {
    const result = parseRenderFlags(['--vars-file', '/tmp/v.json']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('--feature');
  });

  it('rejects missing --vars-file', () => {
    const result = parseRenderFlags(['--feature', 'sample']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('--vars-file');
  });

  it('rejects a flag whose value is missing', () => {
    const result = parseRenderFlags(['--feature']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('requires a value');
  });

  it('rejects unknown flags', () => {
    const result = parseRenderFlags([
      '--feature',
      'sample',
      '--vars-file',
      '/tmp/v.json',
      '--mystery',
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unknown flag');
  });
});

describe('validateVarsPayload', () => {
  it('accepts a flat string-keyed string-valued object', () => {
    const result = validateVarsPayload({
      feature_slug: 'sample',
      workplan_summary: 'plan',
      diff: 'D',
      audit_log_excerpt: 'A',
      commit_subjects: 'C',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.vars['feature_slug']).toBe('sample');
  });

  it('rejects a non-object payload (array)', () => {
    const result = validateVarsPayload(['x']);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('top-level value must be a JSON object');
  });

  it('rejects a non-object payload (null)', () => {
    const result = validateVarsPayload(null);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('top-level value must be a JSON object');
  });

  it('rejects a non-string value', () => {
    const result = validateVarsPayload({
      feature_slug: 'sample',
      diff: 42,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain("'diff'");
    expect(result.error).toContain('must be a string');
  });

  it('accepts the empty object (renderer will catch missing keys)', () => {
    const result = validateVarsPayload({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(Object.keys(result.vars).length).toBe(0);
  });
});
