/**
 * plugins/dw-lifecycle/src/scope-discovery/uninstall-scope-discovery-hooks.ts
 *
 * Library API for `dw-lifecycle uninstall-scope-discovery-hooks`.
 * Reverses install-scope-discovery-hooks AND any
 * install-agent-prompts installations whose files are recorded in the
 * shared manifest at .dw-lifecycle/scope-discovery/hooks-installed.json.
 *
 * Drift check: for each managed file, recompute sha256 and compare
 * against the manifest entry. If the file has been modified post-
 * install, REFUSE to remove unless --force-uninstall is passed.
 *
 * For agent prompt files, removal means stripping the managed block
 * delimited by the Step 0 markers — operator-authored content above
 * and below the block is preserved. For hook files, removal means
 * deleting the whole file (the hook is wholly managed) UNLESS the file
 * contains content outside the managed block (i.e., a merged install),
 * in which case only the block is stripped.
 *
 * The hooks-installed.json manifest is removed only when ALL files
 * were cleanly removed (a partial uninstall leaves the manifest in
 * place so a follow-up run can finish the job).
 *
 * Exit codes:
 *   0   uninstall completed.
 *   2   args error, missing manifest, drift detected without
 *       --force-uninstall, or a removal I/O error.
 */

import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { errorMessage } from './util/typeguards.js';
import {
  HOOK_BEGIN_MARKER,
  HOOK_END_MARKER,
  HookFileRecord,
  readExistingManifest,
} from './install-scope-discovery-hooks.js';
import {
  STEP_0_BEGIN_MARKER,
  STEP_0_END_MARKER,
} from './install-agent-prompts.js';

export interface UninstallOptions {
  readonly target: string;
  readonly forceUninstall: boolean;
  readonly dryRun: boolean;
}

export interface FileRemoval {
  readonly path: string;
  readonly result:
    | 'removed-file'
    | 'stripped-block'
    | 'skipped-drift'
    | 'skipped-missing'
    | 'skipped-no-marker';
  readonly reason?: string;
}

export interface UninstallResult {
  readonly code: 0 | 2;
  readonly target: string;
  readonly manifestPath: string;
  readonly removals: ReadonlyArray<FileRemoval>;
  readonly manifestRemoved: boolean;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: dw-lifecycle uninstall-scope-discovery-hooks [options]',
      '',
      'Reverse install-scope-discovery-hooks + install-agent-prompts.',
      'Reads .dw-lifecycle/scope-discovery/hooks-installed.json, drift-',
      'checks each managed file (recomputed sha256 vs. manifest),',
      'and removes / strips the managed block.',
      '',
      'Options:',
      '  --target <path>      Target project root. Default: cwd.',
      '  --force-uninstall    Remove files even when drift is detected.',
      '  --dry-run            Print the plan; do not modify anything.',
      '  --help, -h           Show this help.',
      '',
      'Exit codes: 0 success; 2 args / missing manifest / drift / I/O.',
      '',
    ].join('\n'),
  );
}

export function parseCli(argv: readonly string[]): UninstallOptions {
  let target = process.cwd();
  let forceUninstall = false;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--target': {
        const next = argv[i + 1];
        if (next === undefined) throw new Error('--target requires a path');
        target = next;
        i += 1;
        break;
      }
      case '--force-uninstall':
        forceUninstall = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        throw new Error('unreachable');
      default:
        throw new Error(`unknown argument: ${arg ?? '<empty>'}`);
    }
  }
  return { target, forceUninstall, dryRun };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Strip the managed block (delimited by `beginMarker` / `endMarker`)
 * from `content`. Returns the cleaned content. If no markers are
 * present, returns null (caller decides whether to remove the file
 * outright or report a no-marker no-op).
 */
