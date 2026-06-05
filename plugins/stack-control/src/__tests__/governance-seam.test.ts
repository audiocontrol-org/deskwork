import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GOVERN_SH = resolve(
  here,
  '..',
  '..',
  'spec-kit',
  'deskwork-governance',
  'scripts',
  'bash',
  'govern.sh',
);

// A PATH that retains git/jq/coreutils (so the script preamble + feature-slug
// derivation run) but NOT the dw-lifecycle plugin bin (it lives under
// ~/.claude/plugins/cache/...). This simulates the cross-plugin seam
// dependency being absent — the exact "governance dependency at rehome" edge.
const STRIPPED_PATH = '/usr/bin:/bin';

function runGovern(script: string) {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    // Pin GOVERN_FEATURE_SLUG (AUDIT-20260605-02): govern.sh derives the slug
    // from the `feature/<slug>` branch BEFORE the dw-lifecycle PATH check. On a
    // detached HEAD or non-feature branch (e.g. CI checkout at a SHA/tag) that
    // derivation FATALs first, so without this override the seam assertion would
    // be a false RED about slug derivation, not the dependency it claims to
    // guard. The override is the path the command body documents.
    env: { ...process.env, PATH: STRIPPED_PATH, GOVERN_FEATURE_SLUG: 'seam-test' },
  });
}

// T023 / governance-extension.md "Cross-plugin seam intact" / Edge "Governance
// dependency at rehome" / Principle V (no silent skip). govern.sh content is
// unchanged by the move, so this preserved-behavior guard passes once the
// rehome lands — and flips RED the moment govern.sh starts swallowing a
// missing dependency.
describe('governance cross-plugin seam fails loud (T023)', () => {
  it('the real govern.sh exits non-zero naming dw-lifecycle when it is absent from PATH', () => {
    const r = runGovern(GOVERN_SH);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/dw-lifecycle\b.*not on PATH/i);
  });

  // Positive control — the "watch it fail first" contrast: a govern that
  // SWALLOWS the missing dependency (exits 0) is precisely the behavior this
  // guard forbids. If the assertion above ever regressed to accept exit 0,
  // this control documents what that broken state looks like.
  it('control: a swallowing govern stub exits 0 (the forbidden behavior)', () => {
    const fx = mkdtempSync(join(tmpdir(), 'gov-seam-'));
    const stub = join(fx, 'swallow-govern.sh');
    writeFileSync(
      stub,
      '#!/usr/bin/env bash\ncommand -v dw-lifecycle >/dev/null 2>&1 || true\necho "ran anyway"\nexit 0\n',
    );
    chmodSync(stub, 0o755);
    const r = runGovern(stub);
    rmSync(fx, { recursive: true, force: true });
    expect(r.status).toBe(0);
  });
});
