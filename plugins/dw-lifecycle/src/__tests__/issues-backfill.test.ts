import { describe, it, expect } from 'vitest';
import { backfillParentIssue } from '../subcommands/issues.js';

describe('backfillParentIssue (#213)', () => {
  it('replaces a literal <parentIssue> template token', () => {
    const input = '---\nslug: foo\nparentIssue: <parentIssue>\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toContain('parentIssue: "#42"');
    expect(out).not.toContain('<parentIssue>');
  });

  it('replaces a "TBD" placeholder (the form scaffolded by /dw-lifecycle:setup)', () => {
    const input = '---\nslug: foo\nparentIssue: TBD\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toContain('parentIssue: "#42"');
    expect(out).not.toContain('TBD');
  });

  it('replaces an empty value', () => {
    const input = '---\nslug: foo\nparentIssue:\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toContain('parentIssue: "#42"');
  });

  it('replaces a null value', () => {
    const input = '---\nslug: foo\nparentIssue: null\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toContain('parentIssue: "#42"');
    expect(out).not.toMatch(/parentIssue: null/);
  });

  it('replaces an existing quoted issue reference (re-run case)', () => {
    const input = '---\nslug: foo\nparentIssue: "#10"\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toContain('parentIssue: "#42"');
    expect(out).not.toContain('"#10"');
  });

  it('returns input unchanged when frontmatter has no parentIssue field (caller warns)', () => {
    const input = '---\nslug: foo\ntitle: bar\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toBe(input);
  });

  it('returns input unchanged when there is no frontmatter block', () => {
    const input = '# body only\nparentIssue: TBD\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toBe(input);
  });

  it('does not touch a parentIssue line in body content', () => {
    const input =
      '---\nslug: foo\ntitle: bar\n---\n\nThe parent issue field looks like:\nparentIssue: TBD\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toBe(input);
  });

  it('preserves indentation and other frontmatter keys', () => {
    const input =
      '---\nslug: foo\nparentIssue: TBD\nphases:\n  - one\n  - two\n---\n# body\n';
    const out = backfillParentIssue(input, 42);
    expect(out).toContain('phases:\n  - one\n  - two');
    expect(out).toContain('parentIssue: "#42"');
    expect(out).toMatch(/^---\n/);
    expect(out).toContain('\n---\n');
  });
});
