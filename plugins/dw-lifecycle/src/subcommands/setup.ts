import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { resolveFeatureDir } from '../docs.js';
import { repoRoot, expandWorktreeName } from '../repo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

interface SetupArgs {
  slug: string;
  targetVersion?: string;
  title?: string;
  definitionFile?: string;
}

function nextArg(args: string[], i: number): string {
  const v = args[i];
  if (v === undefined) {
    const flag = args[i - 1] ?? '<flag>';
    throw new Error(`Missing value for ${flag}`);
  }
  return v;
}

function parseArgs(args: string[]): SetupArgs {
  let slug: string | undefined;
  let targetVersion: string | undefined;
  let title: string | undefined;
  let definitionFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--target') {
      targetVersion = nextArg(args, ++i);
    } else if (a === '--title') {
      title = nextArg(args, ++i);
    } else if (a === '--definition') {
      definitionFile = nextArg(args, ++i);
    } else if (!slug && !a.startsWith('--')) {
      slug = a;
    }
  }

  if (!slug) {
    throw new Error(
      'Usage: dw-lifecycle setup <slug> [--target <version>] [--title <title>] [--definition <path>]'
    );
  }
  return { slug, targetVersion, title, definitionFile };
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/<(\w+)>/g, (m, key) => vars[key] ?? m);
}

function branchExists(root: string, branchName: string): boolean {
  try {
    execSync(`git -C "${root}" rev-parse --verify "refs/heads/${branchName}"`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export async function setup(args: string[]): Promise<void> {
  const { slug, targetVersion, title, definitionFile } = parseArgs(args);
  const root = repoRoot();
  const cfg = loadConfig(root);
  const target = targetVersion ?? cfg.docs.defaultTargetVersion;

  if (!existsSync(TEMPLATES_DIR)) {
    throw new Error(`Templates dir not found: ${TEMPLATES_DIR}`);
  }

  const dir = resolveFeatureDir(cfg, root, slug, { stage: 'inProgress', targetVersion: target });
  if (existsSync(dir)) {
    throw new Error(`Feature directory already exists: ${dir}. Refusing to overwrite.`);
  }

  // Pre-flight: branch + worktree path collisions
  const branchName = `${cfg.branches.prefix}${slug}`;
  if (branchExists(root, branchName)) {
    throw new Error(`Branch already exists: ${branchName}`);
  }

  const worktreePath = join(dirname(root), expandWorktreeName(cfg.worktrees.naming, slug, root));
  if (existsSync(worktreePath)) {
    throw new Error(`Worktree path already exists: ${worktreePath}`);
  }

  // Create branch + worktree off the current HEAD (avoids hardcoding "main").
  execSync(`git -C "${root}" worktree add "${worktreePath}" -b "${branchName}" HEAD`, {
    stdio: 'inherit',
  });

  // Scaffold docs in the new worktree
  const docsDir = resolveFeatureDir(cfg, worktreePath, slug, {
    stage: 'inProgress',
    targetVersion: target,
  });
  mkdirSync(docsDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const vars: Record<string, string> = {
    slug,
    title: title ?? slug,
    targetVersion: target,
    date: today,
    branch: branchName,
    parentIssue: '',
  };

  for (const filename of ['prd.md', 'workplan.md', 'readme.md']) {
    const tpl = readFileSync(join(TEMPLATES_DIR, filename), 'utf8');
    const out = renderTemplate(tpl, vars);
    const targetPath = join(docsDir, filename === 'readme.md' ? 'README.md' : filename);
    writeFileSync(targetPath, out, 'utf8');
  }

  // Optionally seed workplan content from a feature-definition.md file
  if (definitionFile && existsSync(definitionFile)) {
    const defContent = readFileSync(definitionFile, 'utf8');
    const wpPath = join(docsDir, 'workplan.md');
    const wp = readFileSync(wpPath, 'utf8');
    writeFileSync(
      wpPath,
      wp + '\n<!-- Definition imported from: ' + definitionFile + ' -->\n' + defContent + '\n',
      'utf8'
    );
  }

  console.log(JSON.stringify({ slug, target, branch: branchName, worktreePath, docsDir }, null, 2));
}
