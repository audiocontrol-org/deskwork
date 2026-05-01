import glossary from '@/data/glossary.json';
import { unsafe, type RawHtml } from '@/pages/html';

interface GlossaryEntry {
  term: string;
  gloss: string;
  seeAlso?: string[];
}

type GlossaryKey = keyof typeof glossary;

function isKey(s: string): s is GlossaryKey {
  return s in glossary;
}

function escapeAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Emit markup for inline glossary terms.
 *
 * Returns a `RawHtml` marker so the html template tag inlines it without escaping.
 */
export function gloss(key: GlossaryKey): RawHtml {
  if (!isKey(key)) {
    throw new Error(`unknown glossary term: ${key}`);
  }
  const entry: GlossaryEntry = glossary[key];
  const k = escapeAttr(key);
  return unsafe(
    `<span class="er-gloss" data-term="${k}" tabindex="0" role="button" aria-describedby="glossary-${k}">${escapeAttr(entry.term)}</span>`
  );
}

export type { GlossaryKey, GlossaryEntry };
