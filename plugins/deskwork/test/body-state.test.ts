import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bodyState, PLACEHOLDER_MARKER } from '@/lib/body-state.ts';

describe('bodyState', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskwork-body-'));
    file = join(dir, 'post.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns missing when the file does not exist', () => {
    expect(bodyState(file)).toBe('missing');
  });

  it('returns placeholder for a freshly scaffolded post', () => {
    writeFileSync(
      file,
      `---\ntitle: X\n---\n\n# X\n\n${PLACEHOLDER_MARKER}\n`,
      'utf-8',
    );
    expect(bodyState(file)).toBe('placeholder');
  });

  it('returns placeholder when only the outline section has content', () => {
    writeFileSync(
      file,
      `---\ntitle: X\n---\n\n# X\n\n## Outline\n\n- a point\n- another\n\n${PLACEHOLDER_MARKER}\n`,
      'utf-8',
    );
    expect(bodyState(file)).toBe('placeholder');
  });

  it('returns written when prose lives below the outline', () => {
    writeFileSync(
      file,
      `---\ntitle: X\n---\n\n# X\n\n## Outline\n\n- point\n\n## Introduction\n\nReal prose begins here.\n`,
      'utf-8',
    );
    expect(bodyState(file)).toBe('written');
  });

  it('returns written when prose replaces the placeholder with no outline', () => {
    writeFileSync(
      file,
      `---\ntitle: X\n---\n\n# X\n\nReal prose. No outline block.\n`,
      'utf-8',
    );
    expect(bodyState(file)).toBe('written');
  });

  it('returns placeholder when the body is entirely whitespace', () => {
    writeFileSync(file, `---\ntitle: X\n---\n\n# X\n\n   \n\n`, 'utf-8');
    expect(bodyState(file)).toBe('placeholder');
  });
});
