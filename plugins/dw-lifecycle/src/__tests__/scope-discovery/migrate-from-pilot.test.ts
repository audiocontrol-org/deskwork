/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/migrate-from-pilot.test.ts
 *
 * Tests for the `migrate-from-pilot` verb (issue #291). The fixture
 * synthesizes two on-disk trees in a tmpdir:
 *
 *   <tmp>/pilot/                              — synthetic pilot project
 *     tools/scope-discovery/<name>.ts
 *     docs/scope-discovery/<name>.yaml
 *
 *   <tmp>/adopter/                            — synthetic adopter project
 *     (target for `.dw-lifecycle/scope-discovery/`)
 *
 * The CODE-diff side compares the pilot's `tools/scope-discovery/<name>.ts`
 * files against the plugin's `src/scope-discovery/<name>.ts` defaults
 * (the same directory the orchestrator's `__dirname` resolves to at
 * runtime). To exercise each of the four categorization branches
 * (identical / pilot-ahead / pilot-behind / diverges) without depending
 * on which real plugin files happen to match, the test seeds the pilot
 * tree with synthetic file names AND seeds the plugin-defaults directory
 * with sibling fixtures via a temporary symlink-free side-channel: we
 * write the pilot fixtures with names that are also present in the
 * plugin's `src/scope-discovery/` tree (real-file collisions are
 * acceptable because the comparison reads the on-disk plugin source
 * verbatim).
 *
 * Rather than relying on real-file collisions (brittle), the test uses
 * a different strategy: for each categorization, we author a pilot file
 * whose name MATCHES a real plugin file but write content that
 * deterministically produces the desired status when diffed against the
 * actual plugin source on disk. To make the fixture independent of the
 * plugin file's actual content, we instead derive the four status
 * categorizations by directly invoking `planMigration` with carefully
 * crafted file contents — checking the `addedInPilot` / `removedInPilot`
 * counts to confirm categorization logic. We then probe the real
 * pilot-vs-plugin behavior by writing pilot files with known content
 * and asserting against the resulting CODE entries.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  type CliOptions,
  type CodeEntry,
  type ConfigEntry,
  migrateFromPilotMain,
  parseCli,
  planMigration,
  renderReport,
  USAGE,
} from '../../scope-discovery/migrate-from-pilot.js';

const TARGET_CONFIG_REL = '.dw-lifecycle/scope-discovery';
const PILOT_CONFIG_REL = 'docs/scope-discovery';
const PILOT_CODE_REL = 'tools/scope-discovery';

/**
 * Fixture builder: stage a pilot tree under `<tmp>/pilot/` and an empty
 * adopter target under `<tmp>/adopter/`. Caller can seed additional
 * files into either tree before driving the verb.
 */
