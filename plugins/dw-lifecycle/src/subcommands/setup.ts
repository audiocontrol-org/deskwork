import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { resolveFeatureDir } from '../docs.js';
import { repoRoot, expandWorktreeName } from '../repo.js';
import { validateSlug, validateTargetVersion } from '../slug.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

interface SetupArgs {
  slug: string;
  targetVersion?: string;
  title?: string;
  definitionFile?: string;
}

interface FeatureDefinitionSections {
  problem?: string;
  goal?: string;
  scope?: string;
  approach?: string;
  tasks?: string;
  acceptanceCriteria?: string;
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

function extractSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeading) {
      return;
    }
    sections[currentHeading] = currentLines.join('\n').trim();
  };

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      flush();
      currentHeading = line.slice(3).trim();
      currentLines = [];
      continue;
    }
    if (currentHeading) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function parseFeatureDefinition(markdown: string): FeatureDefinitionSections {
  const sections = extractSections(markdown);
  return {
    problem: sections.Problem,
    goal: sections.Goal,
    scope: sections.Scope,
    approach: sections.Approach,
    tasks: sections.Tasks,
    acceptanceCriteria: sections['Acceptance Criteria'],
  };
}

function extractScopeList(scope: string | undefined, label: 'In' | 'Out'): string[] {
  if (!scope) {
    return [];
  }

  const lines = scope.split('\n');
  const items: string[] = [];
  let collecting = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === `**${label}:**`) {
      collecting = true;
      continue;
    }
    if (line === '**In:**' || line === '**Out:**') {
      collecting = false;
      continue;
    }
    if (!collecting) {
      continue;
    }
    if (line.startsWith('- ')) {
      items.push(line.replace(/^- /, '').trim());
    }
  }

  return items.filter(Boolean);
}

function extractCheckboxItems(section: string | undefined): string[] {
  if (!section) {
    return [];
  }

  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^- \[[ xX]\] /.test(line))
    .map((line) => line.replace(/^- \[[ xX]\] /, '').trim())
    .filter(Boolean);
}

