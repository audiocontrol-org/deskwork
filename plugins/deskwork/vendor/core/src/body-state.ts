/**
 * Classify whether a scaffolded blog post's body is still the placeholder
 * or has been replaced with real prose.
 *
 * The scaffold produced by `scaffoldBlogPost` writes an H1, optionally a
 * `## Outline` section, and a `<!-- Write your post here -->` placeholder.
 * The outline is a legitimate authored artifact during Outlining; its
 * presence must NOT make the body look written. This helper strips the
 * outline and classifies what remains:
 *
 *   - `missing`     — file does not exist
 *   - `placeholder` — file exists but body (minus outline) is only the
 *                     placeholder marker and whitespace
 *   - `written`     — file exists and prose remains after placeholder + outline
 *                     are accounted for
 *
 * Used by the review/studio surfaces to branch on whether a post has
 * actually been drafted, not just scaffolded.
 */

import { existsSync, readFileSync } from 'node:fs';

export type BodyState = 'missing' | 'placeholder' | 'written';

/** The body-placeholder marker written by scaffoldBlogPost. Exact string. */
export const PLACEHOLDER_MARKER = '<!-- Write your post here -->';

/**
 * Strip the `## Outline` section (heading through the next H2 or EOF)
 * so its content doesn't masquerade as body prose.
 */
function stripOutlineSection(body: string): string {
  const lines = body.split('\n');
  const startIdx = lines.findIndex((line) => /^##[ \t]+Outline\b/.test(line));
  if (startIdx < 0) return body;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##[ \t]+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return [...lines.slice(0, startIdx), ...lines.slice(endIdx)].join('\n');
}

/**
 * Classify the body of a scaffolded blog post at `filePath`.
 */
export function bodyState(filePath: string): BodyState {
  if (!existsSync(filePath)) return 'missing';
  const content = readFileSync(filePath, 'utf8');

  // `\r?\n` mirrors `frontmatter.ts`'s FRONTMATTER_RE so files saved
  // with Windows line endings classify the same way as `\n`-only files.
  const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;

  const withoutH1 = body.replace(/^\s*#[^\n]*\n?/, '');
  const withoutOutline = stripOutlineSection(withoutH1);

  const trimmed = withoutOutline.trim();
  if (trimmed === PLACEHOLDER_MARKER) return 'placeholder';
  if (trimmed === '') return 'placeholder';

  const withoutPlaceholder = trimmed.replace(PLACEHOLDER_MARKER, '').trim();
  return withoutPlaceholder.length > 0 ? 'written' : 'placeholder';
}