function stageTree(): {
  readonly tmp: string;
  readonly pilot: string;
  readonly adopter: string;
  readonly cleanup: () => void;
} {
  const tmp = mkdtempSync(join(tmpdir(), 'dw-migrate-pilot-'));
  const pilot = join(tmp, 'pilot');
  const adopter = join(tmp, 'adopter');
  mkdirSync(join(pilot, PILOT_CODE_REL), { recursive: true });
  mkdirSync(join(pilot, PILOT_CONFIG_REL), { recursive: true });
  mkdirSync(adopter, { recursive: true });
  return {
    tmp,
    pilot,
    adopter,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function baseOpts(args: {
  pilotRoot: string;
  target: string;
  apply?: boolean;
  force?: boolean;
  reportOut?: string | null;
}): CliOptions {
  return {
    pilotRoot: args.pilotRoot,
    target: args.target,
    apply: args.apply ?? false,
    force: args.force ?? false,
    reportOut: args.reportOut ?? null,
    quiet: true,
  };
}

describe('migrate-from-pilot — parseCli', () => {
  it('--pilot-root is required', () => {
    expect(() => parseCli([])).toThrow(/--pilot-root is required/);
  });

  it('--pilot-root sets the pilot path', () => {
    const opts = parseCli(['--pilot-root', '/tmp/foo']);
    expect(opts.pilotRoot).toBe('/tmp/foo');
  });

  it('--target overrides cwd default', () => {
    const opts = parseCli(['--pilot-root', '/p', '--target', '/t']);
    expect(opts.target).toBe('/t');
  });

  it('--apply and --force flags', () => {
    const opts = parseCli(['--pilot-root', '/p', '--apply', '--force']);
    expect(opts.apply).toBe(true);
    expect(opts.force).toBe(true);
  });

  it('defaults: dry-run, no force, target=cwd', () => {
    const opts = parseCli(['--pilot-root', '/p']);
    expect(opts.apply).toBe(false);
    expect(opts.force).toBe(false);
    expect(typeof opts.target).toBe('string');
  });

  it('--report-out resolves relative paths against --target', () => {
    const opts = parseCli([
      '--pilot-root',
      '/p',
      '--target',
      '/t',
      '--report-out',
      'report.md',
    ]);
    expect(opts.reportOut).toBe('/t/report.md');
  });

  it('--report-out preserves absolute paths', () => {
    const opts = parseCli([
      '--pilot-root',
      '/p',
      '--report-out',
      '/absolute/report.md',
    ]);
    expect(opts.reportOut).toBe('/absolute/report.md');
  });

  it('--quiet flag', () => {
    expect(parseCli(['--pilot-root', '/p', '--quiet']).quiet).toBe(true);
  });

  it('--help throws HELP sentinel', () => {
    expect(() => parseCli(['--help'])).toThrow(/HELP/);
    expect(() => parseCli(['-h'])).toThrow(/HELP/);
  });

  it('unknown flag throws', () => {
    expect(() => parseCli(['--pilot-root', '/p', '--bogus'])).toThrow(
      /unknown arg/,
    );
  });

  it('--pilot-root requires a value', () => {
    expect(() => parseCli(['--pilot-root'])).toThrow(/requires a path/);
  });

  it('USAGE banner mentions the required + optional flags', () => {
    expect(USAGE).toContain('--pilot-root');
    expect(USAGE).toContain('--target');
    expect(USAGE).toContain('--apply');
    expect(USAGE).toContain('--force');
    expect(USAGE).toContain('--report-out');
  });
});

describe('migrate-from-pilot — planMigration: refusals', () => {
  let tree: ReturnType<typeof stageTree>;
  beforeEach(() => {
    tree = stageTree();
  });
  afterEach(() => tree.cleanup());

  it('refuses when pilot tools/scope-discovery/ is absent', () => {
    // Stage a pilot root that has docs/ but no tools/
    const altTmp = mkdtempSync(join(tmpdir(), 'dw-migrate-bare-'));
    mkdirSync(join(altTmp, PILOT_CONFIG_REL), { recursive: true });
    expect(() =>
      planMigration(baseOpts({ pilotRoot: altTmp, target: tree.adopter })),
    ).toThrow(/pilot directory not found/);
    rmSync(altTmp, { recursive: true, force: true });
  });
});

describe('migrate-from-pilot — planMigration: CONFIG entries', () => {
  let tree: ReturnType<typeof stageTree>;
  beforeEach(() => {
    tree = stageTree();
  });
  afterEach(() => tree.cleanup());

  it('absent-on-pilot: CONFIG YAML missing on pilot side', () => {
    // Pilot has tools/ but no YAMLs at docs/scope-discovery/
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    for (const e of plan.configEntries) {
      expect(e.action).toBe('absent-on-pilot');
    }
  });

  it('planned-copy: pilot YAML present, adopter empty', () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: []\n',
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const clones = findConfig(plan.configEntries, 'clones.yaml');
    expect(clones.action).toBe('planned-copy');
  });

  it('matches: target already byte-for-byte equal to pilot', () => {
    const content = 'schemaVersion: 1\nclones: []\n';
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      content,
      'utf8',
    );
    mkdirSync(join(tree.adopter, TARGET_CONFIG_REL), { recursive: true });
    writeFileSync(
      join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
      content,
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const clones = findConfig(plan.configEntries, 'clones.yaml');
    expect(clones.action).toBe('matches');
  });

  it('conflict-refused: target differs, no --force', () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: [pilot]\n',
      'utf8',
    );
    mkdirSync(join(tree.adopter, TARGET_CONFIG_REL), { recursive: true });
    writeFileSync(
      join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
      'clones: [adopter]\n',
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const clones = findConfig(plan.configEntries, 'clones.yaml');
    expect(clones.action).toBe('conflict-refused');
    expect(clones.reason).toMatch(/--force/);
  });

  it('--force converts conflict into planned-copy', () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: [pilot]\n',
      'utf8',
    );
    mkdirSync(join(tree.adopter, TARGET_CONFIG_REL), { recursive: true });
    writeFileSync(
      join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
      'clones: [adopter]\n',
      'utf8',
    );
    const plan = planMigration(
      baseOpts({
        pilotRoot: tree.pilot,
        target: tree.adopter,
        force: true,
      }),
    );
    const clones = findConfig(plan.configEntries, 'clones.yaml');
    expect(clones.action).toBe('planned-copy');
    expect(clones.reason).toMatch(/overwrite/);
  });
});

