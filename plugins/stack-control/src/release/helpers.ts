import { execFileSync } from 'node:child_process';

export type ValidateVersionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function isExactReleaseVersion(version: string): boolean {
  return SEMVER_RE.test(version);
}

export function validateVersion(version: string, lastTag: string): ValidateVersionResult {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    return {
      ok: false,
      reason: `Version "${version}" is not in MAJOR.MINOR.PATCH format (regex: ${SEMVER_RE}).`,
    };
  }
  const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];

  const stripped = lastTag.replace(/^v/, '');
  const lastMatch = SEMVER_RE.exec(stripped);
  if (!lastMatch) {
    return {
      ok: false,
      reason: `Last tag "${lastTag}" is not in MAJOR.MINOR.PATCH format (optional leading 'v').`,
    };
  }
  const [la, lb, lc] = [Number(lastMatch[1]), Number(lastMatch[2]), Number(lastMatch[3])];

  if (a > la) return { ok: true };
  if (a < la) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (b > lb) return { ok: true };
  if (b < lb) return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
  if (c > lc) return { ok: true };
  return { ok: false, reason: `Version ${version} must be strictly greater than ${lastTag}.` };
}

export interface PreconditionReport {
  readonly ok: boolean;
  readonly head: {
    readonly sha: string;
    readonly branch: string;
  };
  readonly relativeToOriginMain: {
    readonly aheadBy: number;
    readonly canFastForward: boolean;
  };
  readonly workingTreeClean: boolean;
  readonly trackingRemoteUpToDate: boolean;
  readonly lastReleaseTag: string | null;
  readonly failures: readonly string[];
}

export interface CheckPreconditionsOptions {
  readonly cwd?: string;
}

export async function checkPreconditions(
  opts: CheckPreconditionsOptions = {},
): Promise<PreconditionReport> {
  const cwd = opts.cwd ?? process.cwd();
  const failures: string[] = [];

  const git = (args: readonly string[]): string =>
    execFileSync('git', [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] }).toString();

  try {
    git(['fetch', 'origin', '--quiet']);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`git fetch origin failed: ${reason}`);
  }

  const headSha = git(['rev-parse', 'HEAD']).trim();
  const headBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  let workingTreeClean = true;
  try {
    git(['diff', '--quiet']);
  } catch {
    workingTreeClean = false;
    failures.push('working tree has uncommitted (unstaged) changes');
  }
  try {
    git(['diff', '--cached', '--quiet']);
  } catch {
    workingTreeClean = false;
    failures.push('working tree has staged changes');
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard']).trim();
  if (untracked.length > 0) {
    workingTreeClean = false;
    const lines = untracked.split('\n');
    const preview = lines.slice(0, 3).join(', ');
    const suffix = lines.length > 3 ? ', ...' : '';
    failures.push(`working tree has untracked files: ${preview}${suffix}`);
  }

  let canFastForward = false;
  let aheadBy = 0;
  try {
    git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
    canFastForward = true;
    const aheadStr = git(['rev-list', '--count', 'origin/main..HEAD']).trim();
    aheadBy = Number(aheadStr) || 0;
  } catch {
    canFastForward = false;
    failures.push('HEAD diverges from origin/main (FF not possible — rebase or merge first)');
  }

  let trackingRemoteUpToDate = false;
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', `${headBranch}@{u}`]).trim();
    const behindStr = git(['rev-list', '--count', `HEAD..${upstream}`]).trim();
    const behind = Number(behindStr) || 0;
    if (behind === 0) {
      trackingRemoteUpToDate = true;
    } else {
      failures.push(`branch ${headBranch} is behind ${upstream} by ${behind} commit(s) — pull first`);
    }
  } catch {
    failures.push(`branch ${headBranch} has no upstream — set tracking with 'git push -u origin ${headBranch}' first`);
  }

  let lastReleaseTag: string | null = null;
  try {
    lastReleaseTag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']).trim() || null;
  } catch {
    lastReleaseTag = null;
  }

  return {
    ok: failures.length === 0,
    head: { sha: headSha, branch: headBranch },
    relativeToOriginMain: { aheadBy, canFastForward },
    workingTreeClean,
    trackingRemoteUpToDate,
    lastReleaseTag,
    failures,
  };
}

