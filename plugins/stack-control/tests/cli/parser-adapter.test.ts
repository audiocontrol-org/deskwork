// T003 (RED-first, 027 Phase 2 Foundational) — two contracts.
//
// (1) CHK024: the typed parser-adapter yields a fully-typed options object for a
//     sample commander command with ZERO `as`/`any`. We build a small `Command`
//     in the test, parse it, and read every flag through the adapter's scalar
//     readers into a typed local — no cast anywhere.
//
// (2) contract §exit codes: the MOUNTED roadmap command preserves the existing
//     dispatcher's error shapes — an unknown subaction → exit 2, an unknown flag
//     for a known subaction → exit 2 (asserted via the real `runCli`
//     subprocess). RED until T004 mounts roadmap onto commander with the
//     exit-code mapping; the unknown-flag-via-commander path is the new surface.

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  rawOpts,
  stringOption,
  booleanOption,
  optionalStringOption,
} from '../../src/cli-help/command-adapter.js';
import { buildRoadmapCommand } from '../../src/subcommands/roadmap-command.js';
import { KNOWN_SUBACTIONS } from '../../src/subcommands/roadmap.js';
import { unknownSubactionFlagMessage } from '../../src/subcommands/document-verb-shared.js';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { fixturePath } from '../roadmap/helpers.js';

const EXPECTED_SUBACTIONS = [
  'next', 'blocked', 'blocks', 'order', 'graph', 'add', 'advance',
  'decompose', 'reclassify', 'defer', 'reconcile', 'close-related',
] as const;

interface SampleOptions {
  readonly doc: string;
  readonly apply: boolean;
  readonly to: string | undefined;
}

function tmpChain(): string {
  const dir = mkdtempSync(join(tmpdir(), 'parser-adapter-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath('chain'), docPath);
  return docPath;
}

describe('027 T003 — typed parser-adapter yields a fully-typed options object (CHK024)', () => {
  it('reads a sample command into a typed SampleOptions with zero casts', () => {
    const program = new Command();
    program.exitOverride();
    program.option('--doc <path>', 'global doc path');
    let captured: Command | undefined;
    program
      .command('advance')
      .option('--apply', 'write the change')
      .option('--to <status>', 'target status')
      .action(function (this: Command) {
        captured = this;
      });
    program.parse(['node', 'stackctl', '--doc', '/roadmap.md', 'advance', '--to', 'in-flight', '--apply']);

    if (captured === undefined) throw new Error('subcommand action did not run');
    const raw = rawOpts(captured);
    const opts: SampleOptions = {
      doc: stringOption(raw.doc, 'doc'),
      apply: booleanOption(raw.apply, 'apply'),
      to: optionalStringOption(raw.to, 'to'),
    };
    expect(opts.doc).toBe('/roadmap.md');
    expect(opts.apply).toBe(true);
    expect(opts.to).toBe('in-flight');
  });

  it('an absent boolean reads false and an absent optional string reads undefined', () => {
    const program = new Command();
    program.exitOverride();
    program.option('--doc <path>', 'global doc path');
    let captured: Command | undefined;
    program
      .command('next')
      .option('--apply', 'write the change')
      .option('--to <status>', 'target status')
      .action(function (this: Command) {
        captured = this;
      });
    program.parse(['node', 'stackctl', '--doc', '/roadmap.md', 'next']);

    if (captured === undefined) throw new Error('subcommand action did not run');
    const raw = rawOpts(captured);
    const opts: SampleOptions = {
      doc: stringOption(raw.doc, 'doc'),
      apply: booleanOption(raw.apply, 'apply'),
      to: optionalStringOption(raw.to, 'to'),
    };
    expect(opts.apply).toBe(false);
    expect(opts.to).toBeUndefined();
  });
});

describe('027 T003 — buildRoadmapCommand mounts the full subaction set onto commander', () => {
  it('is a commander Command named "roadmap" registering all 11+1 subactions', () => {
    const cmd = buildRoadmapCommand();
    expect(cmd.name()).toBe('roadmap');
    const registered = cmd.commands.map((c) => c.name());
    for (const sub of EXPECTED_SUBACTIONS) {
      expect(registered).toContain(sub);
    }
  });

  it('declares the universal --doc flag (accepted on every subaction via globals)', () => {
    const cmd = buildRoadmapCommand();
    const hasDoc = cmd.options.some((o) => o.long === '--doc');
    expect(hasDoc).toBe(true);
  });
});

describe('027 T003 — mounted roadmap command preserves error shapes (contract §exit codes)', () => {
  it('an unknown subaction → exit 2 with the roadmap: message shape + known list (codex-01)', () => {
    const docPath = tmpChain();
    const r = runCli(['roadmap', 'frobnicate', '--doc', docPath]);
    expect(r.status).toBe(2);
    // FR-006: the mounted path must NOT leak commander's `error: unknown command`
    // — it preserves the flat dispatcher's prefix AND the known-subaction
    // discovery list, not just the exit code.
    expect(r.stderr).toContain("roadmap: unknown subaction 'frobnicate'");
    // Pin the single-sourced known-subaction discovery list verbatim, not one
    // arbitrary member (AUDIT-BARRAGE claude-03/codex-01 — avoid coupling to
    // 'reconcile' alone).
    expect(r.stderr).toContain(`(known: ${KNOWN_SUBACTIONS})`);
    // Belt-and-suspenders (AUDIT-20260619-05 / TASK-268): the single-sourced check
    // above is tautological for the LIST CONTENTS — a typo dropping a real
    // subaction from KNOWN_SUBACTIONS changes both sides in lockstep and still
    // passes. Independently pin one concrete real member so a missing-subaction
    // regression in the operator-facing discovery list is caught here.
    expect(KNOWN_SUBACTIONS).toContain('reconcile');
    expect(r.stderr).toContain('reconcile');
    expect(r.stderr).not.toContain('unknown command'); // commander's shape must not leak
  });

  it('an unknown flag for a known subaction → exit 2 with the roadmap: message shape (codex-01)', () => {
    const docPath = tmpChain();
    const r = runCli(['roadmap', 'advance', 'impl:feature/b', '--bogus', 'x', '--to', 'in-flight', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    // Pin the FULL prefixed diagnostic the test name promises (AUDIT-20260619-08 /
    // TASK-271 — the prior assertion dropped the `roadmap:` prefix while the name
    // still claimed to verify "the roadmap: message shape"), single-sourced from
    // the production builder rather than a hand-copied literal (AUDIT-20260619-06 /
    // TASK-269 — harmonizes with the known-list single-sourcing in the hunk above).
    expect(r.stderr).toContain(`roadmap: ${unknownSubactionFlagMessage('advance', 'bogus')}`);
    expect(r.stderr).not.toContain('unknown option'); // commander's shape must not leak
  });

  it('no subaction → exit 2', () => {
    expect(runCli(['roadmap']).status).toBe(2);
  });
});
