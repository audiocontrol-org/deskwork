import type {
  BranchSample,
  ParkedBranchesReport,
  RunGit,
} from './types.js';

export interface ScanParkedBranchesArgs {
  readonly now: Date;
  readonly parkedDays: number;
  readonly runGit: RunGit;
}

interface RawRef {
  readonly refname: string;
  readonly upstream: string;
  readonly objectname: string;
  readonly committerdate: string;
}

const FORMAT = '%(refname:short)|%(upstream:short)|%(objectname)|%(committerdate:iso8601-strict)';

const EXCLUDED_REFS = new Set(['main', 'origin/main', 'master', 'origin/master', 'HEAD']);

function parseRefs(stdout: string): RawRef[] {
  const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const refs: RawRef[] = [];
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 4) continue;
    const [refname, upstream, objectname, committerdate] = parts;
    if (!refname || !objectname || !committerdate) continue;
    refs.push({
      refname,
      upstream: upstream ?? '',
      objectname,
      committerdate,
    });
  }
  return refs;
}

function parseAheadBehind(stdout: string): { ahead: number; behind: number } {
  // `git rev-list --left-right --count <branch>...<base>` returns
  // "<ahead>\t<behind>" by convention; left side is the first ref.
  const trimmed = stdout.trim();
  const [aheadStr, behindStr] = trimmed.split(/\s+/);
  const ahead = Number.parseInt(aheadStr ?? '0', 10);
  const behind = Number.parseInt(behindStr ?? '0', 10);
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

export function scanParkedBranches(
  args: ScanParkedBranchesArgs,
): ParkedBranchesReport {
  const { now, parkedDays, runGit } = args;

  const refOut = runGit([
    'for-each-ref',
    `--format=${FORMAT}`,
    'refs/heads/',
    'refs/remotes/origin/',
  ]);
  const refs = parseRefs(refOut);

  const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  const parked: BranchSample[] = [];
  const others: BranchSample[] = [];

  for (const ref of refs) {
    if (EXCLUDED_REFS.has(ref.refname)) continue;
    if (ref.refname === currentBranch) continue;

    const base = ref.upstream && ref.upstream.length > 0 ? ref.upstream : 'origin/main';
    const range = `${ref.refname}...${base}`;
    const aheadBehind = parseAheadBehind(
      runGit(['rev-list', '--left-right', '--count', range]),
    );

    const lastCommit = new Date(ref.committerdate);
    const ageDays = (now.getTime() - lastCommit.getTime()) / 86400_000;

    const sample: BranchSample = {
      refname: ref.refname,
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      last_commit_date: ref.committerdate,
    };

    if (sample.ahead > 0 && ageDays > parkedDays) {
      parked.push(sample);
    } else {
      others.push(sample);
    }
  }

  // Deterministic ordering: oldest-last-commit first within each bucket.
  const byDateAsc = (a: BranchSample, b: BranchSample): number =>
    new Date(a.last_commit_date).getTime() - new Date(b.last_commit_date).getTime();
  parked.sort(byDateAsc);
  others.sort(byDateAsc);

  return {
    parked_threshold_days: parkedDays,
    parked,
    other_branches: others,
  };
}
