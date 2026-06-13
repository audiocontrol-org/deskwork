import { resolve as resolvePath } from 'node:path';
import { InstallationError } from '../config/errors.js';
import { resolveInstallation } from '../config/installation.js';
import {
  clearDomainPreference,
  getPreferenceStatus,
  writeDomainPreference,
  type PreferenceScope,
} from '../config/domain-preference.js';
import { discoverCandidateDomains } from '../config/domain-discovery.js';

type Action = 'show' | 'use' | 'clear';

interface ParsedArgs {
  readonly action: Action;
  readonly target: string | null;
  readonly scope: PreferenceScope | 'all';
  readonly at: string;
}

export async function runConfigDomainCli(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  try {
    if (parsed.action === 'show') {
      printStatus(parsed.at);
      return;
    }
    if (parsed.action === 'use') {
      const target = parsed.target;
      if (target === null) usage('use requires a <dir>');
      const installation = resolveInstallation(resolvePath(parsed.at, target));
      if (parsed.scope === 'all') usage("use requires --scope session or --scope branch");
      writeDomainPreference(parsed.at, parsed.scope, installation.root);
      process.stdout.write(`config-domain: set ${parsed.scope} preference to ${installation.root}\n`);
      return;
    }
    clearDomainPreference(parsed.at, parsed.scope);
    process.stdout.write(`config-domain: cleared ${parsed.scope} preference\n`);
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`config-domain: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

function printStatus(startDir: string): void {
  const status = getPreferenceStatus(startDir);
  const candidates = discoverCandidateDomains(startDir);
  process.stdout.write('stackctl config-domain\n');
  process.stdout.write(`git root: ${status.gitRoot}\n`);
  process.stdout.write(`current branch: ${status.currentBranch ?? '(none)'}\n`);
  process.stdout.write(`session preference: ${status.session ?? '(none)'}\n`);
  process.stdout.write(`branch preference: ${status.branch ?? '(none)'}\n`);
  process.stdout.write(`candidates: ${candidates.length}\n`);
  for (const candidate of candidates) {
    process.stdout.write(`  - ${candidate}\n`);
  }
}

function parseArgs(args: readonly string[]): ParsedArgs {
  let action: Action = 'show';
  let target: string | null = null;
  let scope: PreferenceScope | 'all' = 'session';
  let at = process.cwd();

  let i = 0;
  if (args[0] === 'show' || args[0] === 'use' || args[0] === 'clear') {
    action = args[0];
    i = 1;
  }
  if (action === 'use' && i < args.length && !args[i]!.startsWith('--')) {
    target = args[i]!;
    i++;
  }
  for (; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--at') {
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) usage('--at requires <dir>');
      at = value;
    } else if (arg === '--scope') {
      const value = args[++i];
      if (value !== 'session' && value !== 'branch' && value !== 'all') {
        usage("--scope must be one of: session, branch, all");
      }
      scope = value;
    } else if (arg.startsWith('--scope=')) {
      const value = arg.slice('--scope='.length);
      if (value !== 'session' && value !== 'branch' && value !== 'all') {
        usage("--scope must be one of: session, branch, all");
      }
      scope = value;
    } else {
      usage(`unexpected argument '${arg}'`);
    }
  }
  if (action === 'show' && scope === 'all') usage("show does not accept --scope all");
  return { action, target, scope: action === 'clear' ? scope : scope === 'all' ? 'session' : scope, at };
}

function usage(message: string): never {
  process.stderr.write(`config-domain: ${message}\n`);
  process.stderr.write(
    'usage: stackctl config-domain [show] [--at <dir>]\n' +
      '       stackctl config-domain use <dir> [--scope session|branch] [--at <dir>]\n' +
      '       stackctl config-domain clear [--scope session|branch|all] [--at <dir>]\n',
  );
  process.exit(2);
}
