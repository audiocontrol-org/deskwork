// T004 (RED-first) — the FR-011 anti-coupling gate.
//
// FR-011: the shipped product mechanism contains ZERO references to the
// predecessor lifecycle plugin (whole token `dw-lifecycle`, case-insensitive,
// word-boundary). The scan covers engine/verbs/skills/grammars/fixtures and
// EXCLUDES the two proof documents (ROADMAP.md, DESIGN-INBOX.md) as governed
// content that legitimately names the predecessor as lineage.
//
// This suite exercises the GATE SCRIPT's behavior against tmp trees:
//   - FAILS (exit 1) on a planted predecessor reference in the mechanism,
//   - PASSES (exit 0) when absent,
//   - and a predecessor reference inside a proof document does NOT fail it.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// plugins/stack-control/tests/document-primitives → repo root is 4 up.
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const GATE = join(REPO_ROOT, 'scripts', 'check-no-predecessor-refs.sh');

function runGate(scanRoot: string) {
  return spawnSync('bash', [GATE, '--scan-root', scanRoot], { encoding: 'utf8' });
}

function tmpTree(): string {
  return mkdtempSync(join(tmpdir(), 'anti-coupling-'));
}

describe('FR-011 anti-coupling gate (T004)', () => {
  it('FAILS (exit 1) on a planted predecessor reference in the mechanism', () => {
    const root = tmpTree();
    try {
      mkdirSync(join(root, 'src', 'document-model'), { recursive: true });
      writeFileSync(
        join(root, 'src', 'document-model', 'archive-engine.ts'),
        "// ported from dw-lifecycle's archive-phases\nexport const x = 1;\n",
        'utf8',
      );
      const r = runGate(root);
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toMatch(/dw-lifecycle/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('PASSES (exit 0) when no predecessor reference is present', () => {
    const root = tmpTree();
    try {
      mkdirSync(join(root, 'src', 'document-model'), { recursive: true });
      writeFileSync(
        join(root, 'src', 'document-model', 'archive-engine.ts'),
        'export const archive = () => undefined;\n',
        'utf8',
      );
      mkdirSync(join(root, 'grammars'), { recursive: true });
      writeFileSync(join(root, 'grammars', 'roadmap.peg'), 'start = "x"\n', 'utf8');
      const r = runGate(root);
      expect(r.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does NOT fail on a predecessor reference inside a proof document', () => {
    const root = tmpTree();
    try {
      // Proof documents live at the plugin root and are EXCLUDED from the scan.
      writeFileSync(
        join(root, 'ROADMAP.md'),
        '# Roadmap\n\nstack-control is the successor to dw-lifecycle (absorb-then-retire).\n',
        'utf8',
      );
      writeFileSync(
        join(root, 'DESIGN-INBOX.md'),
        '# Design inbox\n\nPort dw-lifecycle archive-phases.\n',
        'utf8',
      );
      mkdirSync(join(root, 'src', 'document-model'), { recursive: true });
      writeFileSync(
        join(root, 'src', 'document-model', 'archive-engine.ts'),
        'export const archive = () => undefined;\n',
        'utf8',
      );
      const r = runGate(root);
      expect(r.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
