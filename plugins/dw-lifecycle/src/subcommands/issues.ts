import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../config.js';
import { resolveFeaturePath } from '../docs.js';
import { repoRoot } from '../repo.js';
import { createParentIssue, createPhaseIssues } from '../tracking-github.js';
import { validateSlug, validateTargetVersion } from '../slug.js';

interface IssuesArgs {
  slug: string;
  targetVersion?: string;
  repo?: string;
}

function parseArgs(args: string[]): IssuesArgs {
  let slug: string | undefined;
  let targetVersion: string | undefined;
  let repo: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--target') targetVersion = args[++i];
    else if (a === '--repo') repo = args[++i];
    else if (!slug && !a.startsWith('--')) slug = a;
  }
  if (!slug) {
    throw new Error(
      'Usage: dw-lifecycle issues <slug> [--target <version>] [--repo <owner/repo>]'
    );
  }
  return { slug, targetVersion, repo };
}

function detectRepo(root: string): string {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error(`Could not parse GitHub repo from origin: ${remote}`);
  const repo = match[1];
  if (!repo) throw new Error(`Could not parse GitHub repo from origin: ${remote}`);
  return repo;
}

function extractPhases(workplan: string): Array<{ name: string; body: string }> {
  // Phase headings: "## Phase N — <name>"
  const lines = workplan.split('\n');
  const phases: Array<{ name: string; body: string }> = [];
  let current: { name: string; body: string } | null = null;
  for (const line of lines) {
    const m = /^## (Phase \d+.*)$/.exec(line);
    if (m) {
      if (current) phases.push(current);
      const name = m[1];
      if (!name) continue;
      current = { name, body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) phases.push(current);
  return phases;
}

export async function issues(parsedArgs: string[]): Promise<void> {
  const { slug, targetVersion, repo } = parseArgs(parsedArgs);
  validateSlug(slug);
  if (targetVersion) {
    validateTargetVersion(targetVersion);
  }

  const root = repoRoot();
  const cfg = loadConfig(root);
  const target = targetVersion ?? cfg.docs.defaultTargetVersion;
  const repoSlug = repo ?? detectRepo(root);

  const wpPath = resolveFeaturePath(cfg, root, slug, 'workplan.md', {
    stage: 'inProgress',
    targetVersion: target,
  });
  const readmePath = resolveFeaturePath(cfg, root, slug, 'README.md', {
    stage: 'inProgress',
    targetVersion: target,
  });

  if (!existsSync(wpPath)) {
    throw new Error(`Workplan not found: ${wpPath}. Run /dw-lifecycle:setup first.`);
  }
  const wpContent = readFileSync(wpPath, 'utf8');

  const parent = createParentIssue({
    repo: repoSlug,
    title: `[${slug}] feature lifecycle parent`,
    body: `Parent issue for the ${slug} feature. See \`${wpPath}\` in the worktree.`,
    labels: cfg.tracking.parentLabels,
  });

  const phaseList = extractPhases(wpContent);
  const phaseRefs = createPhaseIssues({
    repo: repoSlug,
    parentNumber: parent.number,
    phases: phaseList,
    labels: cfg.tracking.phaseLabels,
  });

  // Back-fill parentIssue across the doc set. #213: the prior implementation
  // matched only the literal `<parentIssue>` template token, which is the
  // pre-render form. Hand-scaffolded files (the workaround for #209) and
  // templates that have been through the renderer carry one of:
  //   parentIssue: TBD
  //   parentIssue: <parentIssue>
  //   parentIssue:
  //   parentIssue: null
  // None of those matched; the helper silently no-op'd. Now matches the
  // YAML frontmatter `parentIssue:` line directly so any value form is
  // overwritten. Surfaces a warning when the placeholder is absent.
  const prdPath = resolveFeaturePath(cfg, root, slug, 'prd.md', {
    stage: 'inProgress',
    targetVersion: target,
  });
  const filledPaths: string[] = [];
  const skippedPaths: string[] = [];
  for (const docPath of [readmePath, prdPath]) {
    if (!existsSync(docPath)) continue;
    const original = readFileSync(docPath, 'utf8');
    const updated = backfillParentIssue(original, parent.number);
    if (updated !== original) {
      writeFileSync(docPath, updated, 'utf8');
      filledPaths.push(docPath);
    } else {
      skippedPaths.push(docPath);
    }
  }

  for (const skipped of skippedPaths) {
    process.stderr.write(
      `WARNING: could not back-fill parentIssue in ${skipped}; ` +
        `expected pattern not found. Set manually to #${parent.number}.\n`,
    );
  }

  console.log(
    JSON.stringify({ parent, phases: phaseRefs, filled: filledPaths }, null, 2),
  );
}

/**
 * Replace the `parentIssue:` value in a markdown file's frontmatter with
 * the given issue number. Matches any value form — empty, `TBD`, `null`,
 * `<parentIssue>` (template-source), or a quoted string. Returns the
 * input unchanged when no `parentIssue:` line exists in the frontmatter
 * block; the caller surfaces that as a warning.
 *
 * Only the first frontmatter block (between the opening `---` and the
 * next `---`) is touched. A `parentIssue:` line in body content
 * (extremely unlikely) is left alone.
 */
export function backfillParentIssue(content: string, parentNumber: number): string {
  // Only operate on a leading frontmatter block.
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return content;
  const fmEnd = content.indexOf('\n---\n', 4);
  if (fmEnd < 0) return content;
  const frontmatter = content.slice(0, fmEnd);
  const body = content.slice(fmEnd);
  const re = /^(parentIssue:)([ \t]*[^\n]*)$/m;
  if (!re.test(frontmatter)) return content;
  const updated = frontmatter.replace(re, `$1 "#${parentNumber}"`);
  return updated + body;
}
