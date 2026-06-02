/**
 * Stage name → filesystem-safe token (Phase 4 Task 4.1.6 / Phase 3 M-8).
 *
 * Snapshot filenames, scrapbook layout, and any other filesystem path
 * that embeds a stage name need a deterministic, ASCII, lowercase,
 * filesystem-safe representation. Editorial stages happen to map
 * cleanly through `String.prototype.toLowerCase()`
 * (`Drafting` -> `drafting`), but a lane-template may declare a stage
 * named `"My Stage"`, `"In Review"`, `"PROD/Staging"`, or include
 * non-ASCII characters — all of which would either produce a
 * filesystem-fragile name (`my stage.md`) or be rejected outright by
 * some filesystems (`prod/staging.md` collides with directory
 * separators).
 *
 * The helper enforces a strict, well-defined contract so the operator
 * sees the failure mode at template-author time rather than discovering
 * it later when a verb tries to write a snapshot.
 *
 * Tokenization rules:
 *
 *   1. Trim leading/trailing whitespace.
 *   2. Lowercase.
 *   3. Replace any run of whitespace with a single `-`.
 *   4. Reject any character that is not in `[a-z0-9-_]` after the above.
 *
 * Examples:
 *
 *   "Drafting"        → "drafting"
 *   "My Stage"        → "my-stage"
 *   "In   Review"     → "in-review"   (collapses internal whitespace)
 *   "stage-1"         → "stage-1"     (already valid)
 *   "PROD/Staging"    → throws        ('/' rejected)
 *   "Café"       → throws        (non-ASCII rejected)
 *   ""                → throws        (empty input rejected)
 *
 * The helper does NOT silently fold non-ASCII characters via
 * transliteration. Folding `café` to `cafe` is a guess about
 * operator intent; the safer behavior is to refuse and let the
 * operator pick the canonical token explicitly.
 */

/**
 * Convert a stage name into a filesystem-safe token suitable for use
 * in filenames and path segments.
 *
 * @param stage - The human-readable stage name (e.g. `"Drafting"`,
 *   `"My Stage"`). Must be a non-empty string after trimming.
 * @returns The tokenized form (lowercase, kebab-case, ASCII-only).
 * @throws When the input is empty (after trim), or contains
 *   characters outside `[a-z0-9-_]` after the whitespace-to-hyphen
 *   collapse. The error message names the offending input so an
 *   operator can locate the template field.
 */
export function stageNameToFilesystemToken(stage: string): string {
  if (typeof stage !== 'string') {
    throw new Error(
      `stageNameToFilesystemToken: expected a string, received ${typeof stage}.`,
    );
  }
  const trimmed = stage.trim();
  if (trimmed.length === 0) {
    throw new Error(
      `stageNameToFilesystemToken: stage name cannot be empty or whitespace-only.`,
    );
  }
  // Lowercase + collapse whitespace into hyphens.
  const collapsed = trimmed.toLowerCase().replace(/\s+/g, '-');
  // Validate the final result is ASCII-only, lowercase, kebab-case (or
  // snake-case — underscores are permitted because they are filesystem-
  // safe and common in operator-authored stage names).
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(collapsed)) {
    throw new Error(
      `stageNameToFilesystemToken: stage name "${stage}" cannot be safely tokenized for use ` +
        `as a filesystem path segment. ` +
        `After lowercasing and collapsing whitespace, the result was "${collapsed}", which ` +
        `contains characters outside the allowed set [a-z0-9-_] (must start with [a-z0-9]). ` +
        `Rename the stage in the lane's pipeline template to use only ASCII letters, digits, ` +
        `spaces, hyphens, or underscores.`,
    );
  }
  return collapsed;
}
