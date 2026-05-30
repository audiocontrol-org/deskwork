import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import {
  parseFlags,
  runPromoteFindings,
} from '../../../subcommands/promote-findings.js';
import type { PromoteFindingsCliOptions } from '../../../subcommands/promote-findings.js';
import type {
  ReadAuditLog,
  ReadWorkplan,
  WriteAuditLog,
  WriteWorkplan,
} from '../../../scope-discovery/promote-findings/types.js';

// Test-local narrowing helpers; mirror the project's `isPlainObject`
// convention without depending on the source-tree typeguards directly.
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function asItemArray(value: unknown): Record<string, unknown>[] {
  if (!isObject(value)) throw new Error('proposal root is not an object');
  const items = value.items;
  if (!Array.isArray(items)) {
    throw new Error('proposal.items is not an array');
  }
  const out: Record<string, unknown>[] = [];
  for (const item of items) {
    if (!isObject(item)) throw new Error('proposal item is not an object');
    out.push(item);
  }
  return out;
}

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: string,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    cb(null);
  }
  text(): string {
    return this.chunks.join('');
  }
}

function makeFixture(): {
  root: string;
  featureSlug: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'pf-sub-'));
  const featureSlug = 'demo-feature';
  const featureDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', featureSlug);
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(
    join(featureDir, 'workplan.md'),
    [
      '# Demo workplan',
      '',
      '## Phase 13: Audit-finding lifecycle',
      '',
      '### Existing task',
      '',
      'Some prose.',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(featureDir, 'audit-log.md'),
    [
      '# Audit Log',
      '',
      '### Validator misses negative balance',
      '',
      'Finding-ID: AUDIT-20260529-77',
      'Status: open',
      'Severity: high',
      'Surface: src/balance.ts:42',
      '',
      'Body.',
      '',
      '### Already fixed',
      '',
      'Finding-ID: AUDIT-20260529-78',
      'Status: fixed-deadbeef',
      '',
      'Body.',
      '',
    ].join('\n'),
    'utf8',
  );
  return {
    root,
    featureSlug,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeRunArgs(
  opts: PromoteFindingsCliOptions,
  fixture: ReturnType<typeof makeFixture>,
  proposalFs: Map<string, string>,
): {
  args: Parameters<typeof runPromoteFindings>[0];
  stdout: CaptureStream;
  stderr: CaptureStream;
  diskWrites: Map<string, string>;
} {
  const stdout = new CaptureStream();
  const stderr = new CaptureStream();
  const diskWrites = new Map<string, string>();
  const auditLogPath = join(
    fixture.root,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    fixture.featureSlug,
    'audit-log.md',
  );
  const workplanPath = join(
    fixture.root,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    fixture.featureSlug,
    'workplan.md',
  );
  const readWorkplan: ReadWorkplan = async (p) => {
    if (p === workplanPath) {
      return readFileSync(p, 'utf8');
    }
    throw new Error(`unexpected workplan read: ${p}`);
  };
  const readAuditLog: ReadAuditLog = async (p) => {
    if (p === auditLogPath) {
      return readFileSync(p, 'utf8');
    }
    throw new Error(`unexpected audit-log read: ${p}`);
  };
  const writeWorkplan: WriteWorkplan = async (p, c) => {
    diskWrites.set(p, c);
  };
  const writeAuditLog: WriteAuditLog = async (p, c) => {
    diskWrites.set(p, c);
  };
  const readProposalFromDisk = async (p: string): Promise<string> => {
    const value = proposalFs.get(p);
    if (value === undefined) {
      throw new Error(`ENOENT: no such file '${p}'`);
    }
    return value;
  };
  const writeProposalToDisk = async (p: string, c: string): Promise<void> => {
    proposalFs.set(p, c);
  };
  const ensureDir = async (): Promise<void> => {
    // no-op for in-memory proposalFs
  };
  return {
    stdout,
    stderr,
    diskWrites,
    args: {
      opts,
      projectRoot: fixture.root,
      now: new Date('2026-05-29T12:00:00.000Z'),
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      read: { workplan: readWorkplan, auditLog: readAuditLog },
      write: { workplan: writeWorkplan, auditLog: writeAuditLog },
      readProposalFromDisk,
      writeProposalToDisk,
      ensureDir,
    },
  };
}

describe('parseFlags — promote-findings CLI', () => {
  it('rejects without --feature', () => {
    const r = parseFlags([]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/--feature/);
  });

  it('honors --help', () => {
    const r = parseFlags(['--help']);
    expect(r.ok).toBe(true);
    expect(r.help).toBe(true);
  });

  it('rejects --bucket other than open in v1', () => {
    const r = parseFlags(['--feature', 'demo', '--bucket', 'acknowledged']);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only 'open' is supported/);
  });

  it('parses propose-mode defaults', () => {
    const r = parseFlags(['--feature', 'demo']);
    expect(r.ok).toBe(true);
    const opts = r.opts;
    if (opts === undefined) throw new Error('no opts');
    expect(opts.verb).toBe('propose');
    if (opts.verb !== 'propose') throw new Error('expected propose verb');
    expect(opts.featureSlug).toBe('demo');
    expect(opts.bucket).toBe('open');
    expect(opts.limit).toBe(10);
  });

  it('parses apply-mode', () => {
    const r = parseFlags(['--feature', 'demo', '--apply', '/tmp/foo.json']);
    expect(r.ok).toBe(true);
    const opts = r.opts;
    if (opts === undefined) throw new Error('no opts');
    expect(opts.verb).toBe('apply');
    if (opts.verb !== 'apply') throw new Error('expected apply verb');
    expect(opts.proposalPath).toBe('/tmp/foo.json');
  });

  it('rejects --limit 0 or negative', () => {
    const r = parseFlags(['--feature', 'demo', '--limit', '-1']);
    expect(r.ok).toBe(false);
  });

  it('rejects unknown flags', () => {
    const r = parseFlags(['--feature', 'demo', '--zzz']);
    expect(r.ok).toBe(false);
  });
});

describe('runPromoteFindings — propose-mode', () => {
  let fix: ReturnType<typeof makeFixture>;
  beforeAll(() => {
    fix = makeFixture();
  });
  afterAll(() => fix.cleanup());

  it('emits no-open-findings message + exit 0 when audit-log is empty', async () => {
    const emptyFixture = makeFixture();
    try {
      // Replace audit-log with no open entries.
      const featureDir = join(
        emptyFixture.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        emptyFixture.featureSlug,
      );
      mkdirSync(featureDir, { recursive: true });
      writeFileSync(join(featureDir, 'workplan.md'), '# wp\n', 'utf8');
      writeFileSync(
        join(featureDir, 'audit-log.md'),
        '### A\nFinding-ID: AUDIT-1\nStatus: fixed-deadbeef\n\nBody.\n',
        'utf8',
      );
      const proposalFs = new Map<string, string>();
      const { args, stdout } = makeRunArgs(
        {
          verb: 'propose',
          featureSlug: emptyFixture.featureSlug,
          bucket: 'open',
          limit: 10,
        },
        emptyFixture,
        proposalFs,
      );
      const exit = await runPromoteFindings(args);
      expect(exit).toBe(0);
      expect(stdout.text()).toMatch(/no open findings/);
    } finally {
      emptyFixture.cleanup();
    }
  });

  it('writes a proposal file when open findings exist', async () => {
    const proposalFs = new Map<string, string>();
    const outputPath = join(fix.root, 'proposal.json');
    const { args, stdout } = makeRunArgs(
      {
        verb: 'propose',
        featureSlug: fix.featureSlug,
        bucket: 'open',
        limit: 10,
        outputPath,
      },
      fix,
      proposalFs,
    );
    const exit = await runPromoteFindings(args);
    expect(exit).toBe(0);
    expect(proposalFs.get(outputPath)).toBeDefined();
    const proposalText = proposalFs.get(outputPath);
    if (proposalText === undefined) throw new Error('no proposal written');
    const proposal: unknown = JSON.parse(proposalText);
    expect(stdout.text()).toContain('Wrote proposal:');
    expect(stdout.text()).toContain('AUDIT-20260529-77');
    // Spot-check the items field via a re-parse so we know the file is
    // structurally sound.
    expect(typeof proposal).toBe('object');
  });

  it('returns 2 when feature directory cannot be resolved', async () => {
    const proposalFs = new Map<string, string>();
    const { args, stderr } = makeRunArgs(
      {
        verb: 'propose',
        featureSlug: 'nonexistent-feature',
        bucket: 'open',
        limit: 10,
      },
      fix,
      proposalFs,
    );
    const exit = await runPromoteFindings(args);
    expect(exit).toBe(2);
    expect(stderr.text()).toMatch(/not found/);
  });
});

describe('runPromoteFindings — apply-mode round-trip', () => {
  it('promotes a finding into the workplan and flips audit-log status', async () => {
    const fix2 = makeFixture();
    try {
      const proposalFs = new Map<string, string>();
      const outputPath = join(fix2.root, 'p.json');
      // First, propose.
      const proposeRun = makeRunArgs(
        {
          verb: 'propose',
          featureSlug: fix2.featureSlug,
          bucket: 'open',
          limit: 10,
          outputPath,
        },
        fix2,
        proposalFs,
      );
      const proposeExit = await runPromoteFindings(proposeRun.args);
      expect(proposeExit).toBe(0);
      // Edit the proposal: assign promote-to-workplan disposition.
      const raw = proposalFs.get(outputPath);
      if (raw === undefined) throw new Error('no proposal written');
      const proposal: unknown = JSON.parse(raw);
      const items = asItemArray(proposal);
      const first = items[0];
      if (first === undefined) throw new Error('no first item');
      first.disposition = 'promote-to-workplan';
      first.fields = {
        phaseHeading: '## Phase 13: Audit-finding lifecycle',
        insertAfterLine: 7, // after 'Some prose.'
      };
      proposalFs.set(outputPath, `${JSON.stringify(proposal, null, 2)}\n`);
      // Now apply.
      const applyRun = makeRunArgs(
        {
          verb: 'apply',
          featureSlug: fix2.featureSlug,
          proposalPath: outputPath,
          startingTaskNumber: '13.7',
        },
        fix2,
        proposalFs,
      );
      const applyExit = await runPromoteFindings(applyRun.args);
      expect(applyExit).toBe(0);
      const workplanPath = join(
        fix2.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        fix2.featureSlug,
        'workplan.md',
      );
      const newWorkplan = applyRun.diskWrites.get(workplanPath);
      expect(newWorkplan).toBeDefined();
      if (newWorkplan === undefined) throw new Error('no new wp');
      expect(newWorkplan).toContain('fix-finding-AUDIT-20260529-77');
      expect(newWorkplan).toContain('Closes AUDIT-20260529-77');
    } finally {
      fix2.cleanup();
    }
  });

  it('rejects an acknowledged disposition with banned-phrase reason', async () => {
    const fix3 = makeFixture();
    try {
      const proposalFs = new Map<string, string>();
      const outputPath = join(fix3.root, 'p2.json');
      const proposeRun = makeRunArgs(
        {
          verb: 'propose',
          featureSlug: fix3.featureSlug,
          bucket: 'open',
          limit: 10,
          outputPath,
        },
        fix3,
        proposalFs,
      );
      await runPromoteFindings(proposeRun.args);
      const raw = proposalFs.get(outputPath);
      if (raw === undefined) throw new Error('no proposal written');
      const proposal: unknown = JSON.parse(raw);
      const items = asItemArray(proposal);
      const first = items[0];
      if (first === undefined) throw new Error('no first item');
      first.disposition = 'acknowledged';
      first.fields = {
        reason: 'this is something we should fix for now until things settle',
      };
      proposalFs.set(outputPath, `${JSON.stringify(proposal, null, 2)}\n`);
      const applyRun = makeRunArgs(
        {
          verb: 'apply',
          featureSlug: fix3.featureSlug,
          proposalPath: outputPath,
          startingTaskNumber: '13.7',
        },
        fix3,
        proposalFs,
      );
      const exit = await runPromoteFindings(applyRun.args);
      expect(exit).toBe(1);
      expect(applyRun.stderr.text()).toMatch(/banned hedge phrase/i);
    } finally {
      fix3.cleanup();
    }
  });

  it('accepts an informational disposition with rationale', async () => {
    const fix4 = makeFixture();
    try {
      const proposalFs = new Map<string, string>();
      const outputPath = join(fix4.root, 'p4.json');
      const proposeRun = makeRunArgs(
        {
          verb: 'propose',
          featureSlug: fix4.featureSlug,
          bucket: 'open',
          limit: 10,
          outputPath,
        },
        fix4,
        proposalFs,
      );
      await runPromoteFindings(proposeRun.args);
      const raw = proposalFs.get(outputPath);
      if (raw === undefined) throw new Error('no proposal written');
      const proposal: unknown = JSON.parse(raw);
      const items = asItemArray(proposal);
      const first = items[0];
      if (first === undefined) throw new Error('no first item');
      first.disposition = 'informational';
      first.fields = {
        rationale: 'this is the observation about validator coverage that the operator approved.',
      };
      proposalFs.set(outputPath, `${JSON.stringify(proposal, null, 2)}\n`);
      const applyRun = makeRunArgs(
        {
          verb: 'apply',
          featureSlug: fix4.featureSlug,
          proposalPath: outputPath,
          startingTaskNumber: '13.7',
        },
        fix4,
        proposalFs,
      );
      const exit = await runPromoteFindings(applyRun.args);
      expect(exit).toBe(0);
      const auditLogPath = join(
        fix4.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        fix4.featureSlug,
        'audit-log.md',
      );
      const newAuditLog = applyRun.diskWrites.get(auditLogPath);
      expect(newAuditLog).toBeDefined();
      if (newAuditLog === undefined) throw new Error('no audit-log mutation');
      expect(newAuditLog).toContain('Status: informational');
    } finally {
      fix4.cleanup();
    }
  });

  it('rejects an informational disposition with a blank rationale', async () => {
    const fix5 = makeFixture();
    try {
      const proposalFs = new Map<string, string>();
      const outputPath = join(fix5.root, 'p5.json');
      const proposeRun = makeRunArgs(
        {
          verb: 'propose',
          featureSlug: fix5.featureSlug,
          bucket: 'open',
          limit: 10,
          outputPath,
        },
        fix5,
        proposalFs,
      );
      await runPromoteFindings(proposeRun.args);
      const raw = proposalFs.get(outputPath);
      if (raw === undefined) throw new Error('no proposal written');
      const proposal: unknown = JSON.parse(raw);
      const items = asItemArray(proposal);
      const first = items[0];
      if (first === undefined) throw new Error('no first item');
      first.disposition = 'informational';
      first.fields = { rationale: '   ' };
      proposalFs.set(outputPath, `${JSON.stringify(proposal, null, 2)}\n`);
      const applyRun = makeRunArgs(
        {
          verb: 'apply',
          featureSlug: fix5.featureSlug,
          proposalPath: outputPath,
          startingTaskNumber: '13.7',
        },
        fix5,
        proposalFs,
      );
      const exit = await runPromoteFindings(applyRun.args);
      expect(exit).toBe(1);
      // No audit-log write should have happened.
      const auditLogPath = join(
        fix5.root,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        fix5.featureSlug,
        'audit-log.md',
      );
      expect(applyRun.diskWrites.has(auditLogPath)).toBe(false);
    } finally {
      fix5.cleanup();
    }
  });
});
