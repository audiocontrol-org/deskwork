/**
 * deskwork-review-start — enqueue a longform draft for review.
 *
 * Reads the blog markdown from disk (honoring the site's
 * blogFilenameTemplate) and creates a longform review workflow in state
 * `open`. Idempotent on (site, slug, contentKind='longform'): if a
 * non-terminal workflow already matches, the existing one is returned.
 *
 * Usage:
 *   deskwork-review-start <project-root> [--site <slug>] <slug>
 *
 * Emits a JSON result with the workflow id, the `existing` flag, and a
 * report of any divergence between disk and the workflow's current
 * version (agent iterate work mid-flight).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readConfig } from '@deskwork/core/config';
import { resolveSite, resolveBlogFilePath } from '@deskwork/core/paths';
import { createWorkflow, readVersions } from '@deskwork/core/review/pipeline';
import { bodyState } from '@deskwork/core/body-state';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site'] as const;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail('Usage: deskwork-review-start <project-root> [--site <slug>] <slug>', 2);
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (!SLUG_RE.test(slug)) {
    fail(`invalid slug: ${slug} (must match ${SLUG_RE})`);
  }

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);
  const file = resolveBlogFilePath(projectRoot, config, site, slug);

  if (!existsSync(file)) {
    const siblings = listSiblingSlugs(file);
    const list = siblings.length > 0 ? siblings.join(', ') : '(none)';
    fail(
      `No blog markdown at ${file}.\n` +
        `Existing slugs on ${site}: ${list}.\n` +
        `Run /deskwork:outline <slug> (or /deskwork:draft) to scaffold it first.`,
    );
  }

  const initialMarkdown = readFileSync(file, 'utf8');
  const body = bodyState(file);

  // createWorkflow is idempotent. Capture `before` to detect whether a
  // fresh workflow was created vs an existing one matched.
  const before = Date.now();
  const workflow = createWorkflow(projectRoot, config, {
    site,
    slug,
    contentKind: 'longform',
    initialMarkdown,
    initialOriginatedBy: 'agent',
  });
  const fresh = Date.parse(workflow.createdAt) >= before;

  // SSOT check: if disk differs from the workflow's current version, report
  // — do NOT auto-commit (the iterate flow handles its own snapshot).
  let divergence: { diskLen: number; versionLen: number } | null = null;
  if (!fresh) {
    const versions = readVersions(projectRoot, config, workflow.id);
    const current = versions.find((v) => v.version === workflow.currentVersion);
    if (current && current.markdown !== initialMarkdown) {
      divergence = {
        diskLen: initialMarkdown.length,
        versionLen: current.markdown.length,
      };
    }
  }

  emit({
    workflowId: workflow.id,
    site: workflow.site,
    slug: workflow.slug,
    state: workflow.state,
    version: workflow.currentVersion,
    fresh,
    bodyState: body,
    divergence,
  });

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }

  function listSiblingSlugs(blogFile: string): string[] {
    const dir = dirname(blogFile);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => name.replace(/\.md$/, ''));
  }
}