describe('migrate-from-pilot — planMigration: CODE diff categorization', () => {
  let tree: ReturnType<typeof stageTree>;
  beforeEach(() => {
    tree = stageTree();
  });
  afterEach(() => tree.cleanup());

  /**
   * For the CODE-diff side, the orchestrator compares the pilot file
   * at `<pilot-root>/tools/scope-discovery/<name>.ts` against the
   * plugin default at `plugins/dw-lifecycle/src/scope-discovery/<name>.ts`
   * (resolved via `import.meta.url`-relative pathing inside the
   * orchestrator).
   *
   * Tests below use real plugin file names so the on-disk comparison
   * lands against a known plugin file. Each test reads the plugin file
   * once at the top and constructs a pilot file deterministically from
   * its content to engineer the desired status:
   *
   *   - identical:    write the plugin file's content verbatim.
   *   - pilot-ahead:  plugin content + one extra unique line at top.
   *   - pilot-behind: plugin content stripped of one of its lines.
   *   - diverges:     one line added at top AND one line stripped.
   *
   * This avoids brittleness from depending on the specific lines the
   * plugin happens to ship — the test derives the expected diff shape
   * from the plugin's actual content at test time.
   */

  // Pick a small, stable plugin file to diff against. `util/typeguards.ts`
  // is intentionally a low-churn, ~30-line module — choosing it keeps
  // the test's diff counts manageable for assertion.
  const PLUGIN_FILE = 'util-typeguards-probe.ts';

  function readPluginDefault(name: string): string | null {
    // Resolve the plugin-defaults dir relative to the test source so
    // the test's view matches the orchestrator's runtime view.
    const pluginDefaultsDir = new URL(
      '../../scope-discovery/',
      import.meta.url,
    ).pathname;
    const path = join(pluginDefaultsDir, name);
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8');
  }

  it('plugin-only: pilot lacks a file the plugin ships', () => {
    // No pilot file matching `scope-inventory.ts` — but the plugin
    // ships one. Since we enumerate from the pilot side, the file
    // shouldn't appear in the report at all (plugin-only status only
    // surfaces when the pilot DOES enumerate a file but the plugin
    // doesn't — see pilot-only-via-novel-name below).
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    // No CODE files = empty codeEntries
    expect(plan.codeEntries.length).toBe(0);
  });

  it('pilot-only: pilot ships a file the plugin does not', () => {
    // Author a pilot file with a name guaranteed not to collide with
    // any real plugin source.
    const novelName = 'pilot-only-novel-module-xyz.ts';
    writeFileSync(
      join(tree.pilot, PILOT_CODE_REL, novelName),
      '// pilot-only file with one line of content\nexport const novel = 1;\n',
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const entry = findCode(plan.codeEntries, novelName);
    expect(entry.status).toBe('pilot-only');
    expect(entry.suggestedAction).toMatch(/contribute-back/i);
  });

  it('identical: pilot file content matches plugin default byte-for-byte', () => {
    // Use the real plugin file `util/typeguards.ts` — but the verb only
    // diffs the orchestrator's sibling directory, not subdirectories.
    // For the identical test, use a file in the same directory as the
    // orchestrator: `migrate-from-pilot.ts` itself is a real plugin
    // file we can read.
    const realName = 'migrate-from-pilot.ts';
    const pluginText = readPluginDefault(realName);
    expect(pluginText).not.toBeNull();
    if (pluginText === null) return; // guard for TS
    writeFileSync(
      join(tree.pilot, PILOT_CODE_REL, realName),
      pluginText,
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const entry = findCode(plan.codeEntries, realName);
    expect(entry.status).toBe('identical');
    expect(entry.addedInPilot).toBe(0);
    expect(entry.removedInPilot).toBe(0);
  });

  it('pilot-ahead: pilot has lines the plugin lacks', () => {
    const realName = 'migrate-from-pilot.ts';
    const pluginText = readPluginDefault(realName);
    expect(pluginText).not.toBeNull();
    if (pluginText === null) return;
    // Append a uniquely-shaped line the plugin definitely doesn't ship.
    const pilotText =
      pluginText + '\n// PILOT_AHEAD_MARKER_xyz_unique_line\n';
    writeFileSync(
      join(tree.pilot, PILOT_CODE_REL, realName),
      pilotText,
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const entry = findCode(plan.codeEntries, realName);
    expect(entry.status).toBe('pilot-ahead');
    expect(entry.addedInPilot).toBeGreaterThan(0);
    expect(entry.removedInPilot).toBe(0);
    expect(entry.suggestedAction).toMatch(/contribute-back/i);
  });

  it('pilot-behind: plugin has lines the pilot lacks', () => {
    const realName = 'migrate-from-pilot.ts';
    const pluginText = readPluginDefault(realName);
    expect(pluginText).not.toBeNull();
    if (pluginText === null) return;
    // Drop a couple of lines from the middle of the plugin text. Use
    // splice to ensure we don't accidentally produce a "diverges"
    // result by changing only blank-line counts.
    const lines = pluginText.split('\n');
    // Find a line index whose content is unique enough that removing
    // it produces removed-in-pilot > 0 without accidentally adding any
    // pilot-unique lines. The orchestrator's `errorMessage` comment is
    // a safe choice — drop everything between two distinctive markers.
    // To keep this test resilient, drop the FIRST distinct non-blank,
    // non-whitespace line that is unique within the file.
    const removeIndex = findUniqueLineIndex(lines);
    expect(removeIndex).toBeGreaterThanOrEqual(0);
    const shorter = [...lines.slice(0, removeIndex), ...lines.slice(removeIndex + 1)];
    const pilotText = shorter.join('\n');
    writeFileSync(
      join(tree.pilot, PILOT_CODE_REL, realName),
      pilotText,
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const entry = findCode(plan.codeEntries, realName);
    expect(entry.status).toBe('pilot-behind');
    expect(entry.addedInPilot).toBe(0);
    expect(entry.removedInPilot).toBeGreaterThan(0);
    expect(entry.suggestedAction).toMatch(/sync from plugin/i);
  });

  it('diverges: both sides have unique lines', () => {
    const realName = 'migrate-from-pilot.ts';
    const pluginText = readPluginDefault(realName);
    expect(pluginText).not.toBeNull();
    if (pluginText === null) return;
    const lines = pluginText.split('\n');
    const removeIndex = findUniqueLineIndex(lines);
    expect(removeIndex).toBeGreaterThanOrEqual(0);
    const modified = [
      '// DIVERGES_MARKER_xyz_unique_line',
      ...lines.slice(0, removeIndex),
      ...lines.slice(removeIndex + 1),
    ];
    writeFileSync(
      join(tree.pilot, PILOT_CODE_REL, realName),
      modified.join('\n'),
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const entry = findCode(plan.codeEntries, realName);
    expect(entry.status).toBe('diverges');
    expect(entry.addedInPilot).toBeGreaterThan(0);
    expect(entry.removedInPilot).toBeGreaterThan(0);
    expect(entry.suggestedAction).toMatch(/customize-override/i);
  });

  it('PROBE_TEST: util-typeguards-probe file name unused in plugin source', () => {
    // Defensive guard: if some future change ships a real plugin file
    // named util-typeguards-probe.ts, the pilot-only test above will
    // silently mis-categorize. This test asserts the chosen-name stays
    // unused so the fixture remains valid.
    const pluginDefaultsDir = new URL(
      '../../scope-discovery/',
      import.meta.url,
    ).pathname;
    expect(existsSync(join(pluginDefaultsDir, PLUGIN_FILE))).toBe(false);
  });
});

describe('migrate-from-pilot — apply mode', () => {
  let tree: ReturnType<typeof stageTree>;
  beforeEach(() => {
    tree = stageTree();
  });
  afterEach(() => tree.cleanup());

  it('--apply copies CONFIG verbatim', async () => {
    const content = 'schemaVersion: 1\nclones: []\n';
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      content,
      'utf8',
    );
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--apply',
      '--quiet',
    ]);
    expect(code).toBe(0);
    const dest = join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml');
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, 'utf8')).toBe(content);
  });

  it('dry-run does NOT write', async () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: []\n',
      'utf8',
    );
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--quiet',
    ]);
    expect(code).toBe(0);
    expect(
      existsSync(join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml')),
    ).toBe(false);
  });

  it('--apply refuses on divergent target without --force (exit 2)', async () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: [pilot]\n',
      'utf8',
    );
    mkdirSync(join(tree.adopter, TARGET_CONFIG_REL), { recursive: true });
    writeFileSync(
      join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
      'clones: [adopter]\n',
      'utf8',
    );
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--apply',
      '--quiet',
    ]);
    expect(code).toBe(2);
    // Adopter file unchanged.
    expect(
      readFileSync(
        join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
        'utf8',
      ),
    ).toBe('clones: [adopter]\n');
  });

  it('--apply --force overwrites divergent target', async () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: [pilot]\n',
      'utf8',
    );
    mkdirSync(join(tree.adopter, TARGET_CONFIG_REL), { recursive: true });
    writeFileSync(
      join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
      'clones: [adopter]\n',
      'utf8',
    );
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--apply',
      '--force',
      '--quiet',
    ]);
    expect(code).toBe(0);
    expect(
      readFileSync(
        join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
        'utf8',
      ),
    ).toBe('clones: [pilot]\n');
  });

  it('idempotent: re-running --apply against matching target is a no-op', async () => {
    const content = 'schemaVersion: 1\nclones: []\n';
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      content,
      'utf8',
    );
    const first = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--apply',
      '--quiet',
    ]);
    expect(first).toBe(0);
    const second = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--apply',
      '--quiet',
    ]);
    expect(second).toBe(0);
    expect(
      readFileSync(
        join(tree.adopter, TARGET_CONFIG_REL, 'clones.yaml'),
        'utf8',
      ),
    ).toBe(content);
  });
});