export function stripManagedBlock(
  content: string,
  beginMarker: string,
  endMarker: string,
): string | null {
  const beginIdx = content.indexOf(beginMarker);
  const endIdx = content.indexOf(endMarker);
  if (beginIdx === -1 || endIdx === -1) {
    return null;
  }
  // Capture an optional trailing newline immediately after the end
  // marker so the cleaned content doesn't have a stray empty line.
  const endLineEnd = endIdx + endMarker.length;
  const trailingNl = content.charAt(endLineEnd) === '\n' ? 1 : 0;
  // Drop a single leading newline before the begin marker if present
  // so we don't leave a doubled blank line.
  let cutStart = beginIdx;
  if (cutStart > 0 && content.charAt(cutStart - 1) === '\n') {
    cutStart -= 1;
  }
  if (cutStart > 0 && content.charAt(cutStart - 1) === '\n') {
    cutStart -= 1;
  }
  return content.slice(0, cutStart) + content.slice(endLineEnd + trailingNl);
}

function isAgentMarkerFile(content: string): boolean {
  return (
    content.includes(STEP_0_BEGIN_MARKER) ||
    content.includes(STEP_0_END_MARKER)
  );
}

function isHookMarkerFile(content: string): boolean {
  return (
    content.includes(HOOK_BEGIN_MARKER) ||
    content.includes(HOOK_END_MARKER)
  );
}

interface FilePlan {
  readonly record: HookFileRecord;
  readonly removal: FileRemoval;
  readonly writeContent: string | null;
  readonly deleteFile: boolean;
}

