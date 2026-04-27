/**
 * Schema-patch instructions for host content collections that reject
 * the `id` frontmatter field.
 *
 * Astro's content collection schemas are strict by default — a
 * `z.object({ ... })` schema without `.passthrough()` (or an explicit
 * `id` entry) refuses files whose frontmatter carries unknown keys.
 * Phase 19 introduces `id` in frontmatter as the canonical join key, so
 * sites running strict schemas need to opt-in once.
 *
 * The `schema-rejected` doctor rule and the scaffolder both surface
 * this text when an actual schema rejection is observed at write time.
 */

const TEMPLATE = `# Host content schema must permit \`id\` in frontmatter

Deskwork binds calendar entries to markdown files via a frontmatter \`id:\`
field (UUID v4). For Astro projects with strict content collection
schemas, this means the site's \`src/content/config.ts\` must allow
\`id\` to pass through.

Pick one of the following patches and apply it to your collection
schema. Re-run the failing command after the patch.

## Option 1 — explicit \`id\` field (recommended)

\`\`\`ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    id: z.string().uuid().optional(),
    title: z.string(),
    description: z.string().optional(),
    // ...your existing fields
  }),
});

export const collections = { blog };
\`\`\`

The field is optional so legacy files without \`id\` keep validating;
deskwork sets it on every new scaffold and via \`deskwork doctor --fix=missing-frontmatter-id\`.

## Option 2 — passthrough unknown keys

\`\`\`ts
const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    // ...your existing fields
  }).passthrough(),
});
\`\`\`

Less precise but a smaller diff. Use this when the schema is wide and
you don't want to enumerate every deskwork-internal field.

## Hugo / Jekyll / Eleventy / plain markdown

These engines don't validate frontmatter against a schema; \`id\`
already passes through untouched. No patch needed.

After patching, re-run the original deskwork command. The
\`schema-rejected\` rule's findings will clear on the next
\`deskwork doctor\` audit.
`;

/**
 * Return the operator-facing schema-patch instructions. The optional
 * `collection` argument is reserved for future per-collection scoping
 * (the current implementation returns the same text regardless).
 */
export function printSchemaPatchInstructions(collection?: string): string {
  if (collection !== undefined && collection.length > 0) {
    return `${TEMPLATE}\n(Reported for collection: ${collection})\n`;
  }
  return TEMPLATE;
}
