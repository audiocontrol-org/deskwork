/**
 * Tiny markdown renderer used by the scrapbook viewer for the
 * `data-kind="md"` body render on first expand.
 *
 * Handles headings, paragraphs, emphasis, links, code blocks (fenced),
 * inline code, lists, blockquotes, and pipe tables. Enough for
 * note-shaped content; not a full CommonMark impl. Carried forward
 * verbatim from the v0.6.0 client (#29) — kept in its own module so
 * the scrapbook-client.ts orchestration stays under the file-size cap.
 */

export function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inCode: string | null = null;
  let listBuf: string[] = [];
  let listOrdered = false;
  let paraBuf: string[] = [];
  let quoteBuf: string[] = [];

  const flushList = (): void => {
    if (listBuf.length === 0) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag}>${listBuf.map((l) => `<li>${inline(l)}</li>`).join('')}</${tag}>`);
    listBuf = [];
  };
  const flushPara = (): void => {
    if (paraBuf.length === 0) return;
    out.push(`<p>${inline(paraBuf.join(' '))}</p>`);
    paraBuf = [];
  };
  const flushQuote = (): void => {
    if (quoteBuf.length === 0) return;
    out.push(`<blockquote>${inline(quoteBuf.join(' '))}</blockquote>`);
    quoteBuf = [];
  };
  const flushAll = (): void => { flushList(); flushPara(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (inCode === null) { flushAll(); inCode = ''; }
      else { out.push(`<pre><code>${escapeHtml(inCode)}</code></pre>`); inCode = null; }
      continue;
    }
    if (inCode !== null) { inCode += line + '\n'; continue; }

    // GFM pipe table: header row, then separator, then body rows.
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushAll();
      const header = splitTableRow(line);
      const bodyRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        bodyRows.push(splitTableRow(lines[j]));
        j++;
      }
      out.push(renderTable(header, bodyRows));
      i = j - 1;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushAll(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }

    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushList(); flushPara(); quoteBuf.push(q[1]); continue; }

    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) { flushPara(); flushQuote(); if (!listOrdered && listBuf.length) flushList(); listOrdered = false; listBuf.push(ul[1]); continue; }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) { flushPara(); flushQuote(); if (!listOrdered && listBuf.length) flushList(); listOrdered = true; listBuf.push(ol[1]); continue; }

    if (/^\s*---+\s*$/.test(line)) { flushAll(); out.push('<hr />'); continue; }
    if (line.trim() === '') { flushAll(); continue; }

    flushList(); flushQuote();
    paraBuf.push(line);
  }
  flushAll();
  if (inCode !== null) out.push(`<pre><code>${escapeHtml(inCode)}</code></pre>`);
  return out.join('\n');
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function renderTable(header: string[], rows: string[][]): string {
  const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return `<table>${thead}${tbody}</table>`;
}

function inline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}
