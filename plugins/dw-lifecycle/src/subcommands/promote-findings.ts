/**
 * plugins/dw-lifecycle/src/subcommands/promote-findings.ts
 *
 * CLI shell for `/dw-lifecycle:promote-findings`. Mirrors
 * `subcommands/promote-deferrals.ts` — two verbs (propose, apply) sharing
 * a top-level `--feature <slug>` selector, an all-or-nothing pre-validation
 * gate on apply, and partial-success outcome reporting.
 *
 * Default invocation (no `--apply`) is propose-mode: walk the feature's
 * audit-log for `Status: open` entries, write a JSON proposal file with
 * one item per finding (each item's `disposition` + `fields` is null),
 * emit a markdown table of the findings + the proposal path to stdout,
 * exit 0.
 *
 * Apply-mode (`--apply <path>`): read the operator-filled proposal,
 * validate every item (non-null disposition + non-null fields +
 * substantive-reason validator pass for acknowledged items), then run
 * the workplan inserts + audit-log status flips atomically.
 *
 * The verb pair intentionally mirrors promote-deferrals's protocol so
 * the operator's mental model carries between hygiene + scope-discovery.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { repoRoot } from '../repo.js';
import { walkOpenFindings } from '../scope-discovery/promote-findings/audit-log-walker.js';
import {
  makeProposalFile,
  parseProposalFile,
  InvalidProposalFileError,
} from '../scope-discovery/promote-findings/proposal-file.js';
import { applyProposal, ApplyProposalError } from '../scope-discovery/promote-findings/apply.js';
import { applyStatusFlips } from '../scope-discovery/promote-findings/audit-log-editor.js';
import {
  AutoPositionError,
  collectAllTaskIds,
  computeAutoPosition,
  findDuplicateTaskHeadings,
  nextTaskNumberFactory,
} from '../scope-discovery/promote-findings/auto-position.js';
import type {
  OpenFinding,
  ProposalFile,
  ProposalItem,
  ReadAuditLog,
  ReadWorkplan,
  WriteAuditLog,
  WriteWorkplan,
} from '../scope-discovery/promote-findings/types.js';

const USAGE = [
  'Usage: dw-lifecycle promote-findings',
  '    --feature <slug>',
  '    [--repo-root <path>]',
  '    [--bucket <name>]',
  '    [--limit <N>]',
  '    [--apply <proposal-path>]',
  '    [--auto]',
  '    [--output <path>]',
  '    [--task-number <N.M>]',
  '    [--help]',
  '',
  '--feature <slug>      The feature slug. Resolves the audit-log at',
  '                      docs/<v>/001-IN-PROGRESS/<slug>/audit-log.md and',
  '                      the workplan at docs/<v>/001-IN-PROGRESS/<slug>/workplan.md.',
  '--repo-root <path>    Project root. Default: cwd.',
  '--bucket <name>       Status bucket. v1 only supports `open`. Default: open.',
  '--limit <N>           Cap the proposal batch size. Default: 10.',
  '--apply <path>        Apply a previously-written proposal file. When omitted,',
  '                      runs in propose-mode (writes a fresh proposal file).',
  '--auto                Apply WITHOUT a proposal-file roundtrip: all findings get',
  '                      disposition=promote-to-workplan with insertAfterLine',
  '                      auto-computed as "just before the first unchecked',
  '                      workplan task" so the workplan-aware gate opens on next',
  '                      pickup. Used by the /dw-lifecycle:implement end-of-task',
  '                      audit-barrage hook (Phase 15). Mutually exclusive with',
  '                      --apply <path>.',
  '--output <path>       Override the propose-mode output path.',
  '--task-number <N.M>   Starting task-number for the renderer. Default: 13.1.',
  '                      Each subsequent promote-to-workplan item increments the',
  '                      minor segment by 1 (13.1, 13.2, 13.3, ...). Ignored in',
  '                      --auto mode (auto-derives <phase>.<currentMax+1> instead).',
  '',
].join('\n');

export interface ProposeOptions {
  readonly verb: 'propose';
  readonly featureSlug: string;
  readonly repoRoot?: string;
  readonly bucket: 'open';
  readonly limit: number;
  readonly outputPath?: string;
}

export interface ApplyOptions {
  readonly verb: 'apply';
  readonly featureSlug: string;
  readonly repoRoot?: string;
  readonly proposalPath: string;
  readonly startingTaskNumber: string;
}

export interface AutoApplyOptions {
  readonly verb: 'auto-apply';
  readonly featureSlug: string;
  readonly repoRoot?: string;
  readonly bucket: 'open';
  readonly limit: number;
}

export type PromoteFindingsCliOptions = ProposeOptions | ApplyOptions | AutoApplyOptions;

export interface ParseResult {
  readonly ok: boolean;
  readonly opts?: PromoteFindingsCliOptions;
  readonly help?: boolean;
  readonly error?: string;
}

const VALUED_FLAGS: ReadonlySet<string> = new Set([
  '--feature',
  '--repo-root',
  '--bucket',
  '--limit',
  '--apply',
  '--output',
  '--task-number',
]);

export function parseFlags(argv: ReadonlyArray<string>): ParseResult {
  let featureSlug: string | undefined;
  let repoRootOverride: string | undefined;
  let bucket: string = 'open';
  let limit = 10;
  let applyPath: string | undefined;
  let outputPath: string | undefined;
  let startingTaskNumber = '13.1';
  let auto = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { ok: true, help: true };
    if (flag === undefined) {
      return { ok: false, error: 'unexpected empty flag' };
    }
    if (flag === '--auto') {
      auto = true;
      continue;
    }
    if (VALUED_FLAGS.has(flag)) {
      const value = argv[i + 1];
      if (value === undefined) {
        return { ok: false, error: `${flag} requires a value` };
      }
      i += 1;
      if (flag === '--feature') featureSlug = value;
      else if (flag === '--repo-root') repoRootOverride = value;
      else if (flag === '--bucket') bucket = value;
      else if (flag === '--limit') {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { ok: false, error: `--limit must be a positive integer (got '${value}')` };
        }
        limit = parsed;
      } else if (flag === '--apply') applyPath = value;
      else if (flag === '--output') outputPath = value;
      else if (flag === '--task-number') startingTaskNumber = value;
      continue;
    }
    return { ok: false, error: `unknown arg: ${flag}` };
  }
  if (featureSlug === undefined) {
    return { ok: false, error: '--feature is required.' };
  }
  if (bucket !== 'open') {
    return {
      ok: false,
      error: `--bucket '${bucket}' is not supported in v1 (only 'open' is supported); see Phase 13 PRD for future-bucket plans.`,
    };
  }
  if (auto && applyPath !== undefined) {
    return {
      ok: false,
      error: '--auto and --apply are mutually exclusive; --auto skips the proposal-file roundtrip entirely.',
    };
  }
  if (auto) {
    const base: AutoApplyOptions = {
      verb: 'auto-apply',
      featureSlug,
      bucket: 'open',
      limit,
    };
    return {
      ok: true,
      opts: repoRootOverride !== undefined ? { ...base, repoRoot: repoRootOverride } : base,
    };
  }
  if (applyPath !== undefined) {
    const base: ApplyOptions = {
      verb: 'apply',
      featureSlug,
      proposalPath: applyPath,
      startingTaskNumber,
    };
    return {
      ok: true,
      opts: repoRootOverride !== undefined ? { ...base, repoRoot: repoRootOverride } : base,
    };
  }
  const base: ProposeOptions = {
    verb: 'propose',
    featureSlug,
    bucket: 'open',
    limit,
  };
  let opts: ProposeOptions = base;
  if (repoRootOverride !== undefined) opts = { ...opts, repoRoot: repoRootOverride };
  if (outputPath !== undefined) opts = { ...opts, outputPath };
  return { ok: true, opts };
}

function resolveFeatureRoot(rootDir: string, slug: string): string | null {
  // Look under docs/<v>/001-IN-PROGRESS/<slug>/. We try each `docs/*/`
  // directory in turn — feature documentation conventionally lives
  // under one of `docs/1.0/`, `docs/0.x/`, etc.
  const docsRoot = join(rootDir, 'docs');
  if (!existsSync(docsRoot)) return null;
  // We don't readdir here to avoid an extra abstraction; instead, we
  // hard-code the canonical path and a small fallback list. If the
  // first path matches, we use it; if not, the explicit error is the
  // signal.
  const candidates = [
    join(docsRoot, '1.0', '001-IN-PROGRESS', slug),
    join(docsRoot, '0.x', '001-IN-PROGRESS', slug),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export interface RunOptions {
  readonly opts: PromoteFindingsCliOptions;
  readonly projectRoot: string;
  readonly now: Date;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly read: {
    readonly workplan: ReadWorkplan;
    readonly auditLog: ReadAuditLog;
  };
  readonly write: {
    readonly workplan: WriteWorkplan;
    readonly auditLog: WriteAuditLog;
  };
  readonly readProposalFromDisk: (path: string) => Promise<string>;
  readonly writeProposalToDisk: (path: string, content: string) => Promise<void>;
  readonly ensureDir: (path: string) => Promise<void>;
}

function defaultOutputPath(projectRoot: string, slug: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
  return join(
    projectRoot,
    '.dw-lifecycle',
    'scope-discovery',
    'promote-findings',
    'proposals',
    `${stamp}-${slug}.json`,
  );
}

function buildTaskNumberFor(starting: string): (item: ProposalItem, idx: number) => string {
  const match = /^(\d+)\.(\d+)$/.exec(starting);
  if (match === null) {
    throw new Error(
      `--task-number '${starting}' must be in '<phase>.<minor>' shape (e.g. '13.7').`,
    );
  }
  const phase = Number.parseInt(match[1] ?? '0', 10);
  const minor = Number.parseInt(match[2] ?? '0', 10);
  // For each promote-to-workplan item (by zero-based index in the
  // overall items list), emit `phase.(minor + N)`. Non-promote items
  // still receive a number but it isn't used by the renderer.
  return (_item, idx) => `${phase}.${minor + idx}`;
}

function renderProposalTable(items: readonly ProposalItem[]): string {
  const header = [
    '| # | Finding-ID | Severity | Surface | Heading |',
    '|---|---|---|---|---|',
  ];
  const rows = items.map((item, idx) => {
    const f = item.finding;
    const severity = f.severity ?? '_(none)_';
    const surface = (f.surface ?? '_(none)_').replace(/\|/g, '\\|');
    const heading = f.heading.replace(/\|/g, '\\|').slice(0, 120);
    return `| ${idx + 1} | ${f.findingId} | ${severity} | ${surface} | ${heading} |`;
  });
  return [...header, ...rows].join('\n');
}

export async function runPromoteFindings(args: RunOptions): Promise<number> {
  const { opts, projectRoot, now, stdout, stderr } = args;
  const featureRoot = resolveFeatureRoot(projectRoot, opts.featureSlug);
  if (featureRoot === null) {
    stderr.write(
      `promote-findings: feature '${opts.featureSlug}' not found under docs/*/001-IN-PROGRESS/.\n`,
    );
    return 2;
  }
  const auditLogPath = join(featureRoot, 'audit-log.md');
  const workplanPath = join(featureRoot, 'workplan.md');

  if (opts.verb === 'propose') {
    const findings = await walkOpenFindings({
      auditLogPath,
      featureSlug: opts.featureSlug,
    });
    if (findings.length === 0) {
      stdout.write(
        `promote-findings: no open findings on feature ${opts.featureSlug}\n`,
      );
      return 0;
    }
    const cappedFindings: readonly OpenFinding[] = findings.slice(0, opts.limit);
    const proposal = makeProposalFile({
      featureSlug: opts.featureSlug,
      auditLogPath,
      workplanPath,
      findings: cappedFindings,
      now,
    });
    const outPath = opts.outputPath ?? defaultOutputPath(projectRoot, opts.featureSlug, now);
    await args.ensureDir(dirname(outPath));
    await args.writeProposalToDisk(outPath, `${JSON.stringify(proposal, null, 2)}\n`);
    stdout.write(`Wrote proposal: ${outPath}\n`);
    stdout.write(`Feature: ${opts.featureSlug}\n`);
    stdout.write(`Items: ${cappedFindings.length}`);
    if (cappedFindings.length < findings.length) {
      stdout.write(` (capped from ${findings.length}; pass --limit to widen)`);
    }
    stdout.write('\n\n');
    stdout.write(renderProposalTable(proposal.items));
    stdout.write('\n');
    return 0;
  }

  if (opts.verb === 'auto-apply') {
    const findings = await walkOpenFindings({
      auditLogPath,
      featureSlug: opts.featureSlug,
    });
    if (findings.length === 0) {
      stdout.write(
        `promote-findings --auto: no open findings on feature ${opts.featureSlug}; nothing to scope.\n`,
      );
      return 0;
    }
    let workplanText: string;
    try {
      workplanText = await args.read.workplan(workplanPath);
    } catch (err) {
      stderr.write(
        `promote-findings --auto: cannot read workplan at ${workplanPath}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
    // Per Issue #377: filter out findings already scoped in the
    // workplan BEFORE applying the slice cap. Pre-fix `slice(0, limit)`
    // ran on the full set in audit-log file order (oldest-first);
    // newly-lifted findings at the audit-log tail got dropped past the
    // cap while already-scoped findings filled the limit + got
    // de-duped by workplan-editor's `findingsAlreadyInserted`. The
    // /dwi audit-barrage hook's auto-promote step then silently
    // no-op'd the scoping of NEW findings.
    const FIX_FINDING_MARKER_RE = /\bfix-finding-(AUDIT-\d{8}-\d+)/g;
    const alreadyScoped = new Set<string>();
    for (const m of workplanText.matchAll(FIX_FINDING_MARKER_RE)) {
      if (m[1] !== undefined) alreadyScoped.add(m[1]);
    }
    const CANONICAL_AUDIT_ID_RE = /\bAUDIT-\d{8}-\d+/;
    const canonicalOf = (id: string): string =>
      CANONICAL_AUDIT_ID_RE.exec(id)?.[0] ?? id;
    // Phase 19 Tasks 5.110/5.111 (fix-finding-AUDIT-20260601-76/77):
    // informational findings record positive signals (clean release,
    // passing invariant) — not bugs. Two-part disposition:
    //
    //   1. Filter them out of `newFindings` so they're not scoped as
    //      code-defect fix-tasks (the rendered "write a failing test"
    //      template makes no sense for an absence-of-a-defect entry).
    //
    //   2. Auto-flip their Status from `open` to
    //      `acknowledged-informational-<YYYY-MM-DD>` so
    //      `walkOpenFindings` stops returning them and the
    //      workplan-aware gate no longer sees them as unscoped
    //      open findings. AUDIT-77 documents what happens if (2)
    //      is omitted: the gate refuses forever (`missingIds`
    //      permanently non-empty), and the refusal message points
    //      at `promote-findings --apply` which is the verb that
    //      filtered them out — an undocumented hand-edit of the
    //      audit-log is the only escape.
    //
    // HIGH/MEDIUM/LOW Status entries are NEVER auto-flipped — those
    // findings require an explicit task → commit cycle to leave
    // `open` (Option D regression-lock).
    const informationalFindings = findings.filter(
      (f) =>
        !alreadyScoped.has(canonicalOf(f.findingId)) &&
        (f.severity ?? '').toLowerCase() === 'informational',
    );
    const newFindings = findings.filter(
      (f) =>
        !alreadyScoped.has(canonicalOf(f.findingId)) &&
        (f.severity ?? '').toLowerCase() !== 'informational',
    );
    if (informationalFindings.length > 0) {
      const today = now.toISOString().slice(0, 10);
      const informationalStatus = `acknowledged-informational-${today}`;
      try {
        await applyStatusFlips({
          auditLogPath,
          flips: informationalFindings.map((f) => ({
            findingId: f.findingId,
            newStatus: informationalStatus,
          })),
          read: args.read.auditLog,
          write: args.write.auditLog,
        });
      } catch (err) {
        stderr.write(
          `promote-findings --auto: failed to flip informational findings: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return 1;
      }
      stdout.write(
        `Auto-flipped: ${informationalFindings.length} informational finding(s) to ${informationalStatus}.\n`,
      );
    }
    if (newFindings.length === 0) {
      stdout.write(
        `promote-findings --auto: no new findings to scope on feature ${opts.featureSlug} (${findings.length} open finding(s) already scoped in workplan).\n`,
      );
      return 0;
    }
    const cappedFindings: readonly OpenFinding[] = newFindings.slice(0, opts.limit);
    let position;
    try {
      position = computeAutoPosition(workplanText);
    } catch (err) {
      if (err instanceof AutoPositionError) {
        stderr.write(`promote-findings --auto: ${err.message}\n`);
        return 2;
      }
      throw err;
    }
    const proposal: ProposalFile = {
      ...makeProposalFile({
        featureSlug: opts.featureSlug,
        auditLogPath,
        workplanPath,
        findings: cappedFindings,
        now,
      }),
      items: cappedFindings.map((finding) => ({
        finding,
        disposition: 'promote-to-workplan',
        fields: {
          phaseHeading: position.phaseHeading,
          insertAfterLine: position.insertAfterLine,
        },
        applied: null,
        apply_error: null,
        result: null,
      })),
    };
    // Phase 29 / #420: defensive collision-avoidance. Pass the global
    // set of every Task ID present in the workplan (live + archived
    // ledger ranges) so `nextTaskNumberFactory` forward-walks past any
    // pre-existing ID the per-phase scanner can miss (e.g. a task
    // misplaced under another phase's heading).
    //
    // Post-AUDIT-20260606-04: surface ledger-range drop warnings on
    // stderr so the operator sees malformed/mixed-form ranges that
    // could leave archived IDs re-issuable.
    const takenIds = collectAllTaskIds(workplanText, (m) =>
      stderr.write(`promote-findings --auto: ${m}\n`),
    );
    let result;
    try {
      result = await applyProposal({
        proposal,
        featureSlug: opts.featureSlug,
        read: args.read,
        write: args.write,
        taskNumberFor: nextTaskNumberFactory(position, takenIds),
      });
    } catch (err) {
      if (err instanceof ApplyProposalError) {
        stderr.write(`promote-findings --auto: ${err.message}\n`);
        return 1;
      }
      throw err;
    }
    // Phase 29 / #420: post-write assertion + AUDIT-03 atomic-rollback.
    // Re-read the workplan after applyProposal writes. If the write
    // introduced any new duplicate `### Task X.Y` heading (post-write
    // dups not already present pre-write), restore the pre-write
    // content from `workplanText` (buffered before the write) so the
    // failure is atomic — the corrupted state never lingers on disk.
    // Pre-existing dups don't trigger rollback (they survive the
    // restore unchanged).
    if (result.workplanWritten) {
      const preDups = new Set(findDuplicateTaskHeadings(workplanText));
      const postWorkplan = await args.read.workplan(workplanPath);
      const postDups = findDuplicateTaskHeadings(postWorkplan);
      const newDups = postDups.filter((id) => !preDups.has(id));
      if (newDups.length > 0) {
        // Atomic rollback per AUDIT-20260606-03: rewrite the original
        // workplan content captured before applyProposal ran.
        await args.write.workplan(workplanPath, workplanText);
        stderr.write(
          `promote-findings --auto: post-write check detected NEW duplicate task headings in workplan: ${newDups.join(', ')}. ` +
            `Workplan restored to its pre-apply content; no disk mutation persists. ` +
            `Re-run after investigating the auto-positioner's seek logic for the IDs that collided.\n`,
        );
        return 1;
      }
    }
    stdout.write(
      `Auto-applied: ${result.outcomes.filter((o) => o.applied).length} finding(s) at ${position.phaseHeading} (line ${position.insertAfterLine}).\n`,
    );
    for (const outcome of result.outcomes) {
      if (outcome.applied && outcome.result !== null) {
        stdout.write(
          `  Item ${outcome.itemIndex} (${outcome.findingId}): ${outcome.result}\n`,
        );
      }
    }
    return 0;
  }

  // apply mode
  let proposalText: string;
  try {
    proposalText = await args.readProposalFromDisk(opts.proposalPath);
  } catch (err) {
    stderr.write(
      `promote-findings: cannot read proposal at ${opts.proposalPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  let proposal: ProposalFile;
  try {
    const parsed: unknown = JSON.parse(proposalText);
    proposal = parseProposalFile(parsed);
  } catch (err) {
    if (err instanceof InvalidProposalFileError) {
      stderr.write(`promote-findings: ${err.message}\n`);
      return 2;
    }
    stderr.write(
      `promote-findings: proposal file is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  let result;
  try {
    result = await applyProposal({
      proposal,
      featureSlug: opts.featureSlug,
      read: args.read,
      write: args.write,
      taskNumberFor: buildTaskNumberFor(opts.startingTaskNumber),
    });
  } catch (err) {
    if (err instanceof ApplyProposalError) {
      stderr.write(`promote-findings: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  stdout.write(
    `Applied: ${result.outcomes.filter((o) => o.applied).length} (workplan: ${result.workplanWritten ? 'yes' : 'no'}; audit-log: ${result.auditLogWritten ? 'yes' : 'no'})\n`,
  );
  for (const outcome of result.outcomes) {
    if (outcome.applied && outcome.result !== null) {
      stdout.write(
        `  Item ${outcome.itemIndex} (${outcome.findingId}, ${outcome.disposition}): ${outcome.result}\n`,
      );
    }
  }
  return 0;
}

async function defaultRead(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

async function defaultWrite(path: string, content: string): Promise<void> {
  await writeFile(path, content, 'utf8');
}

async function defaultEnsureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function promoteFindings(rawArgs: string[]): Promise<void> {
  const parsed = parseFlags(rawArgs);
  if (parsed.help === true) {
    process.stdout.write(USAGE);
    return;
  }
  if (!parsed.ok || parsed.opts === undefined) {
    process.stderr.write(`${parsed.error ?? 'unknown error'}\n\n${USAGE}`);
    process.exit(2);
  }
  let projectRoot: string;
  if (parsed.opts.repoRoot !== undefined) {
    projectRoot = isAbsolute(parsed.opts.repoRoot)
      ? parsed.opts.repoRoot
      : resolve(process.cwd(), parsed.opts.repoRoot);
  } else {
    projectRoot = repoRoot();
  }
  const exit = await runPromoteFindings({
    opts: parsed.opts,
    projectRoot,
    now: new Date(),
    stdout: process.stdout,
    stderr: process.stderr,
    read: { workplan: defaultRead, auditLog: defaultRead },
    write: { workplan: defaultWrite, auditLog: defaultWrite },
    readProposalFromDisk: defaultRead,
    writeProposalToDisk: defaultWrite,
    ensureDir: defaultEnsureDir,
  });
  if (exit !== 0) process.exit(exit);
}
