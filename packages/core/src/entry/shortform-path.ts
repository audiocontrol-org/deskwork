/**
 * Shortform draft path composition (Phase 39c-2b(a) — sites→lanes
 * retirement, spec AUDIT-35).
 *
 * A shortform draft is a NEW file living in the parent entry's
 * scrapbook. Its location is COMPOSED from the parent entry's stored
 * `artifactPath` directory — never searched via the slug-template /
 * `contentDir` (the path the retired slug-template shortform resolver
 * walked). This is the create-verb half of the verb
 * resolution migration: `shortform-start`, plus the shortform branches
 * of `approve` and `iterate`, all compose the same way.
 *
 *   <dir-of-parent-artifact>/scrapbook/shortform/<platform>[-<channel>].md
 */

import { dirname, join } from 'node:path';
import type { Entry } from '../schema/entry.ts';
import type { Platform } from '../types.ts';
import { resolveArtifactPathOrThrow } from './resolve-artifact.ts';

/**
 * Channel must be a kebab-case token — same shape as a slug segment so
 * the filename stays URL-safe and matches deskwork's vocabulary.
 */
const CHANNEL_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Compose the absolute path of a shortform draft for `entry` on
 * `platform` (optionally scoped to `channel`).
 *
 * The parent directory is derived from the entry's stored
 * `artifactPath` (via `resolveArtifactPathOrThrow`, which throws a
 * `doctor --fix`-pointing error when the path is absent — there is no
 * slug+stage fallback). The shortform file is then placed under
 * `scrapbook/shortform/` beside the parent artifact.
 *
 * @param entry       the PARENT entry's sidecar (the longform/Published entry)
 * @param projectRoot absolute project root
 * @param platform    distribution platform (lowercase Platform value)
 * @param channel     optional kebab-case sub-channel (e.g. `synthdiy`)
 * @throws when the channel is non-kebab-case, or the parent entry has no `artifactPath`
 */
export function composeShortformDraftPath(
  entry: Entry,
  projectRoot: string,
  platform: Platform,
  channel?: string,
): string {
  if (channel !== undefined && channel !== '' && !CHANNEL_RE.test(channel)) {
    throw new Error(
      `Invalid shortform channel "${channel}": must match ${CHANNEL_RE} ` +
        `(kebab-case, same shape as a slug segment).`,
    );
  }

  const parentArtifact = resolveArtifactPathOrThrow(entry, projectRoot);
  const entryDir = dirname(parentArtifact);
  const filename =
    channel !== undefined && channel !== ''
      ? `${platform}-${channel}.md`
      : `${platform}.md`;
  return join(entryDir, 'scrapbook', 'shortform', filename);
}
