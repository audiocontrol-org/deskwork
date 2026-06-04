// Dispatch shim — see scope-discovery/uninstall-everything-hook-related.ts
// for the library API. This shim parses the flag set, invokes the library,
// and renders the report.

import { uninstallEverythingHookRelated } from '../scope-discovery/uninstall-everything-hook-related.js';

const USAGE = [
  'Usage: dw-lifecycle uninstall-everything-hook-related',
  '    [--repo-root <path>]',
  '    [--apply]',
  '    [--help]',
  '',
  'Phase 24 adopter-migration one-shot. Removes dw-lifecycle-managed',
  'content from .husky/{pre-commit,pre-push,commit-msg} + deletes',
  '.dw-lifecycle/scope-discovery/{hooks-installed.json,last-hook-run.json,',
  'hook-run-log.jsonl}.',
  '',
  'Default: dry-run (scan + report; no mutation).',
  '--apply: perform the removals + report what was done.',
  '',
  'Exit codes:',
  '  0  scan complete (dry-run OR apply)',
  '  2  usage error',
  '',
].join('\n');

export async function uninstallEverythingHookRelatedCli(args: string[]): Promise<void> {
  let repoRootOverride: string | undefined;
  let apply = false;
  let help = false;
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--apply') {
      apply = true;
      continue;
    }
    if (flag === '--repo-root') {
      const value = args[i + 1];
      if (value === undefined) {
        process.stderr.write(`${flag} requires a value\n${USAGE}`);
        process.exit(2);
      }
      i += 1;
      repoRootOverride = value;
      continue;
    }
    process.stderr.write(`unknown flag: ${flag}\n${USAGE}`);
    process.exit(2);
  }
  if (help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const repoRoot = repoRootOverride ?? process.cwd();
  const report = await uninstallEverythingHookRelated({ repoRoot, apply });
  const mode = report.apply ? 'APPLIED' : 'DRY-RUN';
  process.stderr.write(`uninstall-everything-hook-related: ${mode}\n`);
  for (const action of report.actions) {
    const bytesNote = action.bytesRemoved !== undefined ? ` (${action.bytesRemoved} bytes)` : '';
    process.stderr.write(`  ${action.action.padEnd(20)} ${action.path}${bytesNote}\n`);
  }
  if (!report.apply) {
    process.stderr.write(`\nRe-run with --apply to perform the removals.\n`);
  }
  process.exit(0);
}
