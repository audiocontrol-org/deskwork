/**
 * Doc-conformance test: `plugins/deskwork/skills/group/SKILL.md` Error
 * handling catalog must quote the literal refusal-message fragments
 * actually thrown by `packages/core/src/groups/operations/*.ts`.
 *
 * Phase 0 Task 0.63 (graphical-entries) — closes AUDIT-20260530-88.
 *
 * The audit caught two failure modes:
 *
 *   1. **Message drift** — the SKILL.md catalog documented a refusal
 *      message that did NOT match the shipped code. An adopter
 *      grepping the documented string would not find it.
 *
 *   2. **Semantic regression** — the catalog re-asserted the
 *      pre-AUDIT-20260529-15 framing ("only entries with a non-empty
 *      members[] are groups") that the AUDIT-15 fix explicitly
 *      reversed. The new semantic: `members: []` IS a group (the
 *      declared-empty marker); `members`-absent is the regular entry.
 *
 * This test is a regression guard for both. It does NOT replicate
 * the per-operation behavior tests in `operations.test.ts` — those
 * already assert the throw paths fire. This test asserts the *docs*
 * stay in sync with the *throw strings*.
 *
 * Normalization strategy: both the SKILL.md fragments and the
 * concatenated source text are collapsed via `normalize` (whitespace
 * runs → single space, backslash-escapes for backticks → unescaped)
 * so the comparison survives the template-string concat shape the
 * operations files actually use AND the SKILL.md's markdown
 * line-wrapping. This is the brittleness-vs-strictness tradeoff:
 * looser matching catches drift in the strings adopters would grep
 * for without flagging every prettier-reformat.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// packages/core/test/groups/ -> repo root
const repoRoot = resolve(here, '..', '..', '..', '..');
const skillPath = join(
  repoRoot,
  'plugins',
  'deskwork',
  'skills',
  'group',
  'SKILL.md',
);
const groupsSrcDir = join(
  repoRoot,
  'packages',
  'core',
  'src',
  'groups',
);

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (s.isFile() && name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function readAllGroupsSources(): string {
  const files = collectTsFiles(groupsSrcDir);
  return files.map((f) => readFileSync(f, 'utf-8')).join('\n');
}

/**
 * Normalize a string for substring comparison:
 *   - Collapse whitespace runs (newlines, indentation, line-wraps)
 *     to a single space.
 *   - Unescape backslash-escaped backticks (`\\\``) — the source
 *     code uses `\\\`` inside template literals; the SKILL.md uses
 *     bare backticks. Compare both as bare backticks.
 *   - Strip the template-concat syntax (`\` + newline + spaces +
 *     `+ \``) the operations files use to join multi-line throw
 *     strings — this turns the rendered throw text into the same
 *     shape the catalog docs.
 */
function normalize(s: string): string {
  return s
    // Drop the template-concat joiners: `\n      + \`
    .replace(/`\s*\n\s*\+\s*`/g, '')
    // Unescape backslash-escaped backticks → bare backticks.
    .replace(/\\`/g, '`')
    // Collapse all whitespace runs to a single space.
    .replace(/\s+/g, ' ')
    .trim();
}

const skillMdRaw = readFileSync(skillPath, 'utf-8');
const groupsSrcRaw = readAllGroupsSources();
const skillMd = normalize(skillMdRaw);
const groupsSrc = normalize(groupsSrcRaw);

/**
 * Refusal-message fragments the SKILL.md catalog quotes and the
 * source must throw. Each fragment is the literal substring an
 * adopter would grep — after normalization, the comparison is
 * whitespace-insensitive and backtick-escape-insensitive.
 *
 * Adding a row here pins one more piece of the catalog to the
 * shipped code. Removing one without a code change is a silent
 * loosening of the contract.
 */
const documentedFragments: ReadonlyArray<{
  readonly label: string;
  readonly fragment: string;
}> = [
  {
    label: 'show non-group refusal (subject line + pointer)',
    fragment:
      'entry is not a group (no `members` field on the sidecar). '
      + 'Group-only verbs require the `members` field to be present; '
      + 'regular entries should be read via the universal entry paths.',
  },
  {
    label: 'update non-group refusal (subject line + pointer)',
    fragment:
      'entry is not a group (no `members` field on the sidecar). '
      + 'Group-only verbs require the `members` field to be present; '
      + 'regular entries should be mutated via the universal entry verbs.',
  },
  {
    label: 'add-member non-group refusal',
    fragment: 'entry has no `members` field.',
  },
  {
    label: 'archive non-group refusal',
    fragment: 'entry has no `members` field.',
  },
  {
    label: 'remove-member non-group refusal',
    fragment: 'entry has no `members` field.',
  },
  {
    label: 'restore non-group refusal',
    fragment: 'entry has no `members` field.',
  },
];

describe('SKILL.md error-handling catalog (AUDIT-20260530-88 regression guard)', () => {
  it('reads the SKILL.md file successfully', () => {
    expect(skillMdRaw.length).toBeGreaterThan(0);
    expect(skillMdRaw).toContain('### Error handling');
  });

  it('walks the groups source tree successfully', () => {
    expect(groupsSrcRaw.length).toBeGreaterThan(0);
    // Sanity-check we picked up the six operation files the catalog
    // documents non-group refusals for.
    expect(groupsSrcRaw).toContain('Cannot show group');
    expect(groupsSrcRaw).toContain('Cannot update group');
    expect(groupsSrcRaw).toContain('Cannot add member to');
    expect(groupsSrcRaw).toContain('Cannot archive group');
    expect(groupsSrcRaw).toContain('Cannot remove member from');
    expect(groupsSrcRaw).toContain('Cannot restore group');
  });

  it('documents the two refusal-message families (show/update vs. member-mutation verbs)', () => {
    // The catalog must call out that `show` / `update` emit "entry is
    // not a group" and the other verbs emit "entry has no `members`
    // field". This is the per-audit fix — the families were
    // conflated before.
    expect(skillMd).toContain('entry is not a group');
    expect(skillMd).toContain('entry has no `members` field');
    // The catalog must include an explicit family-distinction note
    // (so the two distinct shapes are surfaced to an adopter reading
    // top-to-bottom, not buried in adjacent bullets).
    expect(skillMdRaw).toMatch(/two refusal-message families/i);
  });

  it('does NOT re-assert the retired "non-empty members[] are groups" semantic', () => {
    // AUDIT-20260529-15 reversed this framing. `members: []` IS a
    // group (declared-empty marker). The SKILL.md must not carry the
    // old phrasing in any form — neither the literal nor the
    // "non-empty" qualifier that's the load-bearing wrong word.
    expect(skillMdRaw).not.toMatch(
      /only entries with a non-empty members\[\] are groups/i,
    );
    expect(skillMdRaw).not.toMatch(/non-empty `members\[\]` are groups/i);
    expect(skillMdRaw).not.toMatch(/non-empty members\[\] are groups/i);
  });

  for (const { label, fragment } of documentedFragments) {
    const normalizedFragment = normalize(fragment);
    it(`SKILL.md fragment for "${label}" appears in the SKILL.md`, () => {
      expect(skillMd).toContain(normalizedFragment);
    });

    it(`source code emits the throw text behind "${label}"`, () => {
      expect(groupsSrc).toContain(normalizedFragment);
    });
  }
});
