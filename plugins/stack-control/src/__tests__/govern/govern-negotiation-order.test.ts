import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTsx, CLI } from '../_run-helpers.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';

function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'gov-negotiate-'));
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  writeFileSync(
    join(repo, '.stack-control', 'audit-barrage-config.yaml'),
    [
      'models:',
      '  - name: codex',
      '    binary: codex',
      '    model: gpt-5.5',
      '    args_template: "exec -m {{model}} --sandbox read-only {{prompt-stdin}}"',
      '    output_mode: text',
      '    readonly_enforcement: none',
      '    liveness_signal: none',
      '    timeout_floor_seconds: 300',
      '    timeout_secs_per_kb: 7',
      '',
    ].join('\n'),
    'utf8',
  );
  const featureRoot = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'feat');
  mkdirSync(featureRoot, { recursive: true });
  writeFileSync(join(featureRoot, 'audit-log.md'), '# Audit Log — feat\n', 'utf8');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const A = 1;\n', 'utf8');
  spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
  return repo;
}

describe('govern fleet negotiation preflight (US3)', () => {
  it('fails before implement payload assembly when no viable fleet exists', () => {
    const repo = makeRepo();
    try {
      const r = spawnSync(
        resolveTsx(),
        [
          CLI,
          'govern',
          '--mode',
          'implement',
          '--feature',
          'feat',
          '--at',
          repo,
          '--diff-base',
          'definitely-not-a-ref',
          '--require-models',
          '1',
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, STACKCTL_BACKLOG_DIR: tmpBacklog() },
        },
      );
      expect(r.status).toBe(2);
      expect(`${r.stdout}${r.stderr}`).toMatch(/fleet negotiation failed before payload assembly/);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/empty diff|audit-barrage-render|diff-base/i);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
