// specs/014-audit-barrage-reliability — T002 (RED): config v2 lane grammar.
//
// Contract: specs/014-audit-barrage-reliability/contracts/barrage-config-schema.md
// (field semantics normative in data-model.md § ModelConfigEntry).
//
// Every lane MUST declare: an explicit `model` pin (FR-001) with a `{{model}}`
// placeholder in args_template; a `readonly_enforcement` fragment or the
// explicit sentinel `none` (FR-004); `output_mode` / `liveness_signal` enums
// (FR-009); `liveness_window_seconds` when the signal is monitored; and a
// timeout derivation pair (floor + secs/KB) unless an explicit
// `timeout_seconds` override displaces it (FR-002). An entry missing the new
// required fields is a pre-014 config → refused with a migration message
// naming the file, the missing fields, and the template path (FR-011, SC-006).

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG_PATH,
  parseConfig,
} from '../../../scope-discovery/audit-barrage/config-loader.js';

const LABEL = '/fixtures/audit-barrage-config.yaml';

interface LaneOverrides {
  readonly [key: string]: string | number | undefined;
}

/** Render a single-lane YAML body from the valid v2 baseline + overrides.
 * An override of `undefined` REMOVES the field. */
function laneYaml(overrides: LaneOverrides = {}): string {
  const base: Record<string, string | number | undefined> = {
    name: 'claude',
    binary: 'claude',
    model: 'opus',
    args_template:
      '"-p --model {{model}} --output-format stream-json --verbose {{prompt-stdin}}"',
    readonly_enforcement: '"--permission-mode plan"',
    output_mode: 'stream-json',
    liveness_signal: 'stdout',
    liveness_window_seconds: 60,
    timeout_floor_seconds: 300,
    timeout_secs_per_kb: 13,
    ...overrides,
  };
  const lines = ['models:'];
  let first = true;
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    lines.push(`  ${first ? '-' : ' '} ${key}: ${value}`);
    first = false;
  }
  return `${lines.join('\n')}\n`;
}

describe('config v2 — valid lane (T002)', () => {
  it('parses the full v2 grammar into the typed lane', () => {
    const config = parseConfig(laneYaml(), LABEL);
    expect(config.models).toHaveLength(1);
    const lane = config.models[0]!;
    expect(lane.name).toBe('claude');
    expect(lane.model).toBe('opus');
    expect(lane.readonlyEnforcement).toBe('--permission-mode plan');
    expect(lane.outputMode).toBe('stream-json');
    expect(lane.livenessSignal).toBe('stdout');
    expect(lane.livenessWindowSeconds).toBe(60);
    expect(lane.timeoutFloorSeconds).toBe(300);
    expect(lane.timeoutSecsPerKb).toBe(13);
    expect(lane.timeoutSeconds).toBeUndefined();
  });

  it('accepts an explicit timeout_seconds override WITHOUT the derivation pair', () => {
    const config = parseConfig(
      laneYaml({
        timeout_floor_seconds: undefined,
        timeout_secs_per_kb: undefined,
        timeout_seconds: 900,
      }),
      LABEL,
    );
    expect(config.models[0]!.timeoutSeconds).toBe(900);
    expect(config.models[0]!.timeoutFloorSeconds).toBeUndefined();
  });

  it('accepts the readonly_enforcement sentinel `none` (lane loads; marking is downstream)', () => {
    const config = parseConfig(
      laneYaml({ readonly_enforcement: 'none' }),
      LABEL,
    );
    expect(config.models[0]!.readonlyEnforcement).toBe('none');
  });

  it('accepts liveness_signal none WITHOUT a window (unmonitored lane)', () => {
    const config = parseConfig(
      laneYaml({ liveness_signal: 'none', liveness_window_seconds: undefined }),
      LABEL,
    );
    expect(config.models[0]!.livenessSignal).toBe('none');
    expect(config.models[0]!.livenessWindowSeconds).toBeUndefined();
  });
});

describe('config v2 — model pin refusals (FR-001)', () => {
  it('refuses a lane without a model pin, naming the lane and the missing field', () => {
    expect(() => parseConfig(laneYaml({ model: undefined }), LABEL)).toThrowError(
      /claude.*model/s,
    );
  });

  it('refuses an args_template without the {{model}} placeholder', () => {
    expect(() =>
      parseConfig(
        laneYaml({
          args_template: '"-p --output-format stream-json {{prompt-stdin}}"',
        }),
        LABEL,
      ),
    ).toThrowError(/\{\{model\}\}/);
  });
});

