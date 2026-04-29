import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../config.js';
import { resolveFeaturePath } from '../docs.js';
import { repoRoot } from '../repo.js';
import { createParentIssue, createPhaseIssues } from '../tracking-github.js';
import { validateSlug } from '../slug.js';

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

  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, 'utf8');
    const updatedReadme = readme.replace(/<parentIssue>/g, `#${parent.number}`);
    writeFileSync(readmePath, updatedReadme, 'utf8');
  }

  console.log(JSON.stringify({ parent, phases: phaseRefs }, null, 2));
}
