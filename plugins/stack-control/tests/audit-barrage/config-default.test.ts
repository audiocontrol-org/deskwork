/**
 * specs/029-govern-operability — Phase 1 / US1 (T001, RED).
 *
 * FR-001/002/004/005: the SHIPPED `templates/audit-barrage-config.yaml`
 * must carry the no-grounding Anthropic-lane configuration (so every fresh
 * install / adopter inherits the fast, reliable lane — not just this
 * project's local override):
 *   - the Anthropic lanes (binary `claude`) run WITHOUT `--permission-mode
 *     plan` (no file-grounding tool-loop),
 *   - they are read-only by construction via a non-empty `--disallowedTools`
 *     set (no Read/Grep/Write tools available),
 *   - their timeout floor is RAISED above the old 300s (headroom over the
 *     observed 167–233s no-grounding success durations),
 *   - the codex lane carries `model_reasoning_summary=detailed` (FR-003 —
 *     stderr reasoning pulses so the watchdog keeps a tight window),
 *   - the fleet COMPOSITION is unchanged: the opus+codex+sonnet 3-lane set
 *     (FR-005).
 *
 * Reads the real shipped template through the real loader (no fs mocking,
 * per .claude/rules/testing.md).
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG_PATH,
  parseConfig,
} from '../../src/scope-discovery/audit-barrage/config-loader.js';
import type { ModelConfig } from '../../src/scope-discovery/audit-barrage/types.js';

async function loadTemplate(): Promise<ReadonlyArray<ModelConfig>> {
  const body = await readFile(DEFAULT_CONFIG_PATH, 'utf8');
  return parseConfig(body, DEFAULT_CONFIG_PATH).models;
}

function byName(
  models: ReadonlyArray<ModelConfig>,
  name: string,
): ModelConfig {
  const found = models.find((m) => m.name === name);
  if (found === undefined) {
    throw new Error(`shipped template has no lane named '${name}'`);
  }
  return found;
}

describe('shipped audit-barrage template — no-grounding Anthropic lanes (US1)', () => {
  it('keeps the opus+codex+sonnet 3-lane composition unchanged (FR-005)', async () => {
    const models = await loadTemplate();
    const active = models.map((m) => m.name).sort();
    expect(active).toEqual(['claude', 'codex', 'sonnet']);
    expect(byName(models, 'claude').model).toBe('opus');
    expect(byName(models, 'sonnet').model).toBe('claude-sonnet-4-6');
  });

  it('runs the Anthropic lanes WITHOUT --permission-mode plan (no grounding loop, FR-001)', async () => {
    const models = await loadTemplate();
    for (const name of ['claude', 'sonnet']) {
      const lane = byName(models, name);
      expect(lane.binary).toBe('claude');
      expect(lane.argsTemplate).not.toContain('--permission-mode plan');
      expect(lane.readonlyEnforcement).not.toContain('--permission-mode plan');
    }
  });

  it('makes the Anthropic lanes read-only by construction via a non-empty --disallowedTools set (FR-001)', async () => {
    const models = await loadTemplate();
    for (const name of ['claude', 'sonnet']) {
      const lane = byName(models, name);
      expect(lane.readonlyEnforcement).toContain('--disallowedTools');
      // The denial list must actually deny the file-mutating + grounding tools.
      for (const tool of ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']) {
        expect(lane.readonlyEnforcement).toContain(tool);
      }
    }
  });

  it('raises the timeout floor above the old 300s for the no-grounding Anthropic lanes (FR-002)', async () => {
    const models = await loadTemplate();
    for (const name of ['claude', 'sonnet']) {
      const lane = byName(models, name);
      expect(lane.timeoutFloorSeconds).toBeGreaterThan(300);
    }
  });

  it('enables codex reasoning-summary liveness pulses (FR-003)', async () => {
    const models = await loadTemplate();
    const codex = byName(models, 'codex');
    expect(codex.argsTemplate).toContain('model_reasoning_summary');
    expect(codex.argsTemplate).toContain('detailed');
  });
});
