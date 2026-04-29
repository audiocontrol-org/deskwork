/**
 * Phase 23f — override resolver tests.
 *
 * Covers presence/absence per category, multiple categories independent
 * of each other, and the missing-`.deskwork/` directory case (returns
 * null without throwing).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOverrideResolver } from '../src/overrides.ts';

describe('createOverrideResolver', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-overrides-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null for every category when .deskwork/ does not exist', () => {
    // The resolver must never throw on a project that hasn't been
    // through `deskwork install` — it's queried on every studio
    // request, including ones from new project trees.
    const resolver = createOverrideResolver(root);
    expect(resolver.template('dashboard')).toBeNull();
    expect(resolver.prompt('any-prompt')).toBeNull();
    expect(resolver.doctorRule('any-rule')).toBeNull();
  });

  it('returns null for every category when .deskwork exists but the category subdir does not', () => {
    mkdirSync(join(root, '.deskwork'), { recursive: true });
    const resolver = createOverrideResolver(root);
    expect(resolver.template('dashboard')).toBeNull();
    expect(resolver.prompt('any-prompt')).toBeNull();
    expect(resolver.doctorRule('any-rule')).toBeNull();
  });

  it('returns the absolute path to a templates override when present', () => {
    const path = join(root, '.deskwork', 'templates', 'dashboard.ts');
    mkdirSync(join(root, '.deskwork', 'templates'), { recursive: true });
    writeFileSync(path, '// stub override\nexport default () => "<x/>"\n');
    const resolver = createOverrideResolver(root);
    expect(resolver.template('dashboard')).toBe(path);
  });

  it('returns the absolute path to a prompts override when present', () => {
    const path = join(root, '.deskwork', 'prompts', 'review-tone.ts');
    mkdirSync(join(root, '.deskwork', 'prompts'), { recursive: true });
    writeFileSync(path, 'export default "be kind"');
    const resolver = createOverrideResolver(root);
    expect(resolver.prompt('review-tone')).toBe(path);
  });

  it('returns the absolute path to a doctor override when present', () => {
    const path = join(root, '.deskwork', 'doctor', 'missing-frontmatter-id.ts');
    mkdirSync(join(root, '.deskwork', 'doctor'), { recursive: true });
    writeFileSync(path, 'export default { id: "missing-frontmatter-id" }');
    const resolver = createOverrideResolver(root);
    expect(resolver.doctorRule('missing-frontmatter-id')).toBe(path);
  });

  it('keeps category lookups independent — a templates override does not satisfy doctor or prompts', () => {
    // Sanity check: an operator with a templates override must not
    // accidentally short-circuit the doctor or prompts lookups even
    // when the basename is shared.
    mkdirSync(join(root, '.deskwork', 'templates'), { recursive: true });
    writeFileSync(
      join(root, '.deskwork', 'templates', 'shared.ts'),
      'export default () => "x"',
    );
    const resolver = createOverrideResolver(root);
    expect(resolver.template('shared')).not.toBeNull();
    expect(resolver.prompt('shared')).toBeNull();
    expect(resolver.doctorRule('shared')).toBeNull();
  });

  it('returns null for files without the .ts extension (only TS overrides supported)', () => {
    mkdirSync(join(root, '.deskwork', 'templates'), { recursive: true });
    writeFileSync(
      join(root, '.deskwork', 'templates', 'dashboard.js'),
      '// not picked up',
    );
    const resolver = createOverrideResolver(root);
    expect(resolver.template('dashboard')).toBeNull();
  });

  it('exposes the category directory paths regardless of existence', () => {
    const resolver = createOverrideResolver(root);
    expect(resolver.categoryDir('templates')).toBe(
      join(root, '.deskwork', 'templates'),
    );
    expect(resolver.categoryDir('prompts')).toBe(
      join(root, '.deskwork', 'prompts'),
    );
    expect(resolver.categoryDir('doctor')).toBe(
      join(root, '.deskwork', 'doctor'),
    );
  });
});
