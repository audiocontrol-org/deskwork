// 030 US9 T084 (FR-024/026): the CLI-side end-govern runtime audits ONE chunk by
// render → barrage → EXTRACT findings, and crucially does NOT lift per chunk (the
// one-section-per-chunk balloon FR-026 forbids — lift happens ONCE, after the
// pipeline reconciles, from `liftedRich`). A stubbed barrage bin records every
// verb it is invoked with so the test can assert `audit-barrage-lift` was never
// called, while a real model-markdown finding flows back through
// `extractBarrageFindings` into the pipeline's minimal Finding shape.

import { describe, it, expect } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeEndGovernRuntime } from '../../govern/end-govern-runtime.js';
import type { LaneCapabilityProfile } from '../../govern/lane-capabilities.js';

/**
 * A fake barrage bin: it APPENDS its verb name to a log, writes a stub prompt on
 * render, and on `audit-barrage` materializes a run-dir holding one model's
 * markdown finding (so `extractBarrageFindings` parses a real finding). It has a
 * `lift` arm too — present only so a stray lift call would be RECORDED (and the
 * test can prove it never fired).
 */
function writeStubBarrage(dir: string, runDir: string, verbLog: string): string {
  const stub = join(dir, 'stub-barrage.sh');
  const body = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'verb="$1"; shift',
    'printf "%s\\n" "$verb" >> "' + verbLog + '"',
    'output=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in',
    '    --output) output="$2"; shift 2 ;;',
    '    *) shift ;;',
    '  esac',
    'done',
    'case "$verb" in',
    '  audit-barrage-render)',
    '    [ -n "$output" ] && printf "stub prompt\\n" > "$output" || true',
    '    exit 0 ;;',
    '  audit-barrage)',
    '    rd="' + runDir + '"',
    '    mkdir -p "$rd"',
    '    {',
    '      printf "### Possible null deref in foo\\n"',
    '      printf "Finding-ID: claude-01\\nStatus: open\\nSeverity: high\\nSurface: src/foo.ts:42\\n\\n"',
    '      printf "The value can be null when the cache misses.\\n"',
    '    } > "$rd/model-claude.md"',
    '    printf "%s\\n" "$rd"',
    '    exit 0 ;;',
    '  audit-barrage-lift)',
    '    exit 0 ;;',
    '  *) echo "stub-barrage: unknown verb $verb" >&2; exit 3 ;;',
    'esac',
    '',
  ].join('\n');
  writeFileSync(stub, body);
  chmodSync(stub, 0o755);
  return stub;
}

function viableLane(): LaneCapabilityProfile {
  return {
    name: 'model-claude',
    model: 'claude',
    binary: 'claude',
    availability: 'available',
    outputMode: 'text',
    enforcement: 'enforced',
    liveness: 'monitored',
    envelope: { maxPromptBytes: 100_000, source: 'fleet-knowledge' },
    timeoutBasis: { mode: 'override', timeoutSeconds: 300 },
  };
}

function makeRuntime() {
  const work = mkdtempSync(join(tmpdir(), 'egr-'));
  const repo = join(work, 'install');
  mkdirSync(repo, { recursive: true });
  const runDir = join(work, 'run');
  const verbLog = join(work, 'verbs.log');
  writeFileSync(verbLog, '', 'utf8');
  const stub = writeStubBarrage(work, runDir, verbLog);
  const runtime = makeEndGovernRuntime({
    barrageBin: stub,
    installationRoot: repo,
    slug: 'feat',
    checkpoint: 'after_implement',
    varsBase: {
      feature_slug: 'feat',
      audit_log_excerpt: '',
      commit_subjects: '',
      audit_lens: 'CODE_AUDIT_LENS',
      artifact_framing: 'CODE_FRAMING',
    },
    laneCapabilities: [viableLane()],
    requireModels: 1,
    envelope: 100_000,
    planContext: 'plan/spec/contracts context',
    base: 'BASE',
    head: 'HEAD',
    stderr: () => {},
  });
  return { runtime, verbLog };
}

describe('030 T084 — end-govern runtime audits a chunk without per-chunk lift (FR-024/026)', () => {
  it('renders + barrages + extracts, and returns the parsed finding', async () => {
    const { runtime } = makeRuntime();
    const result = await runtime.deps.auditChunk('the chunk payload bytes', 'c1');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe('high');
    expect(result.findings[0]!.title).toMatch(/null deref/i);
    expect(result.degraded).toBe(false);
  });

  it('does NOT call audit-barrage-lift per chunk (FR-026: lift is once, post-reconcile)', async () => {
    const { runtime, verbLog } = makeRuntime();
    await runtime.deps.auditChunk('the chunk payload bytes', 'c1');
    const verbs = readFileSync(verbLog, 'utf8');
    expect(verbs).toContain('audit-barrage-render');
    expect(verbs).toContain('audit-barrage\n');
    expect(verbs).not.toContain('audit-barrage-lift');
  });

  it('stashes the rich finding so the lifted-id set resolves back to it (lift-once source)', async () => {
    const { runtime } = makeRuntime();
    const result = await runtime.deps.auditChunk('the chunk payload bytes', 'c1');
    const rich = runtime.liftedRich(result.findings.map((f) => f.id));
    expect(rich).toHaveLength(1);
    expect(rich[0]!.heading).toMatch(/null deref/i);
  });

  it('exposes the pipeline deps with applyFixes ABSENT (FR-009 deferred → override-eligible)', () => {
    const { runtime } = makeRuntime();
    expect(runtime.deps.applyFixes).toBeUndefined();
    expect(runtime.deps.resolveEnvelope()).toBe(100_000);
    expect(runtime.deps.planContext()).toContain('context');
  });
});