function sentenceOrFallback(text: string | undefined, fallback: string): string {
  if (!text) {
    return fallback;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function seedPrdFromDefinition(prd: string, definition: FeatureDefinitionSections): string {
  const goal = sentenceOrFallback(
    definition.goal,
    '[Describe the proposed solution at a high level. What changes for the user? What is the shape of the deliverable? Again, one or two paragraphs — leave specifics for the Technical Approach section.]'
  );
  const problem = sentenceOrFallback(
    definition.problem,
    '[Describe the problem this feature solves. Who experiences friction today? What is the cost of the status quo? Keep this to one or two paragraphs of plain prose — no implementation detail yet.]'
  );
  const approach = sentenceOrFallback(
    definition.approach,
    '[Describe the high-level technical strategy. Identify major architectural decisions, key dependencies, and any new components or interfaces. This section should give a reader enough context to start the workplan without prescribing line-level implementation.]'
  );

  const acceptanceItems = extractCheckboxItems(definition.acceptanceCriteria);
  const acceptanceBlock =
    acceptanceItems.length > 0
      ? acceptanceItems.map((item) => `- [ ] ${item}`).join('\n')
      : '- [ ] [First user-visible criterion that must hold for this feature to be considered complete]';

  const outOfScopeItems = extractScopeList(definition.scope, 'Out');
  const outOfScopeBlock =
    outOfScopeItems.length > 0
      ? outOfScopeItems.map((item) => `- ${item}`).join('\n')
      : '- [Capability or change that is explicitly NOT part of this feature]';

  return prd
    .replace(
      /## Problem Statement\n\n[\s\S]*?(?=\n## Solution)/,
      `## Problem Statement\n\n${problem}\n`
    )
    .replace(/## Solution\n\n[\s\S]*?(?=\n## Acceptance Criteria)/, `## Solution\n\n${goal}\n`)
    .replace(
      /## Acceptance Criteria\n\n[\s\S]*?(?=\n## Out of Scope)/,
      `## Acceptance Criteria\n\n${acceptanceBlock}\n`
    )
    .replace(/## Out of Scope\n\n[\s\S]*?(?=\n## Technical Approach)/, `## Out of Scope\n\n${outOfScopeBlock}\n`)
    .replace(/## Technical Approach\n\n[\s\S]*$/, `## Technical Approach\n\n${approach}\n`);
}

function seedWorkplanFromDefinition(workplan: string, definition: FeatureDefinitionSections): string {
  const goal = sentenceOrFallback(
    definition.goal,
    '[Describe the deliverable for this feature in one sentence.]'
  );
  const taskItems = extractCheckboxItems(definition.tasks);
  const stepBlock =
    taskItems.length > 0
      ? taskItems.map((item, index) => `- [ ] Step ${index + 1}: ${item}`).join('\n')
      : '- [ ] Step 1: [step description]\n- [ ] Step 2: [step description]';
  const acceptanceItems = extractCheckboxItems(definition.acceptanceCriteria);
  const acceptanceBlock =
    acceptanceItems.length > 0
      ? acceptanceItems.map((item) => `- [ ] ${item}`).join('\n')
      : '- [ ] [criterion]';

  return workplan
    .replace(
      '**Goal:** [Describe the deliverable for this feature in one sentence.]',
      `**Goal:** ${goal}`
    )
    .replace(
      /### Task 1: \[task name\]\n\n[\s\S]*?(?=\n\*\*Acceptance Criteria:\*\*)/,
      `### Task 1: Initial implementation slice\n\n${stepBlock}\n`
    )
    .replace(/\*\*Acceptance Criteria:\*\*\n[\s\S]*$/, `**Acceptance Criteria:**\n${acceptanceBlock}\n`);
}

function branchExists(root: string, branchName: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'rev-parse', '--verify', `refs/heads/${branchName}`], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export async function setup(args: string[]): Promise<void> {
  const { slug, targetVersion, title, definitionFile } = parseArgs(args);
  validateSlug(slug);
  if (targetVersion) {
    validateTargetVersion(targetVersion);
  }
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

  // Pre-flight: definition file must exist before we create the worktree, so a typo
  // doesn't strand the user with a worktree they need to clean up.
  if (definitionFile && !existsSync(definitionFile)) {
    throw new Error(`Definition file not found: ${definitionFile}`);
  }

  // Create branch + worktree off the current HEAD (avoids hardcoding "main").
  execFileSync('git', ['-C', root, 'worktree', 'add', worktreePath, '-b', branchName, 'HEAD'], {
    stdio: 'inherit',
  });

  // From this point on the worktree exists. If anything below fails, roll it back
  // so the user isn't left with a half-scaffolded feature directory.
  try {
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
      deskworkId: randomUUID(),
    };

    for (const filename of ['prd.md', 'workplan.md', 'readme.md']) {
      const tpl = readFileSync(join(TEMPLATES_DIR, filename), 'utf8');
      const out = renderTemplate(tpl, vars);
      const targetPath = join(docsDir, filename === 'readme.md' ? 'README.md' : filename);
      writeFileSync(targetPath, out, 'utf8');
    }

    // Optionally seed PRD/workplan content from a feature-definition.md file.
    if (definitionFile) {
      const defContent = readFileSync(definitionFile, 'utf8');
      const definition = parseFeatureDefinition(defContent);
      const prdPath = join(docsDir, 'prd.md');
      const wpPath = join(docsDir, 'workplan.md');
      const prd = readFileSync(prdPath, 'utf8');
      const wp = readFileSync(wpPath, 'utf8');
      writeFileSync(prdPath, seedPrdFromDefinition(prd, definition), 'utf8');
      writeFileSync(wpPath, seedWorkplanFromDefinition(wp, definition), 'utf8');
    }

    console.log(
      JSON.stringify({ slug, target, branch: branchName, worktreePath, docsDir }, null, 2)
    );
  } catch (err) {
    const origMessage = err instanceof Error ? err.message : String(err);
    let rollbackOk = true;
    try {
      execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', worktreePath], {
        stdio: 'ignore',
      });
    } catch {
      rollbackOk = false;
    }
    try {
      execFileSync('git', ['-C', root, 'branch', '-D', branchName], {
        stdio: 'ignore',
      });
    } catch {
      rollbackOk = false;
    }
    if (rollbackOk) {
      throw new Error(
        `Setup failed during scaffolding: ${origMessage}. Worktree and branch rolled back.`
      );
    }
    throw new Error(
      `Setup failed during scaffolding: ${origMessage}. Manual cleanup required: git worktree remove --force ${worktreePath} && git branch -D ${branchName}`
    );
  }
}