export const DESKWORK_PACKAGES = [
  '@deskwork/core',
  '@deskwork/cli',
  '@deskwork/studio',
] as const;

export type NpmLookupResult =
  | { readonly kind: 'published' }
  | { readonly kind: 'unpublished' }
  | { readonly kind: 'error'; readonly message: string };

export type NpmViewer = (pkgAtVersion: string) => NpmLookupResult;

export const realNpmViewer: NpmViewer = (spec) => {
  try {
    execFileSync('npm', ['view', spec, 'version', '--json'], { stdio: 'pipe' });
    return { kind: 'published' };
  } catch (err) {
    const message = extractChildProcessMessage(err);
    if (/\bE404\b|No match found for version|is not in this registry/i.test(message)) {
      return { kind: 'unpublished' };
    }
    return { kind: 'error', message: `npm view failed for ${spec}: ${message}` };
  }
};

export interface NpmStatusReport {
  readonly version: string;
  readonly published: readonly string[];
  readonly unpublished: readonly string[];
}

export function verifyNpmStatus(
  version: string,
  viewer: NpmViewer = realNpmViewer,
): NpmStatusReport {
  const published: string[] = [];
  const unpublished: string[] = [];
  for (const pkg of DESKWORK_PACKAGES) {
    const result = viewer(`${pkg}@${version}`);
    if (result.kind === 'published') {
      published.push(pkg);
    } else if (result.kind === 'unpublished') {
      unpublished.push(pkg);
    } else {
      throw new Error(result.message);
    }
  }
  return { version, published, unpublished };
}

export interface VerifyNpmStatusUntilPublishedOptions {
  readonly maxAttempts?: number;
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly viewer?: NpmViewer;
}

export async function verifyNpmStatusUntilPublished(
  version: string,
  opts: VerifyNpmStatusUntilPublishedOptions = {},
): Promise<NpmStatusReport> {
  const maxAttempts = opts.maxAttempts ?? 6;
  const initialBackoffMs = opts.initialBackoffMs ?? 5000;
  const maxBackoffMs = opts.maxBackoffMs ?? 30000;
  const viewer = opts.viewer ?? realNpmViewer;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastReport = verifyNpmStatus(version, viewer);
  let attempt = 1;
  let backoff = initialBackoffMs;
  while (lastReport.unpublished.length > 0 && attempt < maxAttempts) {
    await sleep(backoff);
    lastReport = verifyNpmStatus(version, viewer);
    backoff = Math.min(backoff * 2, maxBackoffMs);
    attempt += 1;
  }
  return lastReport;
}

export interface AtomicPushOptions {
  readonly tag: string;
  readonly branch: string;
  readonly cwd?: string;
}

