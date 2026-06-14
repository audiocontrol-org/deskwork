import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyBinaryProbe, loadLaneCapabilities } from '../../govern/lane-capabilities.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  HERE,
  '..',
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
      const lanes = await loadLaneCapabilities(root, () => true);
      expect(lanes.map((lane) => lane.name)).toEqual(['claude', 'codex', 'sonnet']);
      expect(lanes.every((lane) => lane.availability === 'available')).toBe(true);
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

  it('fails loud when the installation has no fleet-knowledge file (no bundled-template fallback)', async () => {
    // A fresh checkout with no .stack-control/fleet-knowledge.yaml must NOT silently
    // substitute the repo-bundled template — governance would then admit fleets against
    // checked-in defaults instead of operator-owned capacity data (AUDIT-BARRAGE-codex-01).
    // setup seeds the file; runtime requires it.
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(
        /fleet-knowledge\.yaml.*not found|stackctl setup/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves fleet knowledge through the installation config path override', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      mkdirSync(join(root, 'governance', 'fleet'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'config.yaml'),
        ['version: 1', 'paths:', '  fleet_knowledge: governance/fleet/custom.yaml', ''].join('\n'),
        'utf8',
      );
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
          '',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(
        join(root, 'governance', 'fleet', 'custom.yaml'),
        'lanes:\n  - name: codex\n    max_prompt_bytes: 12345\n',
        'utf8',
      );

      const lanes = await loadLaneCapabilities(root, () => true);
      expect(lanes).toHaveLength(1);
      expect(lanes[0]?.envelope).toEqual({
        maxPromptBytes: 12345,
        source: 'fleet-knowledge',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when a custom lane set lacks a matching fleet-knowledge file', async () => {
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
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(
        /fleet-knowledge\.yaml not found|stackctl setup/,
      );
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
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(/max_prompt_bytes/);
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
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(/exactly match configured barrage lanes/);
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
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(/missing: codex-gpt5/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud when fleet knowledge uses a fractional byte limit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      writeFileSync(
        join(root, '.stack-control', 'fleet-knowledge.yaml'),
        ['lanes:', '  - name: codex', '    max_prompt_bytes: 65536.5', ''].join('\n'),
        'utf8',
      );
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(/positive integer/);
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
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(/duplicate fleet-knowledge lane 'codex'/);
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
      await expect(loadLaneCapabilities(root, () => true)).rejects.toThrow(/must be an object/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('classifies binary probe results: present, absent, and infra-failure', () => {
    // `which foo` exits 0 → present.
    expect(classifyBinaryProbe('codex', { status: 0, error: undefined })).toBe(true);
    // `which foo` exits nonzero with no spawn error → genuinely absent.
    expect(classifyBinaryProbe('codex', { status: 1, error: undefined })).toBe(false);
    // spawnSync itself failed (e.g. `which` not on PATH) → must NOT masquerade as
    // lane unavailability; surface the probe-infrastructure failure (AUDIT-BARRAGE-codex-02).
    expect(() =>
      classifyBinaryProbe('codex', { status: null, error: new Error('spawn which ENOENT') }),
    ).toThrow(/probe.*failed|which/i);
  });

  it('marks a configured lane unavailable when its binary probe fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lane-capabilities-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      cpSync(FIXTURE, join(root, '.stack-control', 'fleet-knowledge.yaml'));
      const lanes = await loadLaneCapabilities(root, (binary) => binary !== 'codex');
      expect(lanes.find((lane) => lane.name === 'codex')?.availability).toBe('unavailable');
      expect(lanes.find((lane) => lane.name === 'claude')?.availability).toBe('available');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