describe('config v2 — enum + window refusals', () => {
  it('refuses an invalid output_mode, naming the allowed values', () => {
    expect(() => parseConfig(laneYaml({ output_mode: 'ndjson' }), LABEL)).toThrowError(
      /output_mode.*(text.*stream-json|stream-json.*text)/s,
    );
  });

  it('refuses an invalid liveness_signal, naming the allowed values', () => {
    expect(() =>
      parseConfig(laneYaml({ liveness_signal: 'heartbeat' }), LABEL),
    ).toThrowError(/liveness_signal.*(stdout.*stderr.*none)/s);
  });

  it('refuses a monitored signal without liveness_window_seconds', () => {
    expect(() =>
      parseConfig(laneYaml({ liveness_window_seconds: undefined }), LABEL),
    ).toThrowError(/liveness_window_seconds/);
  });

  // AUDIT-20260611-14: a window on an unmonitored lane is inert — spawn-cli
  // computes monitored = signal !== 'none', so the watchdog never arms and a
  // reader who set a window believes liveness is monitored when it isn't.
  // Fail-loud, consistent with the rest of the v2 grammar.
  it('refuses liveness_signal none WITH a window (AUDIT-20260611-14)', () => {
    let message = '';
    try {
      parseConfig(
        laneYaml({ liveness_signal: 'none', liveness_window_seconds: 60 }),
        LABEL,
      );
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toBe('');
    // Names the lane…
    expect(message).toContain('claude');
    // …names both fields in tension…
    expect(message).toContain('liveness_window_seconds');
    expect(message).toMatch(/liveness_signal.*none|none.*liveness_signal/s);
    // …states the unmonitored-lane consequence and the two ways out.
    expect(message).toMatch(/unmonitored/i);
    expect(message).toMatch(/stdout/);
    expect(message).toMatch(/stderr/);
    expect(message).toMatch(/remove/i);
  });
});

describe('config v2 — timeout derivation refusals (FR-002)', () => {
  it('refuses a lane with NEITHER the derivation pair NOR timeout_seconds', () => {
    expect(() =>
      parseConfig(
        laneYaml({
          timeout_floor_seconds: undefined,
          timeout_secs_per_kb: undefined,
        }),
        LABEL,
      ),
    ).toThrowError(/timeout_floor_seconds.*timeout_secs_per_kb|timeout/s);
  });

  it('refuses half a derivation pair (floor without secs_per_kb)', () => {
    expect(() =>
      parseConfig(laneYaml({ timeout_secs_per_kb: undefined }), LABEL),
    ).toThrowError(/timeout_secs_per_kb/);
  });
});

describe('config v2 — pre-014 migration refusal (FR-011, SC-006)', () => {
  // The exact shape this repo's pre-014 project override carried.
  const PRE_014 = [
    'models:',
    '  - name: claude',
    '    binary: claude',
    '    args_template: "-p {{prompt-stdin}}"',
    '    timeout_seconds: 300',
    '',
  ].join('\n');

  it('refuses with a message naming the file, the missing fields, and the template path', () => {
    let message = '';
    try {
      parseConfig(PRE_014, LABEL);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toBe('');
    // Names the file…
    expect(message).toContain(LABEL);
    // …every missing v2 field…
    expect(message).toContain('model');
    expect(message).toContain('readonly_enforcement');
    expect(message).toContain('output_mode');
    expect(message).toContain('liveness_signal');
    // …and the template to copy from.
    expect(message).toContain(DEFAULT_CONFIG_PATH);
  });
});

describe('config v2 — {{prompt-stdin}} must be a bare token (AUDIT-20260611-12)', () => {
  it('refuses an embedded {{prompt-stdin}} (e.g. --input={{prompt-stdin}}), naming the lane and the bare-token rule', () => {
    let message = '';
    try {
      parseConfig(
        laneYaml({
          args_template: '"-p --model {{model}} --input={{prompt-stdin}}"',
        }),
        LABEL,
      );
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toBe('');
    // Names the lane…
    expect(message).toContain('claude');
    // …states the bare-token-only rule…
    expect(message).toMatch(/bare/i);
    expect(message).toContain('{{prompt-stdin}}');
    // …and explains WHY: stdin delivery has no argv slot to substitute into.
    expect(message).toMatch(/stdin/i);
    expect(message).toMatch(/argv/i);
  });

  it('still accepts the bare whitespace-delimited {{prompt-stdin}} token (baseline fixture)', () => {
    const config = parseConfig(laneYaml(), LABEL);
    expect(config.models[0]!.argsTemplate).toMatch(/(^|\s)\{\{prompt-stdin\}\}(\s|$)/);
  });
});

describe('config v2 — v1 rules carried forward unchanged', () => {
  it('still refuses a template with neither prompt placeholder', () => {
    expect(() =>
      parseConfig(laneYaml({ args_template: '"-p --model {{model}}"' }), LABEL),
    ).toThrowError(/\{\{prompt\}\}|\{\{prompt-stdin\}\}/);
  });

  it('still refuses a template with BOTH prompt placeholders', () => {
    expect(() =>
      parseConfig(
        laneYaml({
          args_template: '"-p --model {{model}} {{prompt}} {{prompt-stdin}}"',
        }),
        LABEL,
      ),
    ).toThrowError(/mutually exclusive/);
  });

  it('still refuses duplicate lane names', () => {
    const body = `${laneYaml()}${laneYaml().replace('models:\n', '')}`;
    expect(() => parseConfig(body, LABEL)).toThrowError(/duplicate/);
  });
});
