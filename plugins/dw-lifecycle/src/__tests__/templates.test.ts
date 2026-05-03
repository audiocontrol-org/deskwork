import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyTemplateOverride, resolveTemplatePath } from '../templates.js';

describe('templates', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dw-lifecycle-templates-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('resolves the built-in journal-entry template when no override exists', () => {
    const path = resolveTemplatePath(tmp, 'journal-entry');
    expect(path).toMatch(/journal-entry\.md$/);
    expect(readFileSync(path, 'utf8')).toContain('## YYYY-MM-DD: [Session Title]');
  });

  it('copies the built-in journal-entry template into the project override path', () => {
    const destination = copyTemplateOverride(tmp, 'journal-entry');
    expect(existsSync(destination)).toBe(true);
    expect(destination).toBe(join(tmp, '.dw-lifecycle/templates/journal-entry.md'));
  });

  it('resolves the project override when present', () => {
    const destination = copyTemplateOverride(tmp, 'journal-entry');
    const resolved = resolveTemplatePath(tmp, 'journal-entry');
    expect(resolved).toBe(destination);
  });

  it('refuses to overwrite an existing template override', () => {
    copyTemplateOverride(tmp, 'journal-entry');
    expect(() => copyTemplateOverride(tmp, 'journal-entry')).toThrow(/already exists/);
  });
});