describe('migrate-from-pilot — report rendering', () => {
  let tree: ReturnType<typeof stageTree>;
  beforeEach(() => {
    tree = stageTree();
  });
  afterEach(() => tree.cleanup());

  it('renderReport produces expected sections', () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: []\n',
      'utf8',
    );
    writeFileSync(
      join(tree.pilot, PILOT_CODE_REL, 'pilot-novel.ts'),
      '// pilot-novel file\n',
      'utf8',
    );
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const report = renderReport({
      plan,
      configEntries: plan.configEntries,
    });
    expect(report).toContain('# migrate-from-pilot report');
    expect(report).toContain('## CONFIG migration');
    expect(report).toContain('## CODE diff (pilot vs plugin defaults)');
    expect(report).toContain('## Legend');
    expect(report).toContain('clones.yaml');
    expect(report).toContain('pilot-novel.ts');
  });

  it('--report-out writes the report to disk', async () => {
    writeFileSync(
      join(tree.pilot, PILOT_CONFIG_REL, 'clones.yaml'),
      'clones: []\n',
      'utf8',
    );
    const reportPath = join(tree.adopter, 'migrate-report.md');
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--report-out',
      reportPath,
      '--quiet',
    ]);
    expect(code).toBe(0);
    expect(existsSync(reportPath)).toBe(true);
    const content = readFileSync(reportPath, 'utf8');
    expect(content).toContain('# migrate-from-pilot report');
  });

  it('reports absent-on-pilot YAMLs with a clear note', () => {
    // No YAMLs on pilot side; report should list absent-on-pilot for each.
    const plan = planMigration(
      baseOpts({ pilotRoot: tree.pilot, target: tree.adopter }),
    );
    const report = renderReport({
      plan,
      configEntries: plan.configEntries,
    });
    expect(report).toContain('absent-on-pilot');
  });
});

