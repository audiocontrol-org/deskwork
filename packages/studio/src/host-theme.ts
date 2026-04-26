/**
 * Auto-discover the host project's blog theming so the review page's
 * edit/review pane styles its article body to match the host's actual
 * blog. Zero-config: walks conventional paths near the configured
 * contentDir and collects CSS files plus inline `<style>` blocks from
 * any layout files Astro-style components contain.
 *
 * Scope is intentionally narrow — only the longform review page consumes
 * these assets. The dashboard, shortform desk, help page, and scrapbook
 * keep deskwork's own press-check theme.
 *
 * Convention paths walked, relative to `<contentDir>/..`:
 *   - styles/*.css                     (any CSS file)
 *   - layouts/*.astro                  (extract <style> blocks)
 *   - components/*.astro               (extract <style> blocks)
 *
 * Astro `<style>` blocks compile to scoped selectors at build time.
 * For deskwork's purposes we want them global so they apply to the
 * article body inside the review pane, so we strip the `is:global`
 * attribute (already-global) and emit the CSS as-is. Astro's scoping
 * suffix is added at compile, not present in source — extracting from
 * source gives globally-applicable CSS.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { resolveContentDir } from '@deskwork/core/paths';

export interface HostThemeAsset {
  /** filename used in the URL: `/static/host-theme/<site>/<filename>` */
  filename: string;
  /** raw CSS body */
  content: string;
}

/**
 * Discover host blog CSS for a given site. Reads from disk every call —
 * the studio is dev-only and host CSS may change between page loads, so
 * caching would force operators to restart the server after edits.
 */
export function discoverHostTheme(
  projectRoot: string,
  config: DeskworkConfig,
  site: string,
): HostThemeAsset[] {
  const contentDir = resolveContentDir(projectRoot, config, site);
  // Walk up from the content dir to find the site root. For the audiocontrol
  // convention `src/sites/<site>/content/blog`, the site root is two levels
  // up; for flat-layout projects it might be `<root>/src` or `<root>`. We
  // probe each candidate.
  const candidates = [
    resolve(contentDir, '..', '..'),  // src/sites/<site>/
    resolve(contentDir, '..'),        // simpler layouts
  ];

  const assets: HostThemeAsset[] = [];

  for (const siteRoot of candidates) {
    if (!existsSync(siteRoot)) continue;
    const styles = collectStylesDir(siteRoot);
    for (const a of styles) assets.push(a);
    const layoutInline = collectInlineStyles(siteRoot, 'layouts');
    if (layoutInline) assets.push(layoutInline);
    const componentInline = collectInlineStyles(siteRoot, 'components');
    if (componentInline) assets.push(componentInline);
    // Stop after the first siteRoot that yielded any assets — we don't want
    // to merge unrelated style trees from sibling layouts.
    if (assets.length > 0) break;
  }

  return assets;
}

function collectStylesDir(siteRoot: string): HostThemeAsset[] {
  const dir = join(siteRoot, 'styles');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: HostThemeAsset[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.css')) continue;
    out.push({
      filename: name,
      content: readFileSync(join(dir, name), 'utf-8'),
    });
  }
  return out;
}

function collectInlineStyles(
  siteRoot: string,
  subdir: 'layouts' | 'components',
): HostThemeAsset | null {
  const dir = join(siteRoot, subdir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  const blocks: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.astro')) continue;
    const src = readFileSync(join(dir, name), 'utf-8');
    const extracted = extractStyleBlocks(src);
    if (extracted) blocks.push(`/* ===== ${subdir}/${name} ===== */\n${extracted}`);
  }
  if (blocks.length === 0) return null;
  return {
    filename: `${subdir}-inline.css`,
    content: blocks.join('\n\n'),
  };
}

/** Extract every `<style>...</style>` block from .astro source. Strips the
 *  `is:global` Astro directive — irrelevant outside Astro's compiler. */
export function extractStyleBlocks(src: string): string {
  const blocks: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    blocks.push(m[1].trim());
  }
  return blocks.join('\n\n');
}

/** URL prefix for served theme assets. */
export const HOST_THEME_URL_PREFIX = '/static/host-theme';

/** Build the public URL for a discovered asset. */
export function hostThemeUrl(site: string, filename: string): string {
  return `${HOST_THEME_URL_PREFIX}/${encodeURIComponent(site)}/${encodeURIComponent(filename)}`;
}
