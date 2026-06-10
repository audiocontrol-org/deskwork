import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import {
  applyAll,
  buildEvidenceCommentBody,
} from '../close-shipped/apply.js';
import { walkAuditLogs } from '../close-shipped/audit-log-walker.js';
import {
  CommitScanError,
  scanAndGroup,
} from '../close-shipped/commit-scanner.js';
import { loadScannerConfig } from '../close-shipped/scanner-config.js';
import { mergeAll } from '../close-shipped/merger.js';
import { buildReleaseNotesBody } from '../close-shipped/release-notes.js';
import {
  TagResolutionError,
  assertTagsExist,
  resolveDefaults,
} from '../close-shipped/tag-resolver.js';
import { walkToolingFeedback } from '../close-shipped/tooling-feedback-walker.js';
import { walkWorkplans } from '../close-shipped/workplan-walker.js';
import { runScan } from '../close-shipped/scan.js';
import { composeProposal, renderMarkdownTable } from '../close-shipped/propose.js';
import { applyV2, InvalidProposalError } from '../close-shipped/apply-v2.js';
import type { Config } from '../config.types.js';
import type {
  BundleSet,
  CloseShippedOutcome,
  CloseShippedResult,
  CloseShippedSummary,
  IssueReferenceGroup,
  MergedIssueEvidence,
  Proposal,
  RunGh,
  RunGit,
  VerdictSet,
} from '../close-shipped/types.js';

// Subcommand layer for /dw-lifecycle:close-shipped -- argv parsing +
// orchestration. The close-shipped library lives in src/close-shipped/.

const DEFAULT_LABEL = 'pending-verification';

export interface CloseShippedCliOptions {
  readonly fromTag: string | null;
  readonly toTag: string | null;
  readonly repo: string | null;
  readonly label: string;
  readonly dryRun: boolean;
  readonly releaseNotesBody: boolean;
}

export function parseCloseShippedArgs(
  args: readonly string[],
): CloseShippedCliOptions {
  let fromTag: string | null = null;
  let toTag: string | null = null;
  let repo: string | null = null;
  let label = DEFAULT_LABEL;
  let dryRun = false;
  let releaseNotesBody = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--from-tag': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--from-tag requires a value.');
        }
        fromTag = next;
        break;
      }
      case '--to-tag': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--to-tag requires a value.');
        }
        toTag = next;
        break;
      }
      case '--repo': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--repo requires a value.');
        }
        repo = next;
        break;
      }
      case '--label': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--label requires a value.');
        }
        if (next === '') {
          throw new Error('--label value cannot be empty.');
        }
        label = next;
        break;
      }
      case '--dry-run':
        dryRun = true;
        break;
      case '--release-notes-body':
        releaseNotesBody = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }
  return { fromTag, toTag, repo, label, dryRun, releaseNotesBody };
}

function defaultRunGh(args: readonly string[]): string {
  return execFileSync('gh', [...args], { encoding: 'utf8' });
}

function defaultRunGit(cwd: string): RunGit {
  const env = { ...process.env, LC_ALL: 'C' };
  return (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, encoding: 'utf8', env });
}

function detectRepoFromGit(root: string): string {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match || !match[1]) {
    throw new Error(
      `Could not detect GitHub repo from origin: ${remote}. Pass --repo <owner/repo>.`,
    );
  }
  return match[1];
}

function summarize(
  fromTag: string,
  toTag: string,
  groups: readonly IssueReferenceGroup[],
  merged: readonly MergedIssueEvidence[],
  outcomes: readonly CloseShippedOutcome[],
  commitsScanned: number,
): CloseShippedResult {
  const summary: CloseShippedSummary = {
    commitsScanned,
    issuesReferenced: merged.length,
    applied: outcomes.filter(
      (o) =>
        o.applied &&
        (o.action === 'labeled-and-commented' ||
          o.action === 'comment-only' ||
          o.action === 'label-only'),
    ).length,
    skippedClosed: outcomes.filter((o) => o.action === 'skipped-already-closed').length,
    skippedAlreadyLabeled: outcomes.filter(
      (o) => o.action === 'skipped-already-labeled',
    ).length,
    failed: outcomes.filter(
      (o) =>
        !o.applied &&
        o.action !== 'skipped-already-closed' &&
        o.action !== 'skipped-already-labeled',
    ).length,
  };
  return { fromTag, toTag, groups, merged, outcomes, summary };
}