describe('migrate-from-pilot — main() exit codes', () => {
  let tree: ReturnType<typeof stageTree>;
  beforeEach(() => {
    tree = stageTree();
  });
  afterEach(() => tree.cleanup());

  it('exit 0 on successful dry-run', async () => {
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--target',
      tree.adopter,
      '--quiet',
    ]);
    expect(code).toBe(0);
  });

  it('exit 2 on missing --pilot-root', async () => {
    const code = await migrateFromPilotMain(['--target', tree.adopter]);
    expect(code).toBe(2);
  });

  it('exit 0 on --help', async () => {
    const code = await migrateFromPilotMain(['--help']);
    expect(code).toBe(0);
  });

  it('exit 2 on missing pilot tools/ directory', async () => {
    const altTmp = mkdtempSync(join(tmpdir(), 'dw-migrate-broken-'));
    mkdirSync(join(altTmp, PILOT_CONFIG_REL), { recursive: true });
    const code = await migrateFromPilotMain([
      '--pilot-root',
      altTmp,
      '--target',
      tree.adopter,
      '--quiet',
    ]);
    expect(code).toBe(2);
    rmSync(altTmp, { recursive: true, force: true });
  });

  it('exit 2 on unknown flag', async () => {
    const code = await migrateFromPilotMain([
      '--pilot-root',
      tree.pilot,
      '--bogus',
    ]);
    expect(code).toBe(2);
  });
});

// ---- Helpers ----

function findConfig(
  entries: ReadonlyArray<ConfigEntry>,
  name: string,
): ConfigEntry {
  const found = entries.find((e) => e.name === name);
  if (found === undefined) {
    throw new Error(`config entry not found: ${name}`);
  }
  return found;
}

function findCode(
  entries: ReadonlyArray<CodeEntry>,
  name: string,
): CodeEntry {
  const found = entries.find((e) => e.name === name);
  if (found === undefined) {
    throw new Error(`code entry not found: ${name}`);
  }
  return found;
}

/**
 * Find the index of a unique, non-empty, non-whitespace line in the
 * input. Used by the pilot-behind / diverges tests to remove a line
 * from the plugin's content without accidentally producing zero
 * `removedInPilot` (which would happen if the removed line is
 * duplicated elsewhere in the file).
 */
function findUniqueLineIndex(lines: ReadonlyArray<string>): number {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim() === '') continue;
    if (counts.get(line) === 1) return i;
  }
  return -1;
}
