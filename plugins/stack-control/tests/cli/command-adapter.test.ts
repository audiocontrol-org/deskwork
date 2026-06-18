// Unit coverage for the typed parser-adapter boundary (027 T002 hardening).
// Public-contract module → both happy path AND error shapes are covered
// (.claude/rules/testing.md). Includes the inherited-global-option regression
// for AUDIT-BARRAGE-codex-02 (rawOpts must expose parent/global flags, not just
// the command's local opts).

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  rawOpts,
  stringOption,
  booleanOption,
  optionalStringOption,
  CommandAdapterError,
} from '../../src/cli-help/command-adapter.js';

describe('command-adapter readers — happy path', () => {
  it('stringOption returns a present non-empty string', () => {
    expect(stringOption('hello', 'flag')).toBe('hello');
  });

  it('booleanOption maps undefined→false, true→true, false→false', () => {
    expect(booleanOption(undefined, 'apply')).toBe(false);
    expect(booleanOption(true, 'apply')).toBe(true);
    // commander emits `false` for a negated `--no-*` flag — must pass through.
    expect(booleanOption(false, 'apply')).toBe(false);
  });

  it('optionalStringOption returns undefined when unset, else the string', () => {
    expect(optionalStringOption(undefined, 'scope')).toBeUndefined();
    expect(optionalStringOption('x', 'scope')).toBe('x');
  });
});

describe('command-adapter readers — fail loud (no fallback)', () => {
  it('stringOption throws on a missing or non-string value', () => {
    expect(() => stringOption(undefined, 'flag')).toThrow(CommandAdapterError);
    expect(() => stringOption(undefined, 'flag')).toThrow(/--flag expects a string value \(got undefined\)/);
  });

  it('stringOption rejects an empty / whitespace-only value (AUDIT-BARRAGE-claude-02)', () => {
    expect(() => stringOption('', 'doc')).toThrow(/--doc expects a non-empty string value \(got empty\)/);
    expect(() => stringOption('   ', 'doc')).toThrow(/non-empty/);
  });

  it('booleanOption throws on a non-boolean value', () => {
    expect(() => booleanOption('yes', 'apply')).toThrow(CommandAdapterError);
    expect(() => booleanOption('yes', 'apply')).toThrow(/--apply is a boolean flag \(got string\)/);
  });

  it('optionalStringOption delegates fail-loud to stringOption when present', () => {
    expect(() => optionalStringOption(42, 'scope')).toThrow(/--scope expects a string value \(got number\)/);
    expect(() => optionalStringOption('', 'scope')).toThrow(/non-empty/);
  });

  it('describe() names null and array shapes precisely in the message', () => {
    expect(() => stringOption(null, 'flag')).toThrow(/got null/);
    expect(() => stringOption(['a'], 'flag')).toThrow(/got array/);
  });
});

describe('rawOpts — exposes inherited/global options (AUDIT-BARRAGE-codex-02)', () => {
  it('returns a parent global flag alongside the subcommand local flag', () => {
    const program = new Command();
    program.exitOverride(); // never call process.exit() inside the test
    program.option('--doc <path>', 'global doc path');
    let captured: Command | undefined;
    program
      .command('next')
      .option('--apply', 'apply flag')
      .action(function (this: Command) {
        captured = this;
      });
    program.parse(['node', 'stackctl', '--doc', '/roadmap.md', 'next', '--apply']);

    if (captured === undefined) throw new Error('subcommand action did not run');
    const opts = rawOpts(captured);
    // local option is present either way; the global `--doc` is the regression:
    // command.opts() drops it, command.optsWithGlobals() keeps it.
    expect(booleanOption(opts.apply, 'apply')).toBe(true);
    expect(stringOption(opts.doc, 'doc')).toBe('/roadmap.md');
  });
});
