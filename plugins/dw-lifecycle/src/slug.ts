const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}": must be lowercase alphanumeric with optional hyphens, starting and ending with alphanumeric.`
    );
  }
}
