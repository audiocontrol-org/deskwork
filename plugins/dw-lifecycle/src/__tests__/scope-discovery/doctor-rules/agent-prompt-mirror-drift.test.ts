/**
 * Tests for the `agent-prompt-mirror-drift` doctor rule.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/agent-prompt-mirror-drift.js';

const tmpRoots: string[] = [];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CANONICAL_FRAGMENT_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'templates',
  'scope-discovery',
  'agent-step-0-fragment.md',
);

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-agent-drift-'));
  tmpRoots.push(root);
  mkdirSync(join(root, '.claude/agents'), { recursive: true });
  return root;
}

function plantAgent(root: string, rel: string, body: string): void {
  writeFileSync(join(root, rel), body, 'utf8');
}

function canonicalFragment(): string {
  return readFileSync(CANONICAL_FRAGMENT_PATH, 'utf8');
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe('agent-prompt-mirror-drift doctor rule', () => {
  it('passes silently when no agent files exist', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes silently when agent files exist but lack the fragment markers', async () => {
    const root = mkProject();
    plantAgent(
      root,
      '.claude/agents/code-reviewer.md',
      '# Code reviewer\nGeneric body.\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes on an exact-match canonical fragment', async () => {
    const root = mkProject();
    const fragment = canonicalFragment();
    plantAgent(
      root,
      '.claude/agents/code-reviewer.md',
      `# Code reviewer\nCustom content above.\n\n${fragment}\n## Custom section below\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('tolerates trailing whitespace on fragment lines (normalize strips it)', async () => {
    const root = mkProject();
    const fragment = canonicalFragment();
    // Add trailing whitespace to one of the fragment lines. normalize()
    // strips trailing whitespace; the rule must NOT flag this as drift.
    const wonky = fragment
      .split('\n')
      .map((line, idx) => (idx === 5 ? `${line}   ` : line))
      .join('\n');
    plantAgent(
      root,
      '.claude/agents/code-reviewer.md',
      `# Code reviewer\n\n${wonky}\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('warns when the fragment body has been hand-edited', async () => {
    const root = mkProject();
    const fragment = canonicalFragment();
    const drifted = fragment.replace(
      '## Step 0 — refactor-precondition verification',
      '## Step 0 — OPERATOR-EDITED HEADING',
    );
    plantAgent(
      root,
      '.claude/agents/code-reviewer.md',
      `# Code reviewer\n\n${drifted}\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('agent-prompt-mirror-drift');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toMatch(/drifted/);
    expect(findings[0].message).toMatch(/install-agent-prompts/);
  });

  it('emits one finding per drifted agent file', async () => {
    const root = mkProject();
    const fragment = canonicalFragment();
    const drifted = fragment.replace(
      '## Step 0 — refactor-precondition verification',
      '## DRIFTED',
    );
    plantAgent(
      root,
      '.claude/agents/code-reviewer.md',
      `# A\n\n${drifted}\n`,
    );
    plantAgent(
      root,
      '.claude/agents/codebase-auditor.md',
      `# B\n\n${drifted}\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(2);
  });

  it('suppresses drift findings when overrides marker file is present', async () => {
    const root = mkProject();
    mkdirSync(join(root, '.dw-lifecycle/scope-discovery'), { recursive: true });
    writeFileSync(
      join(root, '.dw-lifecycle/scope-discovery/agent-prompt-overrides.md'),
      '# Documented divergence — we keep our own version.\n',
      'utf8',
    );
    const fragment = canonicalFragment();
    const drifted = fragment.replace(
      '## Step 0 — refactor-precondition verification',
      '## DELIBERATELY OURS',
    );
    plantAgent(
      root,
      '.claude/agents/code-reviewer.md',
      `# X\n\n${drifted}\n`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });
});
