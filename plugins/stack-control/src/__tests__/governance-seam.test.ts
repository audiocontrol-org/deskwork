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

// The barrage capability is now stack-control's OWN (vendored via
// multi/migrate-audit-barrage) and dispatched through the bundled stackctl by
// absolute path — there is no longer a cross-PLUGIN seam. The fail-loud
// PRINCIPLE (Principle V — no silent skip when the barrage entrypoint is
// absent) still holds: GOVERN_BARRAGE_BIN points the dispatcher at a bogus path
// to simulate the capability being unavailable.
function runGovern(script: string, barrageBin = '/nonexistent/stackctl-missing') {
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    // Pin GOVERN_FEATURE_SLUG (AUDIT-20260605-02): govern.sh derives the slug
    // from the `feature/<slug>` branch BEFORE the capability check; pinning it
    // keeps this a fail-loud assertion, not a false RED about slug derivation.
    env: {
      ...process.env,
      GOVERN_FEATURE_SLUG: 'seam-test',
      GOVERN_BARRAGE_BIN: barrageBin,
    },
  });
}

// Principle V (no silent skip): govern.sh content fails loud the moment its
// barrage entrypoint is unavailable — and flips RED if it ever starts
// swallowing a missing capability.
describe('governance barrage capability fails loud (T023 / Principle V)', () => {
  it('the real govern.sh exits non-zero naming stackctl when the barrage entrypoint is absent', () => {
    const r = runGovern(GOVERN_SH);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/stackctl\b.*not found/i);
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
      '#!/usr/bin/env bash\ncommand -v stackctl >/dev/null 2>&1 || true\necho "ran anyway"\nexit 0\n',
    );
    chmodSync(stub, 0o755);
    const r = runGovern(stub);
    rmSync(fx, { recursive: true, force: true });
    expect(r.status).toBe(0);
  });
});
