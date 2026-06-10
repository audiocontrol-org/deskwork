// Markdown → normalized block stream (FR-002, research integration pattern).
//
// Pipeline: blank engine chrome (frontmatter + the single grammar comment) so
// line numbers are preserved → markdown-it `md.parse` → one normalized line per
// content block, `<KIND>\t<TEXT>`, with each entry carrying its ORIGINAL
// markdown line span. The grammar parses `normalized`; peggy's
// `location().start.line` (1-based) indexes `entries` directly, and a Unit's
// span back-maps to original markdown lines for archive/curate to cut/move.

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { blankChrome } from './chrome.js';
import type { BlockEntry, BlockStream, Span } from './types.js';

// Cell separator for table rows — a control char that cannot appear in markdown
// cell text, so the grammar can address columns by position unambiguously.
export const CELL_SEP = '\x1f';

const md = new MarkdownIt();

/** markdown-it `token.map` ([start0, end0Exclusive]) → 1-based inclusive span. */
function toSpan(map: [number, number] | null): Span {
  if (map === null) {
    throw new Error('block-stream: block token has no source map');
  }
  return { startLine: map[0] + 1, endLine: map[1] };
}

/** Collapse internal whitespace to single spaces for the normalized payload. */
function norm(text: string): string {
  return text.replace(/[\t\n]+/g, ' ').trim();
}

function nextInlineContent(tokens: readonly Token[], i: number): string {
  const inline = tokens[i + 1];
  return inline !== undefined ? inline.content : '';
}

function collectRowCells(tokens: readonly Token[], trOpenIndex: number): string {
  const cells: string[] = [];
  for (let j = trOpenIndex + 1; j < tokens.length; j++) {
    const t = tokens[j]!;
    if (t.type === 'tr_close') break;
    if (t.type === 'inline') cells.push(norm(t.content));
  }
  return cells.join(CELL_SEP);
}

/**
 * Build the normalized block stream for a markdown document. Container tokens
 * (lists, blockquotes, table wrappers) carry no own line — their inner content
 * blocks (list-item paragraphs, table rows) emit the lines, which is what
 * surfaces a `**Status:**` body bullet or a table data row to the grammar.
 */
export function buildBlockStream(source: string): BlockStream {
  const tokens = md.parse(blankChrome(source), {});
  const entries: BlockEntry[] = [];
  let inThead = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1));
        entries.push({ kind: `H${level}`, text: norm(nextInlineContent(tokens, i)), span: toSpan(t.map) });
        break;
      }
      case 'paragraph_open':
        entries.push({ kind: 'P', text: norm(nextInlineContent(tokens, i)), span: toSpan(t.map) });
        break;
      case 'fence':
      case 'code_block':
        entries.push({ kind: 'CODE', text: '', span: toSpan(t.map) });
        break;
      case 'hr':
        entries.push({ kind: 'HR', text: '', span: toSpan(t.map) });
        break;
      // No `html_block` arm: the engine constructs MarkdownIt with `html:false`,
      // so raw HTML (`<div>…</div>`) is never tokenized as an `html_block` — it
      // normalizes to a paragraph (`paragraph_open`) and is carried as an opaque
      // `P` body. Enabling `html:true` would change parsing for all documents,
      // which is out of scope.
      case 'thead_open':
        inThead = true;
        break;
      case 'tbody_open':
        inThead = false;
        break;
      case 'tr_open':
        entries.push({
          kind: inThead ? 'THEAD' : 'ROW',
          text: collectRowCells(tokens, i),
          span: toSpan(t.map),
        });
        break;
      default:
        // Container/closing tokens (list/blockquote/table wrappers, *_close,
        // inline) carry no normalized line of their own.
        break;
    }
  }

  const normalized = entries.map((e) => `${e.kind}\t${e.text}`).join('\n');
  return { normalized, entries };
}
