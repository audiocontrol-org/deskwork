/**
 * Scrapbook seed helpers — scaffolding written at plan time so every
 * Planned article gets a scrapbook home with a templated README.
 */

import { existsSync } from 'node:fs';
import type { DeskworkConfig } from '../config.ts';
import { _createScrapbookMarkdownSlug } from './crud-slug.ts';
import { _scrapbookFilePathSlug } from './paths.ts';
import type { ScrapbookItem } from './types.ts';

/**
 * Seed a scrapbook's `README.md` at plan time. Idempotent — if the
 * README already exists, returns null without touching it. Used by
 * the plan skill so every Planned article gets a scrapbook home with
 * a template that names the article and invites receipts.
 *
 * Slug-keyed because plan-time callers operate against a freshly-
 * minted calendar entry whose on-disk file may not yet exist; the
 * slug-template path is the only stable address available at that
 * stage. Routes through the private slug-template helpers internally.
 */
export function seedScrapbookReadme(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
  slug: string,
  title: string,
): ScrapbookItem | null {
  const abs = _scrapbookFilePathSlug(projectRoot, config, site, slug, 'README.md');
  if (existsSync(abs)) return null;
  const now = new Date().toISOString().slice(0, 10);
  const body = [
    `# Scrapbook — ${title}`,
    '',
    `Planned ${now}. Working notes, research, receipts, and references`,
    `for the \`${slug}\` dispatch. Committed to git alongside the article;`,
    'not baked to the public site.',
    '',
    '## Receipts',
    '',
    '- ',
    '',
    '## Notes',
    '',
    '- ',
    '',
    '## References',
    '',
    '- ',
    '',
  ].join('\n');
  return _createScrapbookMarkdownSlug(
    projectRoot,
    config,
    site,
    slug,
    'README.md',
    body,
  );
}