function planRemoval(
  record: HookFileRecord,
  opts: UninstallOptions,
): FilePlan {
  if (!existsSync(record.path)) {
    return {
      record,
      removal: {
        path: record.path,
        result: 'skipped-missing',
        reason: 'file already absent',
      },
      writeContent: null,
      deleteFile: false,
    };
  }
  const content = readFileSync(record.path, 'utf8');
  const currentSha = sha256(content);
  const drifted = currentSha !== record.sha256;
  if (drifted && !opts.forceUninstall) {
    return {
      record,
      removal: {
        path: record.path,
        result: 'skipped-drift',
        reason:
          'sha256 mismatch — file modified post-install; pass ' +
          '--force-uninstall to remove anyway',
      },
      writeContent: null,
      deleteFile: false,
    };
  }
  if (isAgentMarkerFile(content)) {
    const stripped = stripManagedBlock(
      content,
      STEP_0_BEGIN_MARKER,
      STEP_0_END_MARKER,
    );
    if (stripped === null) {
      return {
        record,
        removal: {
          path: record.path,
          result: 'skipped-no-marker',
          reason: 'markers not found in current content',
        },
        writeContent: null,
        deleteFile: false,
      };
    }
    return {
      record,
      removal: { path: record.path, result: 'stripped-block' },
      writeContent: stripped,
      deleteFile: false,
    };
  }
  if (isHookMarkerFile(content)) {
    const stripped = stripManagedBlock(
      content,
      HOOK_BEGIN_MARKER,
      HOOK_END_MARKER,
    );
    if (stripped === null) {
      return {
        record,
        removal: {
          path: record.path,
          result: 'skipped-no-marker',
          reason: 'markers not found in current content',
        },
        writeContent: null,
        deleteFile: false,
      };
    }
    // If the stripped content is just the shebang + a trailing newline
    // (or empty), the hook was a fresh install — delete the file.
    const trimmed = stripped.replace(/^#!.*\n?/, '').trim();
    if (trimmed.length === 0 || trimmed === 'set -euo pipefail') {
      return {
        record,
        removal: { path: record.path, result: 'removed-file' },
        writeContent: null,
        deleteFile: true,
      };
    }
    return {
      record,
      removal: { path: record.path, result: 'stripped-block' },
      writeContent: stripped,
      deleteFile: false,
    };
  }
  // Drifted file that no longer carries a marker — under force we still
  // remove it since the manifest claimed it managed.
  if (opts.forceUninstall) {
    return {
      record,
      removal: {
        path: record.path,
        result: 'removed-file',
        reason: 'force-uninstall: no marker found; deleting outright',
      },
      writeContent: null,
      deleteFile: true,
    };
  }
  return {
    record,
    removal: {
      path: record.path,
      result: 'skipped-no-marker',
      reason: 'no marker; pass --force-uninstall to delete anyway',
    },
    writeContent: null,
    deleteFile: false,
  };
}

function applyPlan(plan: FilePlan, dryRun: boolean): void {
  if (dryRun) return;
  if (plan.deleteFile) {
    rmSync(plan.record.path, { force: true });
    return;
  }
  if (plan.writeContent !== null) {
    writeFileSync(plan.record.path, plan.writeContent, 'utf8');
  }
}

function tryUnsetHooksPath(target: string, dryRun: boolean): void {
  if (dryRun) return;
  try {
    const current = execSync('git config --get core.hooksPath', {
      cwd: target,
    })
      .toString('utf8')
      .trim();
    if (current === '.githooks') {
      execSync('git config --unset core.hooksPath', { cwd: target });
    }
  } catch {
    // Either no git, no config set, or non-matching config. All are
    // safe to ignore — uninstall is best-effort on this axis.
  }
}

export function uninstall(opts: UninstallOptions): UninstallResult {
  const target = resolve(opts.target);
  const manifestPath = join(
    target,
    '.dw-lifecycle',
    'scope-discovery',
    'hooks-installed.json',
  );
  const manifest = readExistingManifest(manifestPath);
  if (manifest === null) {
    throw new Error(
      `no hooks-installed.json manifest at ${manifestPath}; ` +
        'nothing to uninstall. If you installed by hand, remove the ' +
        'files manually.',
    );
  }
  const plans = manifest.files.map((record) => planRemoval(record, opts));
  const driftBlockers = plans.filter(
    (p) => p.removal.result === 'skipped-drift',
  );
  // All-clean removals can proceed; if any are drift-blocked AND we're
  // not in force mode, we still proceed with the non-blocked plans and
  // exit 2 to signal the partial state.
  for (const plan of plans) {
    if (plan.removal.result === 'skipped-drift' && !opts.forceUninstall) {
      continue;
    }
    applyPlan(plan, opts.dryRun);
  }
  tryUnsetHooksPath(target, opts.dryRun);

  const allClean = plans.every(
    (p) =>
      p.removal.result === 'removed-file' ||
      p.removal.result === 'stripped-block' ||
      p.removal.result === 'skipped-missing',
  );
  if (allClean && !opts.dryRun) {
    rmSync(manifestPath, { force: true });
  }

  return {
    code: driftBlockers.length > 0 ? 2 : 0,
    target,
    manifestPath,
    removals: plans.map((p) => p.removal),
    manifestRemoved: allClean && !opts.dryRun,
  };
}

function reportRemovals(result: UninstallResult, dryRun: boolean): void {
  const prefix = dryRun ? '[dry-run] ' : '';
  process.stdout.write(
    `${prefix}uninstall-scope-discovery-hooks: target=${result.target}\n`,
  );
  for (const r of result.removals) {
    const detail = r.reason ? ` (${r.reason})` : '';
    process.stdout.write(`${prefix}  ${r.result}: ${r.path}${detail}\n`);
  }
  if (result.manifestRemoved) {
    process.stdout.write(`${prefix}  removed-manifest: ${result.manifestPath}\n`);
  }
}

export async function main(argv: readonly string[]): Promise<{ code: 0 | 2 }> {
  let opts: UninstallOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    process.stderr.write(
      `uninstall-scope-discovery-hooks: ${errorMessage(err)}\n`,
    );
    return { code: 2 };
  }
  try {
    const result = uninstall(opts);
    reportRemovals(result, opts.dryRun);
    return { code: result.code };
  } catch (err) {
    process.stderr.write(
      `uninstall-scope-discovery-hooks: ${errorMessage(err)}\n`,
    );
    return { code: 2 };
  }
}
