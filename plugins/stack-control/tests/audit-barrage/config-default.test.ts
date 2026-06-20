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
 *
 * Verified-CLI-contract note (AUDIT-BARRAGE-claude-02 refutation +
 * claude-04 boundary): the two load-bearing argv shapes here are confirmed
 * against the CLIs' own `--help`, not assumed:
 *   - `claude --help`: `--disallowedTools <tools...>` is "Comma OR space-
 *     separated list of tool names to deny" — so the comma-joined single
 *     token is a valid value (claude-02 is a false alarm).
 *   - `codex --help`: `-c <key=value>` value "is parsed as TOML; if it fails
 *     to parse as TOML, the raw string is used as a literal" — so bare
 *     `model_reasoning_summary=detailed` lands as the string `detailed`.
 * These are SHAPE assertions. The emergent runtime behavior (tools actually
 * unavailable; codex actually pulsing on stderr) is verified out-of-band —
 * the live per-phase barrage (both lanes `completed [enforced]` on the real
 * payload) and the hostile `scripts/probe-readonly-spawn.sh` write-probe —
 * NOT by spawning a real model subprocess in a unit test (.claude/rules/
 * testing.md: do not test Claude Code internals / non-deterministic model
 * responses).
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
      // EVERY repo-mutating Claude Code tool must be denied (Write/Edit/
      // NotebookEdit) plus the grounding tools (Read/Grep/Glob/Bash/Task/web)
      // so there is no tool-loop.
      for (const tool of [
        'Write',
        'Edit',
        'NotebookEdit',
        'Read',
        'Grep',
        'Glob',
        'Bash',
        'Task',
      ]) {
        expect(lane.readonlyEnforcement).toContain(tool);
      }
      // Regression lock (empirical, opus calibration 2026-06-20): `MultiEdit`
      // and `NotebookRead` are NOT known tools in this Claude Code version —
      // `claude -p` warns "Permission deny rule '<name>' matches no known
      // tool". codex-01 (HIGH) asked to add MultiEdit; the deny rule would be
      // an inert no-op that pollutes stderr (and the real mutating tools were
      // already denied). Keep stale/unknown tool names OUT of the deny-list.
      for (const stale of ['MultiEdit', 'NotebookRead']) {
        expect(lane.readonlyEnforcement).not.toContain(stale);
      }
    }
  });

  it('keeps the no-grounding Anthropic lanes monitored on a WIDE window, not a tight 60s one (FR-002, US1 reliability)', async () => {
    // Removing grounding removed the lanes' incidental stdout tool-call pulses;
    // the no-grounding single pass emits only bursty `thinking_tokens` whose
    // gaps exceed 60s and FALSE-killed a healthy lane mid-govern. The lane must
    // stay MONITORED (fleet-negotiation rejects an unmonitored lane as
    // non-viable, dropping the --require-models floor), so the fix is a WIDE
    // window (> the ~233s healthy completion, < the 420s timeout), NOT the tight
    // 60s window that false-killed. Regression-lock: monitored + window well
    // above 60s.
    const models = await loadTemplate();
    for (const name of ['claude', 'sonnet']) {
      const lane = byName(models, name);
      expect(lane.livenessSignal).toBe('stdout');
      expect(lane.livenessWindowSeconds).toBeGreaterThanOrEqual(240);
      const floor = lane.timeoutFloorSeconds;
      if (floor === undefined) throw new Error(`${name} lane missing timeout floor`);
      // Stay under the timeout so liveness still pre-empts a true infinite hang.
      expect(lane.livenessWindowSeconds).toBeLessThan(floor);
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
