const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const TARGET_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$|^[A-Za-z0-9]$/;

export function validateSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}": must be lowercase alphanumeric with optional hyphens, starting and ending with alphanumeric.`
    );
  }
}

export function validateTargetVersion(targetVersion: string): void {
  if (!TARGET_VERSION_RE.test(targetVersion)) {
    throw new Error(
      `Invalid target version "${targetVersion}": must be alphanumeric with optional dots or hyphens, starting and ending with alphanumeric.`
    );
  }
}
