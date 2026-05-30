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
  deriveBarrageExitCode,
  parseFlags,
  renderStdoutOutput,
  renderSummaryLine,
  resolveModels,
} from '../../../subcommands/audit-barrage.js';
import type {
  BarrageRun,
  ModelConfig,
  ModelRunResult,
} from '../../../scope-discovery/audit-barrage/types.js';

/**
 * Fixture battery mirroring the plugin's shipped default. The tests
 * here exercise the flag-parsing + filter resolution surface; the
 * config-loader's own tests cover loading the default from disk.
 */
const FIXTURE_MODELS: ReadonlyArray<ModelConfig> = [
  {
    name: 'claude',
    binary: 'claude',
    argsTemplate: '-p {{prompt}}',
    timeoutSeconds: 300,
  },
  {
    name: 'codex',
    binary: 'codex',
    argsTemplate: 'exec {{prompt}}',
    timeoutSeconds: 300,
  },
  {
    name: 'gemini',
    binary: 'gemini',
    argsTemplate: '{{prompt}}',
    timeoutSeconds: 300,
  },
];

describe('parseFlags', () => {
  it('accepts --feature + --prompt-file as the minimal valid invocation', () => {
    const result = parseFlags(['--feature', 'scope-discovery', '--prompt-file', '/tmp/p.txt']);
    expect(result.ok).toBe(true);
    expect(result.flags).toBeDefined();
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.featureSlug).toBe('scope-discovery');
    expect(result.flags.promptFilePath).toBe('/tmp/p.txt');
    // `modelNames === undefined` signals "no filter; run every configured model"
    expect(result.flags.modelNames).toBeUndefined();
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

  it('defaults outputRunDir to false', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
    ]);
    expect(result.ok).toBe(true);
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.outputRunDir).toBe(false);
  });

  it('honors --output-run-dir', () => {
    const result = parseFlags([
      '--feature',
      'sample',
      '--prompt-file',
      '/tmp/p.txt',
      '--output-run-dir',
    ]);
    expect(result.ok).toBe(true);
    if (result.flags === undefined) throw new Error('expected flags');
    expect(result.flags.outputRunDir).toBe(true);
  });
});

describe('renderStdoutOutput', () => {
  const fixtureRun: BarrageRun = {
    runId: '20260601T120000Z-demo',
    runDir: '/abs/path/.dw-lifecycle/scope-discovery/audit-runs/20260601T120000Z-demo',
    featureSlug: 'demo',
    startedAt: '2026-06-01T12:00:00Z',
    completedAt: '2026-06-01T12:01:00Z',
    results: [],
  };

  it('default mode: emits BarrageRun as pretty JSON terminated by newline', () => {
    const out = renderStdoutOutput(fixtureRun, false);
    expect(out.endsWith('\n')).toBe(true);
    const parsed: unknown = JSON.parse(out.trim());
    expect(parsed).toMatchObject({ runId: '20260601T120000Z-demo' });
  });

  it('--output-run-dir mode: emits ONLY the absolute run-dir path on stdout', () => {
    const out = renderStdoutOutput(fixtureRun, true);
    expect(out).toBe(
      '/abs/path/.dw-lifecycle/scope-discovery/audit-runs/20260601T120000Z-demo\n',
    );
  });

  it('--output-run-dir mode: stdout does NOT contain the full JSON payload', () => {
    const out = renderStdoutOutput(fixtureRun, true);
    expect(out).not.toMatch(/"results"/);
    expect(out).not.toMatch(/"featureSlug"/);
    expect(() => JSON.parse(out.trim())).toThrow();
  });

  it('--output-run-dir mode: still terminates with a single newline (clean for $() capture)', () => {
    const out = renderStdoutOutput(fixtureRun, true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.split('\n').filter((s) => s.length > 0).length).toBe(1);
  });
});

describe('resolveModels', () => {
  it('resolves the supplied battery by name', () => {
    const result = resolveModels(['claude', 'codex', 'gemini'], FIXTURE_MODELS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models.map((m) => m.name)).toEqual(['claude', 'codex', 'gemini']);
  });

  it('rejects unknown model names with an actionable error', () => {
    const result = resolveModels(['claude', 'made-up-model'], FIXTURE_MODELS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error).toContain('made-up-model');
    expect(result.error).toContain('claude');
  });

  it('preserves operator order when the operator overrides --models', () => {
    const result = resolveModels(['gemini', 'claude'], FIXTURE_MODELS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models.map((m) => m.name)).toEqual(['gemini', 'claude']);
  });

  it('returns the full available battery when modelNames is undefined', () => {
    const result = resolveModels(undefined, FIXTURE_MODELS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.models).toEqual(FIXTURE_MODELS);
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

  // AUDIT-20260529-03 — model with non-zero exit + positive stdout is
  // healthy. The captured stdout is the operator's audit material;
  // non-zero exit is metadata (rate-limit, lint-style nonzero-on-
  // findings). Exit-code computation aligns with PRD's "produced
  // output" wording, not the stricter pre-fix "exit 0 + bytes" check.
  it('treats a non-zero-exit model with positive stdout as healthy', () => {
    expect(
      deriveBarrageExitCode(
        makeRun([makeResult({ exitCode: 7, stdoutBytes: 1024 })]),
      ),
    ).toBe(0);
  });

  // AUDIT-20260529-03 — a timed-out model that managed to emit some
  // findings before SIGTERM is still triagable; capture is valuable.
  it('treats a timed-out model with positive stdout as healthy', () => {
    expect(
      deriveBarrageExitCode(
        makeRun([makeResult({ exitCode: -1, timedOut: true, stdoutBytes: 5 })]),
      ),
    ).toBe(0);
  });

  it('does not consider a zero-byte stdout healthy even on exit 0', () => {
    expect(
      deriveBarrageExitCode(makeRun([makeResult({ exitCode: 0, stdoutBytes: 0 })])),
    ).toBe(1);
  });

  // AUDIT-20260529-03 — a spawn failure is unhealthy regardless of
  // byte counts (no content could have been captured by definition;
  // any positive bytes there would indicate a different bug).
  it('treats a spawn error as unhealthy regardless of byte count', () => {
    expect(
      deriveBarrageExitCode(
        makeRun([
          makeResult({
            exitCode: -2,
            stdoutBytes: 0,
            spawnError: 'ENOENT: no such file or directory',
          }),
        ]),
      ),
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
