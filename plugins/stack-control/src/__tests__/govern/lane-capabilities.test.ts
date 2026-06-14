import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLaneCapabilities } from '../../govern/lane-capabilities.js';

const FIXTURE = join(
  process.cwd(),
  'src',
  '__tests__',
  'fixtures',
  'govern',
  '021-fleet',
  'fleet-knowledge.yaml',
);

describe('loadLaneCapabilities', () => {
  it('normalizes the barrage config into lane capability profiles and honors fleet knowledge envelopes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      cpSync(FIXTURE, join(root, '.stack-control', 'fleet-knowledge.yaml'));
      const lanes = await loadLaneCapabilities(root);
      expect(lanes.map((lane) => lane.name)).toEqual(['claude', 'codex', 'sonnet']);
      expect(lanes[0]?.enforcement).toBe('enforced');
      expect(lanes[1]?.liveness).toBe('monitored');
      expect(lanes[0]?.envelope).toEqual({
        maxPromptBytes: 65536,
        source: 'fleet-knowledge',
      });
      expect(lanes[1]?.timeoutBasis.mode).toBe('derived');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to a deterministic derived envelope when no fleet-knowledge file is present', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      const lanes = await loadLaneCapabilities(root);
      expect(lanes[0]?.envelope.source).toBe('derived-from-timeout-slope');
      expect(lanes[0]?.envelope.maxPromptBytes).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when a timeout_seconds lane lacks fleet knowledge', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'audit-barrage-config.yaml'),
        [
          'models:',
          '  - name: codex',
          '    binary: codex',
          '    model: gpt-5.5',
          '    args_template: "exec -m {{model}} --sandbox read-only {{prompt-stdin}}"',
          '    readonly_enforcement: "--sandbox read-only"',
          '    output_mode: text',
          '    liveness_signal: stderr',
          '    liveness_window_seconds: 60',
          '    timeout_seconds: 600',
          '',
        ].join('\n'),
        'utf8',
      );
      await expect(loadLaneCapabilities(root)).rejects.toThrow(/fleet-knowledge\.yaml max_prompt_bytes/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud on malformed fleet knowledge', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'fleet-knowledge.yaml'),
        'lanes:\n  - name: broken\n    max_prompt_bytes: nope\n',
        'utf8',
      );
      await expect(loadLaneCapabilities(root)).rejects.toThrow(/max_prompt_bytes/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when fleet knowledge includes an unknown lane name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'audit-barrage-config.yaml'),
        [
          'models:',
          '  - name: codex',
          '    binary: codex',
          '    model: gpt-5.5',
          '    args_template: "exec -m {{model}} --sandbox read-only {{prompt-stdin}}"',
          '    readonly_enforcement: "--sandbox read-only"',
          '    output_mode: text',
          '    liveness_signal: stderr',
          '    liveness_window_seconds: 60',
          '    timeout_floor_seconds: 300',
          '    timeout_secs_per_kb: 7',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(root, '.stack-control', 'fleet-knowledge.yaml'),
        'lanes:\n  - name: typo-codex\n    max_prompt_bytes: 65536\n',
        'utf8',
      );
      await expect(loadLaneCapabilities(root)).rejects.toThrow(/exactly match configured barrage lanes/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when fleet knowledge omits a configured lane', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'audit-barrage-config.yaml'),
        [
          'models:',
          '  - name: codex',
          '    binary: codex',
          '    model: gpt-5.5',
          '    args_template: "exec -m {{model}} --sandbox read-only {{prompt-stdin}}"',
          '    readonly_enforcement: "--sandbox read-only"',
          '    output_mode: text',
          '    liveness_signal: stderr',
          '    liveness_window_seconds: 60',
          '    timeout_floor_seconds: 300',
          '    timeout_secs_per_kb: 10',
          '  - name: codex-gpt5',
          '    binary: codex',
          '    model: gpt-5.4',
          '    args_template: "exec -m {{model}} --sandbox read-only {{prompt-stdin}}"',
          '    readonly_enforcement: "--sandbox read-only"',
          '    output_mode: text',
          '    liveness_signal: stderr',
          '    liveness_window_seconds: 60',
          '    timeout_floor_seconds: 300',
          '    timeout_secs_per_kb: 12',
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(root, '.stack-control', 'fleet-knowledge.yaml'),
        'lanes:\n  - name: codex\n    max_prompt_bytes: 65536\n',
        'utf8',
      );
      await expect(loadLaneCapabilities(root)).rejects.toThrow(/missing: codex-gpt5/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud on duplicate fleet knowledge lane names', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'fleet-knowledge.yaml'),
        ['lanes:', '  - name: codex', '    max_prompt_bytes: 65536', '  - name: codex', '    max_prompt_bytes: 70000', ''].join('\n'),
        'utf8',
      );
      await expect(loadLaneCapabilities(root)).rejects.toThrow(/duplicate fleet-knowledge lane 'codex'/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when a fleet knowledge lane entry is not an object', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'fleet-knowledge.yaml'),
        'lanes:\n  - null\n',
        'utf8',
      );
      await expect(loadLaneCapabilities(root)).rejects.toThrow(/must be an object/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