export async function atomicPush(opts: AtomicPushOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
  let tagSha: string;
  try {
    tagSha = execFileSync('git', ['rev-parse', `${opts.tag}^{commit}`], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
  } catch (err) {
    throw new Error(`atomicPush preflight failed: required local tag '${opts.tag}' is missing.\n${extractChildProcessMessage(err)}`);
  }
  if (tagSha !== headSha) {
    throw new Error(
      `atomicPush preflight failed: tag '${opts.tag}' points to ${tagSha}, but HEAD is ${headSha}. ` +
        'Refuse to push a release tag that does not match the commit being released.',
    );
  }
  const tagRef = `refs/tags/${opts.tag}:refs/tags/${opts.tag}`;
  const refspecs =
    opts.branch === 'main'
      ? ['HEAD:main', tagRef]
      : ['HEAD:main', `HEAD:refs/heads/${opts.branch}`, tagRef];
  try {
    execFileSync(
      'git',
      ['push', '--atomic', 'origin', ...refspecs],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  } catch (err) {
    let stderr: string;
    if (
      err instanceof Error &&
      'stderr' in err &&
      err.stderr !== null &&
      err.stderr !== undefined
    ) {
      const raw = err.stderr;
      stderr = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    } else if (err instanceof Error) {
      stderr = err.message;
    } else {
      stderr = String(err);
    }
    throw new Error(`atomicPush failed (tag=${opts.tag}, branch=${opts.branch}):\n${stderr}`);
  }
}

function formatPreconditionReport(report: PreconditionReport): string {
  const lines: string[] = [];
  lines.push(`HEAD: ${report.head.sha.slice(0, 7)} (${report.head.branch})`);
  lines.push(
    `Relative to origin/main: ${report.relativeToOriginMain.aheadBy} commits ahead, fast-forward ${report.relativeToOriginMain.canFastForward ? 'possible' : 'NOT possible'}`,
  );
  lines.push(`Working tree: ${report.workingTreeClean ? 'clean' : 'DIRTY'}`);
  lines.push(
    `Tracking remote: ${report.trackingRemoteUpToDate ? 'up-to-date' : 'NOT up-to-date'}`,
  );
  lines.push(`Last release: ${report.lastReleaseTag ?? '(no tags found)'}`);
  if (report.failures.length > 0) {
    lines.push('');
    lines.push('Failures:');
    for (const f of report.failures) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

function extractChildProcessMessage(err: unknown): string {
  if (err instanceof Error && 'stderr' in err && err.stderr !== undefined && err.stderr !== null) {
    const raw = err.stderr;
    const text = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    if (text.trim().length > 0) return text.trim();
  }
  return err instanceof Error ? err.message : String(err);
}

export async function dispatchReleaseHelper(argv: readonly string[]): Promise<number> {
  const [subcommand, ...args] = argv;
  switch (subcommand) {
    case 'check-preconditions': {
      const report = await checkPreconditions();
      process.stdout.write(formatPreconditionReport(report) + '\n');
      return report.ok ? 0 : 1;
    }
    case 'validate-version': {
      const [version, lastTag] = args;
      if (!version || !lastTag) {
        process.stderr.write('usage: validate-version <version> <last-tag>\n');
        return 2;
      }
      const result = validateVersion(version, lastTag);
      if (!result.ok) process.stderr.write(result.reason + '\n');
      return result.ok ? 0 : 1;
    }
    case 'assert-not-published': {
      const [version] = args;
      if (!version) {
        process.stderr.write('usage: assert-not-published <version>\n');
        return 2;
      }
      if (!isExactReleaseVersion(version)) {
        process.stderr.write(
          `Version "${version}" is not in MAJOR.MINOR.PATCH format (regex: ${SEMVER_RE}).\n`,
        );
        return 1;
      }
      const report = verifyNpmStatus(version);
      if (report.published.length > 0) {
        process.stderr.write(
          `Version ${version} is already published on npm for: ${report.published.join(', ')}.\n` +
            `npm forbids republishing the same version. Bump to a new version and re-run.\n`,
        );
        return 1;
      }
      process.stdout.write(
        `All ${DESKWORK_PACKAGES.length} packages are unpublished at v${version} — safe to publish.\n`,
      );
      return 0;
    }
    case 'assert-published': {
      const [version] = args;
      if (!version) {
        process.stderr.write('usage: assert-published <version>\n');
        return 2;
      }
      if (!isExactReleaseVersion(version)) {
        process.stderr.write(
          `Version "${version}" is not in MAJOR.MINOR.PATCH format (regex: ${SEMVER_RE}).\n`,
        );
        return 1;
      }
      const report = await verifyNpmStatusUntilPublished(version);
      if (report.unpublished.length > 0) {
        process.stderr.write(
          `Version ${version} is NOT yet published on npm for: ${report.unpublished.join(', ')}.\n` +
            'Either the publish step did not complete (re-run `make publish` in your terminal),\n' +
            'or registry propagation is still pending after the maximum backoff window (~2 minutes).\n',
        );
        return 1;
      }
      process.stdout.write(
        `All ${DESKWORK_PACKAGES.length} packages are published at v${version} — safe to smoke + tag.\n`,
      );
      return 0;
    }
    case 'atomic-push': {
      const [tag, branch] = args;
      if (!tag || !branch) {
        process.stderr.write('usage: atomic-push <tag> <branch>\n');
        return 2;
      }
      await atomicPush({ tag, branch });
      return 0;
    }
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? '(none)'}\n`);
      return 2;
  }
}
