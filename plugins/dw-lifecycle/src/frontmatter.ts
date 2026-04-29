import { parseDocument, Document, stringify } from 'yaml';

/**
 * Symbol used to attach the original YAML Document to parsed frontmatter data.
 * The property is non-enumerable so it is invisible to deep-equality checks
 * (Object.keys, for-in, JSON.stringify) while remaining accessible for
 * round-trip serialisation.
 */
export const YAML_DOC_SYM: unique symbol = Symbol('yaml-doc');

/** Plain frontmatter data with an optional hidden Document for round-trips. */
export type FrontmatterData = Record<string, unknown> & {
  readonly [YAML_DOC_SYM]?: Document;
};

export interface ParsedFrontmatter {
  data: FrontmatterData;
  body: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

export function parseFrontmatter(source: string): ParsedFrontmatter {
  const match = FRONTMATTER_RE.exec(source);
  if (!match) {
    return { data: {}, body: source };
  }
  const yamlBlock = match[1] ?? '';
  const rawBody = match[2] ?? '';
  const body = rawBody.startsWith('\n') ? rawBody.slice(1) : rawBody;

  const doc = parseDocument(yamlBlock);
  const jsonData = (doc.toJSON() ?? {}) as Record<string, unknown>;

  const data: FrontmatterData = { ...jsonData };
  Object.defineProperty(data, YAML_DOC_SYM, {
    value: doc,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return { data, body };
}

/**
 * Serialise frontmatter data and body back to a markdown string.
 *
 * If `data` carries a hidden YAML Document (attached by `parseFrontmatter`),
 * that document is used for serialisation so the original scalar quoting
 * styles are preserved verbatim.  Otherwise a fresh stringify pass is used.
 */
export function writeFrontmatter(data: FrontmatterData, body: string): string {
  const doc: Document | undefined = data[YAML_DOC_SYM];
  const yaml =
    doc !== undefined ? doc.toString().trimEnd() : stringify(data, { lineWidth: 0 }).trimEnd();
  const bodyPart = body.startsWith('\n') ? body : '\n' + body;
  return `---\n${yaml}\n---\n${bodyPart}`;
}

/**
 * Return a new markdown string with only the specified keys patched.
 * All other frontmatter keys and the body are preserved unchanged.
 */
export function updateFrontmatter(source: string, patch: Record<string, unknown>): string {
  const { data, body } = parseFrontmatter(source);
  const merged: FrontmatterData = { ...data, ...patch };
  return writeFrontmatter(merged, body);
}
