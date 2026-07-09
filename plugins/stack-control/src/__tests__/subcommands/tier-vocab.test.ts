// 035 T005 (RED) — the `stackctl tier-vocab [--json]` installation-scoped read verb.
//
// RED-first: spawns the dispatcher against tmp installation trees (the resolve-tiers
// test pattern — in-test tmp dirs, not static fixtures). The four states of
// contracts/tier-vocab-verb.md, D6:
//   (a) configured  → exit 0; TierVocab {configured:true, labels[], buckets}.
//   (b) absent      → exit 0 (NOT blocked, FR-009); {configured:false, configPath}
//                     + a loud stderr advisory naming tier_map + the config path.
//   (c) malformed   → exit non-zero; the loader's fail-loud message; no vocab.
//   (d) no install  → exit 1; names the missing installation + `stackctl setup`.
//
// T001 fixtures live here as named config-variant constants (matching resolve-tiers's
// in-test convention): three-label default, non-default labels, two-label,
// four-label incl fable, malformed, and absent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';

// ── T001 config-variant fixtures ────────────────────────────────────────────
const CONFIG_THREE_DEFAULT = ['version: 1', 'tier_map:', '  fast: haiku', '  balanced: sonnet', '  powerful: opus', ''].join('\n');
const CONFIG_NON_DEFAULT = ['version: 1', 'tier_map:', '  cheap: haiku', '  mid: sonnet', '  frontier: opus', ''].join('\n');
const CONFIG_TWO_LABEL = ['version: 1', 'tier_map:', '  lite: haiku', '  heavy: opus', ''].join('\n');
const CONFIG_FOUR_FABLE = ['version: 1', 'tier_map:', '  fast: haiku', '  balanced: sonnet', '  powerful: opus', '  story: fable', ''].join('\n');
const CONFIG_MALFORMED = ['version: 1', 'tier_map:', '  fast: not-a-model', ''].join('\n');
const CONFIG_ABSENT = 'version: 1\n';

interface Labels {
  readonly configured: boolean;
  readonly configPath: string;
  readonly labels?: readonly { label: string; model: string; rank: number }[];
  readonly buckets?: { cheapest: string; mid: string; mostCapable: string };
}

describe('stackctl tier-vocab (035)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-tiervocab-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  /** Write an installation config into a tmp root and return the resolved config path. */
  function makeInstall(config: string): { configPath: string } {
    mkdirSync(join(work, '.stack-control'), { recursive: true });
    writeFileSync(join(work, '.stack-control', 'config.yaml'), config);
    // process.cwd() in the child resolves symlinks (macOS /var → /private/var), so the
    // verb's cwd-walk yields the realpath'd config path — compute the same here.
    return { configPath: join(realpathSync(work), '.stack-control', 'config.yaml') };
  }

  // ── (a) Configured ──────────────────────────────────────────────────────────
  it('configured (three-label default) → exit 0; TierVocab with labels + buckets (Example A)', () => {
    const { configPath } = makeInstall(CONFIG_THREE_DEFAULT);
    const r = runCli(['tier-vocab'], { cwd: work });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as Labels;
    expect(out).toEqual({
      configured: true,
      configPath,
      labels: [
        { label: 'fast', model: 'haiku', rank: 0 },
        { label: 'balanced', model: 'sonnet', rank: 1 },
        { label: 'powerful', model: 'opus', rank: 2 },
      ],
      buckets: { cheapest: 'fast', mid: 'balanced', mostCapable: 'powerful' },
    });
  });

  it('configured (non-default labels) → buckets bind to the operator labels', () => {
    makeInstall(CONFIG_NON_DEFAULT);
    const r = runCli(['tier-vocab'], { cwd: work });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as Labels;
    expect(out.buckets).toEqual({ cheapest: 'cheap', mid: 'mid', mostCapable: 'frontier' });
  });

  it('configured (two-label) → mid collapses to cheapest', () => {
    makeInstall(CONFIG_TWO_LABEL);
    const r = runCli(['tier-vocab'], { cwd: work });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as Labels;
    expect(out.buckets).toEqual({ cheapest: 'lite', mid: 'lite', mostCapable: 'heavy' });
  });

  it('configured (four-label incl fable) → fable ranks last; every model ∈ accepted set', () => {
    makeInstall(CONFIG_FOUR_FABLE);
    const r = runCli(['tier-vocab'], { cwd: work });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as Labels;
    expect(out.buckets?.mostCapable).toBe('story');
    expect(out.labels?.find((l) => l.label === 'story')).toEqual({ label: 'story', model: 'fable', rank: 3 });
  });

  it('accepts the optional --json flag (default + only output mode)', () => {
    makeInstall(CONFIG_THREE_DEFAULT);
    const r = runCli(['tier-vocab', '--json'], { cwd: work });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty('buckets');
  });

  // ── (b) Absent (FR-009 — NOT blocked) ────────────────────────────────────────
  it('absent tier_map → exit 0; {configured:false, configPath}; loud stderr advisory', () => {
    const { configPath } = makeInstall(CONFIG_ABSENT);
    const r = runCli(['tier-vocab'], { cwd: work });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ configured: false, configPath });
    expect(r.stderr).toMatch(/tier_map/);
    expect(r.stderr).toContain(configPath);
  });

  // ── (c) Malformed ─────────────────────────────────────────────────────────────
  it('malformed tier_map → exit non-zero; loader fail-loud message; no vocab on stdout', () => {
    makeInstall(CONFIG_MALFORMED);
    const r = runCli(['tier-vocab'], { cwd: work });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not an accepted model/);
    expect(r.stdout.trim()).toBe('');
  });

  // ── (d) No enclosing installation ────────────────────────────────────────────
  it('no installation → exit 1; names the missing installation + stackctl setup', () => {
    const r = runCli(['tier-vocab'], { cwd: work }); // no .stack-control anywhere
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/installation/);
    expect(r.stderr).toMatch(/stackctl setup/);
  });

  // ── Strict arg parse ─────────────────────────────────────────────────────────
  it('exits 2 on an unknown flag (no flag silently ignored)', () => {
    makeInstall(CONFIG_THREE_DEFAULT);
    const r = runCli(['tier-vocab', '--bogus'], { cwd: work });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unexpected argument|unknown/i);
  });

  it('exits 2 on a stray positional', () => {
    makeInstall(CONFIG_THREE_DEFAULT);
    const r = runCli(['tier-vocab', 'extra'], { cwd: work });
    expect(r.status).toBe(2);
  });
});
