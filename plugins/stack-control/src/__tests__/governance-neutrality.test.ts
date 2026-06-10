import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GOV_ROOT = resolve(here, '..', '..', 'spec-kit', 'deskwork-governance');
const GOVERN_SH = join(GOV_ROOT, 'scripts', 'bash', 'govern.sh');
const COMMAND_MD = join(GOV_ROOT, 'commands', 'speckit.deskwork-governance.govern.md');

// Authoring/execution provider/model identities. The neutrality invariant
// (Principle III / SC-004 / VR-3): the governance code path branches on
// diff + feature slug ONLY — never on which tool authored or executed the
// plan. `dw-lifecycle`/`git`/`jq` are governance/composition tools, not
// authoring/execution provider identities, so they are NOT in this list.
const PROVIDER_IDENTITY = /\b(claude|codex|gemini|gpt-?[0-9]*|chatgpt|copilot|cursor|anthropic|openai|kiro)\b/i;

function providerMatches(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(PROVIDER_IDENTITY);
    if (m !== null) hits.push(`${m[0]} :: ${line.trim()}`);
  }
  return hits;
}

// T1 positive control: prove the matcher actually detects a provider
// identity, so the suite fails for a CONTENT reason (broken matcher) — not
// merely because a moved file is missing. This is green throughout.
describe('governance neutrality matcher — positive control (T016/T1)', () => {
  it('flags a planted provider identity in a tmp fixture', () => {
    const fx = mkdtempSync(join(tmpdir(), 'gov-neutral-'));
    const planted = join(fx, 'planted.sh');
    writeFileSync(planted, 'case "$P" in\n  claude) dispatch_to_claude ;;\nesac\n');
    const hits = providerMatches(readFileSync(planted, 'utf8'));
    rmSync(fx, { recursive: true, force: true });
    expect(hits.length).toBeGreaterThan(0);
  });
});

// Real-file neutrality at the rehomed stack-control home. RED until the
// rehome (T018) lands; green once govern.sh + the command body live here
// and carry zero provider-identity strings.
describe('governance neutrality — rehomed files (T016 / SC-004 / Principle III)', () => {
  it('govern.sh exists at the stack-control home', () => {
    expect(existsSync(GOVERN_SH)).toBe(true);
  });
  it('the govern command body exists at the stack-control home', () => {
    expect(existsSync(COMMAND_MD)).toBe(true);
  });
  it('govern.sh contains zero provider-identity matches', () => {
    expect(providerMatches(readFileSync(GOVERN_SH, 'utf8'))).toEqual([]);
  });
  it('the govern command body contains zero provider-identity matches', () => {
    expect(providerMatches(readFileSync(COMMAND_MD, 'utf8'))).toEqual([]);
  });
});
