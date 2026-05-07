/**
 * Per-site configuration for the deskwork plugin.
 *
 * Factored out of `config.ts` so the top-level parser stays small as new
 * fields land. The shape and validation rules are unchanged from the
 * pre-split implementation.
 */

/** A single site the host project publishes to. */
export interface SiteConfig {
  /**
   * Bare public hostname, no protocol (e.g. `audiocontrol.org`). Optional —
   * required only when the collection is rendered as a website. Internal-doc
   * collections, books, or tool monorepos that use deskwork purely for
   * content-lifecycle management omit this field.
   */
  host?: string;
  /** Blog content directory, relative to the project root */
  contentDir: string;
  /** Editorial calendar markdown file, relative to the project root */
  calendarPath: string;
  /** Optional cross-posting channels JSON file, relative to the project root */
  channelsPath?: string;
  /**
   * Value to set on new blog posts' `layout:` frontmatter field. Typically a
   * relative path like `../../layouts/BlogLayout.astro`. Only emitted when
   * set — projects using Astro content collections usually leave this unset
   * (layout resolution happens in the collection config instead).
   */
  blogLayout?: string;
  /**
   * Path template for scaffolded blog files, relative to `contentDir`. Uses
   * `{slug}` as the placeholder. Defaults to `"{slug}/index.md"` (directory-
   * style). Astro content collections typically use `"{slug}.md"` (flat).
   */
  blogFilenameTemplate?: string;
  /**
   * Value to set on the scaffolded post's `state:` frontmatter field. When
   * set, the line `state: <value>` is emitted. Typical value: `"draft"`.
   * Host projects that gate prod builds on `state !== "draft"` use this to
   * keep in-flight posts out of production.
   */
  blogInitialState?: string;
  /**
   * If true, the scaffolder inserts a `## Outline` section (with a placeholder
   * comment) between the H1 and the body placeholder. Default false.
   */
  blogOutlineSection?: boolean;
  /**
   * Path to the site's `_redirects` file (Netlify-style), relative to
   * the project root. The slug-rename helper appends 301 redirects here
   * when an existing post is renamed. Optional — when unset, slug-rename
   * skips the redirect-append step.
   */
  redirectsPath?: string;
}

export const REQUIRED_SITE_KEYS = ['contentDir', 'calendarPath'] as const;

export const ALLOWED_SITE_KEYS = new Set<string>([
  ...REQUIRED_SITE_KEYS,
  'host',
  'channelsPath',
  'blogLayout',
  'blogFilenameTemplate',
  'blogInitialState',
  'blogOutlineSection',
  'redirectsPath',
]);

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function parseSiteConfig(slug: string, value: unknown): SiteConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `Invalid deskwork config: site "${slug}" must be an object, got ${describe(
        value,
      )}.`,
    );
  }
  const obj = value as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_SITE_KEYS.has(key)) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has unknown key "${key}". ` +
          `Allowed keys: ${[...ALLOWED_SITE_KEYS].join(', ')}.`,
      );
    }
  }

  for (const key of REQUIRED_SITE_KEYS) {
    const v = obj[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" is missing required field "${key}" ` +
          `(must be a non-empty string).`,
      );
    }
  }

  const site: SiteConfig = {
    contentDir: obj.contentDir as string,
    calendarPath: obj.calendarPath as string,
  };

  if (obj.host !== undefined) {
    if (typeof obj.host !== 'string' || obj.host.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "host" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.host = obj.host;
  }

  if (obj.channelsPath !== undefined) {
    if (typeof obj.channelsPath !== 'string' || obj.channelsPath.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "channelsPath" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.channelsPath = obj.channelsPath;
  }

  if (obj.blogLayout !== undefined) {
    if (typeof obj.blogLayout !== 'string' || obj.blogLayout.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "blogLayout" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.blogLayout = obj.blogLayout;
  }

  if (obj.blogFilenameTemplate !== undefined) {
    if (
      typeof obj.blogFilenameTemplate !== 'string' ||
      obj.blogFilenameTemplate.length === 0
    ) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid ` +
          `"blogFilenameTemplate" (must be a non-empty string when set).`,
      );
    }
    if (!obj.blogFilenameTemplate.includes('{slug}')) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" blogFilenameTemplate ` +
          `"${obj.blogFilenameTemplate}" must contain the "{slug}" placeholder.`,
      );
    }
    site.blogFilenameTemplate = obj.blogFilenameTemplate;
  }

  if (obj.blogInitialState !== undefined) {
    if (
      typeof obj.blogInitialState !== 'string' ||
      obj.blogInitialState.length === 0
    ) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid ` +
          `"blogInitialState" (must be a non-empty string when set).`,
      );
    }
    site.blogInitialState = obj.blogInitialState;
  }

  if (obj.blogOutlineSection !== undefined) {
    if (typeof obj.blogOutlineSection !== 'boolean') {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid ` +
          `"blogOutlineSection" (must be a boolean when set).`,
      );
    }
    site.blogOutlineSection = obj.blogOutlineSection;
  }

  if (obj.redirectsPath !== undefined) {
    if (typeof obj.redirectsPath !== 'string' || obj.redirectsPath.length === 0) {
      throw new Error(
        `Invalid deskwork config: site "${slug}" has invalid "redirectsPath" ` +
          `(must be a non-empty string when set).`,
      );
    }
    site.redirectsPath = obj.redirectsPath;
  }

  return site;
}
