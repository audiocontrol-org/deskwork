/**
 * Schema-patch instructions for host content collections that reject
 * the deskwork frontmatter binding.
 *
 * Astro's content collection schemas are strict by default — a
 * `z.object({ ... })` schema without `.passthrough()` (or an explicit
 * entry for the deskwork namespace) refuses files whose frontmatter
 * carries unknown keys. Phase 19 introduced the binding key in
 * frontmatter; v0.7.2 (Issue #38) moved it under a `deskwork:`
 * namespace so deskwork doesn't claim the global top-level keyspace.
 *
 * The `schema-rejected` doctor rule and the scaffolder both surface
 * this text when an actual schema rejection is observed at write time.
 */

const TEMPLATE = `# Host content schema must permit the \`deskwork\` namespace in frontmatter

Deskwork binds calendar entries to markdown files via a UUID written
under a \`deskwork:\` mapping in frontmatter (\`deskwork.id\`, UUID v4).
For Astro projects with strict content collection schemas, this means
the site's \`src/content/config.ts\` must allow the namespace to pass
through.

Note: top-level \`id:\` is NOT what to add — that field belongs to the
operator's keyspace. Deskwork no longer claims it.

Pick one of the following patches and apply it to your collection
schema. Re-run the failing command after the patch.

## Option 1 — explicit \`deskwork\` namespace (recommended)

\`\`\`ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    deskwork: z.object({ id: z.string().uuid() }).passthrough().optional(),
    title: z.string(),
    description: z.string().optional(),
    // ...your existing fields
  }),
});

export const collections = { blog };
\`\`\`

The \`deskwork\` block is optional so legacy files without it keep
validating; deskwork sets it on every new scaffold and via
\`deskwork doctor --fix=missing-frontmatter-id\` /
\`--fix=legacy-top-level-id-migration\`. The inner \`.passthrough()\`
leaves room for additional deskwork-scoped fields without forcing a
schema change every release.

## Option 2 — passthrough unknown keys at the top level

\`\`\`ts
const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    // ...your existing fields
  }).passthrough(),
});
\`\`\`

Less precise but a smaller diff. Top-level \`.passthrough()\` accepts
any extra keys — including the entire \`deskwork:\` namespace — without
complaint. Use this when the schema is wide and you don't want to
enumerate every deskwork-internal field.

## Hugo / Jekyll / Eleventy / plain markdown

These engines don't validate frontmatter against a schema; the
\`deskwork:\` mapping already passes through untouched. No patch
needed.

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
