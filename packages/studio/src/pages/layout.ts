/**
 * Shared HTML shell for studio pages. Replaces audiocontrol's `<BlogLayout>`
 * Astro component with a plain string-builder.
 */

import { escapeHtml } from './html.ts';

export interface EmbeddedJson {
  /** `id` attribute of the `<script type="application/json">` tag. */
  id: string;
  /** Value to JSON-stringify into the tag body. */
  data: unknown;
  /** Optional extra attribute (e.g. `data-rename-slugs`). */
  attr?: string;
}

export interface LayoutOptions {
  title: string;
  cssHrefs: string[];
  bodyHtml: string;
  /**
   * Optional attributes for the `<body>` tag itself, e.g.
   * `data-review-ui="studio"`. Caller is responsible for any escaping
   * inside the string — typically these are static.
   */
  bodyAttrs?: string;
  /**
   * Embed JSON payloads as `<script type="application/json" id="...">`.
   * The client reads `document.getElementById(id).textContent` and
   * `JSON.parse`s it for hydration.
   */
  embeddedJson?: ReadonlyArray<EmbeddedJson>;
  /** Module scripts loaded after the body. */
  scriptModules: string[];
}

export function layout(options: LayoutOptions): string {
  const {
    title,
    cssHrefs,
    bodyHtml,
    bodyAttrs,
    embeddedJson,
    scriptModules,
  } = options;

  const cssTags = cssHrefs
    .map((href) => `    <link rel="stylesheet" href="${escapeAttr(href)}">`)
    .join('\n');

  const jsonTags = (embeddedJson ?? [])
    .map((j) => {
      const attrPart = j.attr ? ` ${j.attr}` : '';
      const idPart = j.id ? ` id="${escapeAttr(j.id)}"` : '';
      return `    <script type="application/json"${idPart}${attrPart}>${escapeForScriptTag(JSON.stringify(j.data))}</script>`;
    })
    .join('\n');

  const scriptTags = scriptModules
    .map((src) => `    <script type="module" src="${escapeAttr(src)}"></script>`)
    .join('\n');

  const bodyOpen = bodyAttrs ? `<body ${bodyAttrs}>` : '<body>';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapeHtml(title)}</title>
${cssTags}
  </head>
  ${bodyOpen}
${bodyHtml}
${jsonTags}
${scriptTags}
  </body>
</html>
`;
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Escape a JSON payload so it's safe inside a `<script>` tag. The only
 * sequence we need to neutralize is `</script>` (and a few defense-in-
 * depth cousins) so the browser doesn't terminate the script element.
 */
function escapeForScriptTag(json: string): string {
  return json.replace(/<\/(script|!--)/gi, '<\\/$1');
}
