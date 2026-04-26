/**
 * Shared HTML shell for studio pages. Replaces audiocontrol's `<BlogLayout>`
 * Astro component with a plain string-builder.
 */

export interface LayoutOptions {
  title: string;
  cssHrefs: string[];
  bodyHtml: string;
  /**
   * Embed a JSON payload as `<script type="application/json" id="...">`.
   * The client reads `document.getElementById(id).textContent` and
   * `JSON.parse`s it for hydration.
   */
  embeddedJson: { id: string; data: unknown } | null;
  /** Module scripts loaded after the body. */
  scriptModules: string[];
}

export function layout(options: LayoutOptions): string {
  const { title, cssHrefs, bodyHtml, embeddedJson, scriptModules } = options;

  const cssTags = cssHrefs
    .map((href) => `    <link rel="stylesheet" href="${escapeAttr(href)}">`)
    .join('\n');

  const jsonTag = embeddedJson
    ? `    <script type="application/json" id="${escapeAttr(embeddedJson.id)}">${escapeForScriptTag(JSON.stringify(embeddedJson.data))}</script>`
    : '';

  const scriptTags = scriptModules
    .map((src) => `    <script type="module" src="${escapeAttr(src)}"></script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapeHtml(title)}</title>
${cssTags}
  </head>
  <body>
${bodyHtml}
${jsonTag}
${scriptTags}
  </body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Escape a JSON payload so it's safe inside a `<script>` tag. The only
 * sequence we need to neutralize is `</script>` (and a few defense-in-
 * depth cousins) so the browser doesn't terminate the script element.
 */
function escapeForScriptTag(json: string): string {
  return json.replace(/<\/(script|!--)/gi, '<\\/$1');
}