function formatDryRun(result: CloseShippedResult, label: string): string {
  const lines: string[] = [];
  lines.push(`Dry-run plan for ${result.fromTag}..${result.toTag}`);
  lines.push(`Commits scanned: ${result.summary.commitsScanned}`);
  lines.push(`Issues referenced: ${result.summary.issuesReferenced}`);
  lines.push('');
  if (result.merged.length === 0) {
    lines.push('No issue references found in the range.');
    lines.push('');
    return lines.join('\n');
  }
  lines.push(`For each open issue, would post a verification-request comment and add label '${label}':`);
  lines.push('');
  for (const evidence of result.merged) {
    const verbSuffix =
      evidence.verbs.length > 0 ? ` (verbs: ${evidence.verbs.join(', ')})` : '';
    lines.push(
      `Issue #${evidence.issue} sources: ${evidence.sources.join(', ')}${verbSuffix}`,
    );
    for (const commit of evidence.commits) {
      lines.push(`  ${commit.sha}: ${commit.subject}`);
    }
    for (const entry of evidence.provenance) {
      const path = entry.path ?? '';
      const detail = entry.detail ?? '';
      const sha = entry.sha ?? '';
      const parts: string[] = [];
      if (path !== '') parts.push(path);
      if (sha !== '') parts.push(`sha ${sha}`);
      if (detail !== '') parts.push(detail);
      lines.push(`  [${entry.source}] ${parts.join(' — ')}`);
    }
    if (evidence.orphanSource && evidence.orphanReason !== null) {
      lines.push(`  orphan-source: ${evidence.orphanReason}`);
    }
    const sampleBody = buildEvidenceCommentBody({
      toTag: result.toTag,
      evidence,
    });
    const sampleFirstLine = sampleBody.split('\n')[0] ?? '';
    lines.push(`  Comment first line: ${sampleFirstLine}`);
    lines.push('');
  }
  lines.push('No mutations performed (--dry-run).');
  lines.push('');
  return lines.join('\n');
}

function formatResult(result: CloseShippedResult, label: string): string {
  const lines: string[] = [];
  lines.push(`Range: ${result.fromTag}..${result.toTag}`);
  lines.push(`Commits scanned: ${result.summary.commitsScanned}`);
  lines.push(`Issues referenced: ${result.summary.issuesReferenced}`);
  lines.push(
    `Applied: ${result.summary.applied} (commented + labeled), ${result.summary.skippedClosed} skipped-already-closed, ${result.summary.skippedAlreadyLabeled} skipped-already-labeled, ${result.summary.failed} failures`,
  );
  const failed = result.outcomes.filter(
    (o) =>
      !o.applied &&
      o.action !== 'skipped-already-closed' &&
      o.action !== 'skipped-already-labeled',
  );
  if (failed.length > 0) {
    lines.push('Failed:');
    for (const f of failed) {
      lines.push(`  #${f.issue} (${f.action}): ${f.error ?? '(no detail)'}`);
    }
  }
  const partial = result.outcomes.filter(
    (o) =>
      o.applied && (o.action === 'comment-only' || o.action === 'label-only'),
  );
  if (partial.length > 0) {
    lines.push('Partial:');
    for (const p of partial) {
      lines.push(`  #${p.issue} (${p.action}): ${p.error ?? ''}`);
    }
  }
  lines.push(`Label applied: ${label}`);
  lines.push('');
  return lines.join('\n');
}

export interface RunCloseShippedArgs {
  readonly opts: CloseShippedCliOptions;
  readonly projectRoot: string;
  readonly config: Config;
  readonly runGh: RunGh;
  readonly runGit: RunGit;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly detectRepo: () => string;
}

