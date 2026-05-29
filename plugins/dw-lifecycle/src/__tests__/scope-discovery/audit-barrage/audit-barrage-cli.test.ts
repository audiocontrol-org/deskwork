/**
 * Tests for the audit-barrage subcommand shim — flag parsing,
 * model resolution, exit-code derivation, summary rendering.
 *
 * The full subcommand entry (`auditBarrage`) calls `process.exit`;
 * tests cover its pure-function pieces directly rather than spawning
 * the verb itself.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_CONFIGS,
  deriveBarrageExitCode,
  parseFlags,
  renderSummaryLine,
  resolveModels,
} from '../../../subcommands/audit-barrage.js';
import type {
  BarrageRun,
  ModelRunResult,
} from '../../../scope-discovery/audit-barrage/types.js';

describe('parseFlags', () => {
  it('accepts --feature + --prompt-file as the minimal valid invocation', () => {
    const result = parseFlags(['--feature', 'scope-discovery', '--prompt-file', '/tmp/p.txt']);
    expect(result.ok).toBe(true);
    expect(result.flags).toBeDefined();
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.featureSlug).toBe('scope-discovery');
    expect(result.flags.promptFilePath).toBe('/tmp/p.txt');
    expect(result.flags.modelNames).toEqual(['claude', 'codex', 'gemini']);
    expect(result.flags.quiet).toBe(false);
  });

  it('emits help when --help is supplied', () => {
    const result = parseFlags(['--help']);
    expect(result.ok).toBe(true);
    expect(result.help).toBe(true);
  });

  it('rejects missing --feature', () => {
    const result = parseFlags(['--prompt-file', '/tmp/p.txt']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('--feature');
  });

  it('rejects missing --prompt-file', () => {
    const result = parseFlags(['--feature', 'sample']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('--prompt-file');
  });

  it('rejects --prompt-file and --prompt supplied together', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
      '--prompt',
      'inline body',
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('mutually exclusive');
  });

  it('rejects unknown flags', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
      '--mystery',
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unknown flag');
  });

  it('rejects a flag whose value is missing', () => {
    const result = parseFlags(['--feature']);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('requires a value');
  });

  it('parses comma-separated --models', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
      '--models',
      'claude,codex',
    ]);
    expect(result.ok).toBe(true);
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.modelNames).toEqual(['claude', 'codex']);
  });

  it('rejects a --models list that resolves to zero entries', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
      '--models',
      ', , ',
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('zero entries');
  });

  it('honors --quiet', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
      '--quiet',
    ]);
    expect(result.ok).toBe(true);
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.quiet).toBe(true);
  });
});

describe('resolveModels', () => {
  it('resolves the default battery by name', () => {
    const result = resolveModels(['claude', 'codex', 'gemini']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models.map((m) => m.name)).toEqual(['claude', 'codex', 'gemini']);
  });

  it('rejects unknown model names with an actionable error', () => {
    const result = resolveModels(['claude', 'made-up-model']);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('made-up-model');
    expect(result.error).toContain('claude');
  });

  it('preserves operator order when the operator overrides --models', () => {
    const result = resolveModels(['gemini', 'claude']);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models.map((m) => m.name)).toEqual(['gemini', 'claude']);
  });
});

describe('DEFAULT_MODEL_CONFIGS', () => {
  it('contains the three v1 entries with the documented args templates', () => {
    expect(DEFAULT_MODEL_CONFIGS.length).toBe(3);
    const claude = DEFAULT_MODEL_CONFIGS.find((m) => m.name === 'claude');
    const codex = DEFAULT_MODEL_CONFIGS.find((m) => m.name === 'codex');
    const gemini = DEFAULT_MODEL_CONFIGS.find((m) => m.name === 'gemini');
    expect(claude?.argsTemplate).toBe('-p {{prompt}}');
    expect(codex?.argsTemplate).toBe('exec {{prompt}}');
    expect(gemini?.argsTemplate).toBe('{{prompt}}');
    for (const m of DEFAULT_MODEL_CONFIGS) {
      expect(m.timeoutSeconds).toBeGreaterThan(0);
    }
  });
});

describe('deriveBarrageExitCode', () => {
  function makeRun(results: ReadonlyArray<ModelRunResult>): BarrageRun {
    return {
      runDir: '/tmp/x',
      timestamp: '20260528T120000Z',
      featureSlug: 'sample',
      promptPath: '/tmp/x/PROMPT.md',
      indexPath: '/tmp/x/INDEX.md',
      results,
    };
  }

  function makeResult(overrides: Partial<ModelRunResult>): ModelRunResult {
    return {
      name: 'sample',
      exitCode: 0,
      durationMs: 1,
      stdoutBytes: 1,
      stderrBytes: 0,
      stdoutPath: '/tmp/x/sample.md',
      stderrPath: '/tmp/x/stderr/sample.txt',
      timedOut: false,
      ...overrides,
    };
  }

  it('returns 0 when at least one model produced positive-byte stdout + exit 0', () => {
    expect(deriveBarrageExitCode(makeRun([makeResult({})]))).toBe(0);
  });

  it('returns 1 when every model failed', () => {
    expect(
      deriveBarrageExitCode(
        makeRun([
          makeResult({ exitCode: 1, stdoutBytes: 0 }),
          makeResult({ exitCode: -2, stdoutBytes: 0, spawnError: 'ENOENT' }),
        ]),
      ),
    ).toBe(1);
  });

  it('does not consider a timed-out model healthy', () => {
    expect(
      deriveBarrageExitCode(
        makeRun([makeResult({ exitCode: -1, timedOut: true, stdoutBytes: 5 })]),
      ),
    ).toBe(1);
  });

  it('does not consider a zero-byte stdout healthy even on exit 0', () => {
    expect(
      deriveBarrageExitCode(makeRun([makeResult({ exitCode: 0, stdoutBytes: 0 })])),
    ).toBe(1);
  });
});

describe('renderSummaryLine', () => {
  it('reports healthy / total counts and the run dir', () => {
    const line = renderSummaryLine({
      runDir: '/tmp/run-dir',
      timestamp: '20260528T120000Z',
      featureSlug: 'sample',
      promptPath: '/tmp/run-dir/PROMPT.md',
      indexPath: '/tmp/run-dir/INDEX.md',
      results: [
        {
          name: 'a',
          exitCode: 0,
          durationMs: 1,
          stdoutBytes: 5,
          stderrBytes: 0,
          stdoutPath: '/tmp/run-dir/a.md',
          stderrPath: '/tmp/run-dir/stderr/a.txt',
          timedOut: false,
        },
        {
          name: 'b',
          exitCode: -2,
          durationMs: 1,
          stdoutBytes: 0,
          stderrBytes: 0,
          stdoutPath: '/tmp/run-dir/b.md',
          stderrPath: '/tmp/run-dir/stderr/b.txt',
          timedOut: false,
          spawnError: 'ENOENT',
        },
      ],
    });
    expect(line).toContain('1/2');
    expect(line).toContain('/tmp/run-dir');
  });
});