export function runCloseShipped(args: RunCloseShippedArgs): number {
  const { opts, projectRoot, config, runGh, runGit, stdout, stderr, detectRepo } =
    args;

  let resolved;
  try {
    resolved = resolveDefaults({
      runGit,
      fromTagOverride: opts.fromTag,
      toTagOverride: opts.toTag,
    });
  } catch (err) {
    if (err instanceof TagResolutionError) {
      stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  try {
    assertTagsExist(resolved.fromTag, resolved.toTag, runGit);
  } catch (err) {
    if (err instanceof TagResolutionError) {
      stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  // Reject reversed ranges. `git rev-list --count` against the
  // `from..to` triple-dot symmetric difference would also catch this,
  // but the direct `from..to` count is the simpler signal and matches
  // what the scanner will actually scan.
  let forwardCount: number;
  let reverseCount: number;
  try {
    forwardCount = parseRevCount(
      runGit(['rev-list', '--count', `${resolved.fromTag}..${resolved.toTag}`]),
    );
    reverseCount = parseRevCount(
      runGit(['rev-list', '--count', `${resolved.toTag}..${resolved.fromTag}`]),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`Failed to validate tag range: ${msg.split('\n')[0] ?? msg}\n`);
    return 2;
  }
  if (forwardCount === 0 && reverseCount > 0) {
    stderr.write(
      `Reversed tag range: --from-tag ${resolved.fromTag} is newer than --to-tag ${resolved.toTag}. Swap the values.\n`,
    );
    return 2;
  }

  if (resolved.fromTagDefaulted || resolved.toTagDefaulted) {
    const parts: string[] = [];
    if (resolved.fromTagDefaulted) parts.push(`--from-tag=${resolved.fromTag} (default)`);
    if (resolved.toTagDefaulted) parts.push(`--to-tag=${resolved.toTag} (default)`);
    stdout.write(`Resolved: ${parts.join(', ')}\n`);
  }

  const repo = opts.repo ?? detectRepo();

  // Phase 14 / #369: load the project-level scanner config. Defaults to
  // strict Phase 13 behavior; adopters opt into end-of-subject parens
  // matching by shipping `.dw-lifecycle/close-shipped-config.yaml`.
  const scannerConfig = loadScannerConfig(projectRoot);

  let scan;
  try {
    scan = scanAndGroup({
      fromTag: resolved.fromTag,
      toTag: resolved.toTag,
      runGit,
      config: scannerConfig,
    });
  } catch (err) {
    if (err instanceof CommitScanError) {
      stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }

  // Source (b): audit-log walker.
  const auditFindings = walkAuditLogs({
    projectRoot,
    config,
    fromTag: resolved.fromTag,
    toTag: resolved.toTag,
    runGit,
  });

  // Source (c): tooling-feedback walker.
  const tfFindings = walkToolingFeedback({
    projectRoot,
    config,
    fromTag: resolved.fromTag,
    toTag: resolved.toTag,
    runGit,
  });

  // Source (d): workplan-checkbox walker.
  const workplanFindings = walkWorkplans({ projectRoot, config });

  const merged = mergeAll({
    commits: scan.commits,
    groups: scan.groups,
    auditFindings,
    tfFindings,
    workplanFindings,
  });

  // --release-notes-body emits ONLY the markdown body (no other
  // output) so the operator can pipe it into `gh release edit --notes`.
  if (opts.releaseNotesBody) {
    stdout.write(
      buildReleaseNotesBody({ toTag: resolved.toTag, merged }),
    );
    return 0;
  }

  if (opts.dryRun) {
    const result = summarize(
      resolved.fromTag,
      resolved.toTag,
      scan.groups,
      merged,
      [],
      scan.commits.length,
    );
    stdout.write(formatDryRun(result, opts.label));
    return 0;
  }

  const { outcomes } = applyAll({
    merged,
    toTag: resolved.toTag,
    repo,
    label: opts.label,
    dryRun: false,
    runGh,
  });
  const result = summarize(
    resolved.fromTag,
    resolved.toTag,
    scan.groups,
    merged,
    outcomes,
    scan.commits.length,
  );
  stdout.write(formatResult(result, opts.label));

  // Exit policy:
  //   - structural failure (range invalid, tag missing) is exit 2,
  //     handled above before we get here.
  //   - every applicable issue failed -> exit 1.
  //   - everything else (success, no-op, partial-success, all-skipped) -> 0.
  if (merged.length === 0) return 0;
  const attempted = outcomes.filter(
    (o) =>
      o.action !== 'skipped-already-closed' &&
      o.action !== 'skipped-already-labeled',
  );
  if (attempted.length === 0) return 0;
  const allFailed = attempted.every((o) => !o.applied);
  if (allFailed) return 1;
  return 0;
}

function parseRevCount(out: string): number {
  const n = Number.parseInt(out.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

// === Phase 15 verb dispatch (scan | propose | apply) ===

interface ScanCliOptions {
  readonly fromTag: string | null;
  readonly toTag: string | null;
  readonly output: string | null;
  readonly repo: string | null;
}

function parseScanArgs(args: readonly string[]): ScanCliOptions {
  let fromTag: string | null = null;
  let toTag: string | null = null;
  let output: string | null = null;
  let repo: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--from-tag') {
      const next = args[++i];
      if (next === undefined) throw new Error('--from-tag requires a value.');
      fromTag = next;
      continue;
    }
    if (a === '--to-tag') {
      const next = args[++i];
      if (next === undefined) throw new Error('--to-tag requires a value.');
      toTag = next;
      continue;
    }
    if (a === '--output') {
      const next = args[++i];
      if (next === undefined) throw new Error('--output requires a value.');
      output = next;
      continue;
    }
    if (a === '--repo') {
      const next = args[++i];
      if (next === undefined) throw new Error('--repo requires a value.');
      repo = next;
      continue;
    }
    throw new Error(`Unknown flag for scan: ${a}`);
  }
  return { fromTag, toTag, output, repo };
}

function runScanCli(args: readonly string[]): number {
  let opts: ScanCliOptions;
  try {
    opts = parseScanArgs(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    return 2;
  }
  if (opts.fromTag === null || opts.toTag === null) {
    process.stderr.write('scan requires --from-tag <vA> --to-tag <vB>\n');
    return 2;
  }
  const fromTag = opts.fromTag;
  const toTag = opts.toTag;
  const projectRoot = repoRoot();
  const config = loadConfig(projectRoot);
  const scannerConfig = loadScannerConfig(projectRoot);
  const runGit = defaultRunGit(projectRoot);
  const runGh = defaultRunGh;
  let repo: string;
  try {
    repo = opts.repo ?? detectRepoFromGit(projectRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    return 2;
  }

  const scanCommitsForRange = () => {
    const { commits } = scanAndGroup({
      fromTag,
      toTag,
      runGit,
      config: scannerConfig,
    });
    return commits;
  };

  const walkAuditLogEntriesAdapter = () => {
    const findings = walkAuditLogs({
      projectRoot,
      config,
      fromTag,
      toTag,
      runGit,
    });
    return findings.map((f) => ({
      finding_id: f.findingId,
      status: `fixed-${f.sha}`,
      tracks_issue: f.issueNumber,
      surface: f.entryHeading,
      body: '',
    }));
  };

  const walkWorkplanBackfillsAdapter = () => {
    const findings = walkWorkplans({ projectRoot, config });
    return findings.map((f) => ({
      file: f.workplanPath,
      line: f.lineNumber,
      text: f.taskLine,
    }));
  };

  const resolvePrForRange = (): null => null;

  const issueInfo = (n: number) => {
    try {
      const raw = runGh([
        'issue',
        'view',
        String(n),
        '--repo',
        repo,
        '--json',
        'number,title,state,body',
      ]);
      const data: unknown = JSON.parse(raw);
      const d = (data ?? {}) as Record<string, unknown>;
      const title = typeof d.title === 'string' ? d.title : `Issue ${n}`;
      const state =
        d.state === 'OPEN' || d.state === 'CLOSED' ? (d.state as 'OPEN' | 'CLOSED') : ('UNKNOWN' as const);
      const body = typeof d.body === 'string' ? d.body : '';
      return { number: n, title, state, body, recent_comments: [] };
    } catch {
      return {
        number: n,
        title: `Issue ${n}`,
        state: 'UNKNOWN' as const,
        body: '',
        recent_comments: [],
      };
    }
  };

  const bundleSet = runScan({
    fromTag,
    toTag,
    repo,
    now: new Date(),
    scanCommitsForRange,
    walkAuditLogEntries: walkAuditLogEntriesAdapter,
    walkWorkplanBackfills: walkWorkplanBackfillsAdapter,
    resolvePrForRange,
    issueInfo,
    runGit,
  });

  const out = opts.output;
  if (out !== null) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(bundleSet, null, 2));
    process.stderr.write(`Bundles written: ${out}\n`);
  } else {
    process.stdout.write(JSON.stringify(bundleSet, null, 2));
    process.stdout.write('\n');
  }
  return 0;
}

function runProposeCli(args: readonly string[]): number {
  let bundlesPath: string | null = null;
  let verdictsPath: string | null = null;
  let output: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--bundles') {
      bundlesPath = args[++i] ?? null;
      continue;
    }
    if (a === '--verdicts') {
      verdictsPath = args[++i] ?? null;
      continue;
    }
    if (a === '--output') {
      output = args[++i] ?? null;
      continue;
    }
    process.stderr.write(`Unknown flag for propose: ${a}\n`);
    return 2;
  }
  if (bundlesPath === null || verdictsPath === null) {
    process.stderr.write('propose requires --bundles <path> --verdicts <path>\n');
    return 2;
  }
  const bundles: BundleSet = JSON.parse(readFileSync(bundlesPath, 'utf8'));
  const verdicts: VerdictSet = JSON.parse(readFileSync(verdictsPath, 'utf8'));
  const proposal = composeProposal(bundles, verdicts);
  const outputPath =
    output ??
    join(
      process.cwd(),
      '.dw-lifecycle',
      'close-shipped',
      `proposals-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(proposal, null, 2));
  process.stderr.write(`Proposal written: ${outputPath}\n`);
  process.stdout.write(renderMarkdownTable(proposal));
  process.stdout.write('\n');
  return 0;
}

function runApplyV2Cli(args: readonly string[]): number {
  let proposalPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--proposal') {
      proposalPath = args[++i] ?? null;
      continue;
    }
    process.stderr.write(`Unknown flag for apply: ${a}\n`);
    return 2;
  }
  if (proposalPath === null) {
    process.stderr.write('apply requires --proposal <path>\n');
    return 2;
  }
  const proposal: Proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
  const runGh: RunGh = defaultRunGh;
  try {
    const result = applyV2({ proposal, runGh });
    for (const note of result.notes) {
      process.stdout.write(`${note}\n`);
    }
    process.stdout.write(
      `Applied ${result.applied.length}, skipped ${result.skipped.length}, failed ${result.failed.length}.\n`,
    );
    for (const f of result.failed) {
      process.stderr.write(`failed #${f.issue}: ${f.error}\n`);
    }
    if (result.applied.length === 0 && result.failed.length > 0) return 1;
    return 0;
  } catch (err) {
    if (err instanceof InvalidProposalError) {
      process.stderr.write(`${err.message}\n`);
      return 2;
    }
    throw err;
  }
}

export async function closeShipped(rawArgs: string[]): Promise<void> {
  // Phase 15 verb dispatch — `scan` / `propose` / `apply` keywords route
  // to the new mechanical-narrowing + agent-dispatch flow. Bare invocation
  // (no verb keyword) falls through to the legacy single-command flow.
  const first = rawArgs[0];
  if (first === 'scan') {
    process.exit(runScanCli(rawArgs.slice(1)));
  }
  if (first === 'propose') {
    process.exit(runProposeCli(rawArgs.slice(1)));
  }
  if (first === 'apply') {
    process.exit(runApplyV2Cli(rawArgs.slice(1)));
  }

  const opts = parseCloseShippedArgs(rawArgs);
  const root = repoRoot();
  const config = loadConfig(root);
  const exitCode = runCloseShipped({
    opts,
    projectRoot: root,
    config,
    runGh: defaultRunGh,
    runGit: defaultRunGit(root),
    stdout: process.stdout,
    stderr: process.stderr,
    detectRepo: () => detectRepoFromGit(root),
  });
  if (exitCode !== 0) process.exit(exitCode);
}
