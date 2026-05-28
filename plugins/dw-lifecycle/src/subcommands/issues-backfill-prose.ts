/**
 * Prose-layer back-fills for the `dw-lifecycle issues` verb.
 *
 * The verb's existing back-fill writes the parent issue number into the
 * `parentIssue:` frontmatter field of the PRD + README. Operators have
 * to hand-edit three other surfaces to match: workplan phase headings,
 * the README Status table, and the README Key Links "Parent Issue:"
 * prose line. This module performs those three edits as pure
 * string-in / string-out transforms so each can be tested in isolation
 * and the call site stays a thin orchestration.
 *
 * Idempotency: each function detects an already-back-filled value and
 * replaces in place (rather than re-appending) so re-runs converge.
 *
 * Targeted edits: each function changes only the lines that match its
 * pattern. Other prose stays untouched.
 */

export interface PhaseIssueLink {
  /** Phase heading text as extracted by `extractPhases` (e.g. `"Phase 1: Foo"`). */
  name: string;
  /** Issue number for this phase. */
  number: number;
  /** Full URL to the GitHub issue. */
  url: string;
}

/**
 * Walk the workplan markdown for `## Phase N: <name>` headings and
 * append ` · [#NNN](url)` to each. If a heading already carries the
 * trailing link form, the existing link is replaced (idempotent
 * re-run).
 *
 * Matching is positional: the i-th `## Phase` heading receives the
 * i-th entry in `phases`. We do not attempt fuzzy-match on the
 * heading text — `createPhaseIssues` itself preserved order, so
 * positional alignment is correct.
 */
export function backfillWorkplanPhaseHeadings(
  workplan: string,
  phases: readonly PhaseIssueLink[],
): string {
  if (phases.length === 0) return workplan;
  const lines = workplan.split('\n');
  let phaseIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!/^## Phase \d+/.test(line)) continue;
    const phase = phases[phaseIdx];
    if (!phase) break;
    // Strip any existing trailing `· [#NNN](url)` link (idempotent
    // re-run) and trailing whitespace before appending.
    const stripped = line.replace(/[ \t]*·[ \t]*\[#\d+\]\([^)]+\)\s*$/, '').trimEnd();
    lines[i] = `${stripped}  ·  [#${phase.number}](${phase.url})`;
    phaseIdx++;
  }
  return lines.join('\n');
}

/**
 * Walk the README markdown for the Status table under `## Status` and
 * back-fill issue links.
 *
 * Two scenarios:
 *
 * - **Template placeholder** — the table has the 3-column shape from
 *   `/dw-lifecycle:setup` (`| Phase | Description | Status |` header,
 *   a single `| 1 | [Phase 1 name] | Not started |` row). We widen
 *   the table to 4 columns and emit one row per phase from the
 *   workplan + a row each for any Closing milestones detected.
 *
 * - **Operator-rewritten** — the table is already 4 columns with
 *   real phase rows. We only update the Issue column for rows whose
 *   leading phase number matches a created issue; the rest of the
 *   prose (Description, Status) is left untouched.
 *
 * If no `## Status` section is present, the input is returned
 * unchanged.
 */
export function backfillReadmeStatusTable(
  readme: string,
  phases: readonly PhaseIssueLink[],
  workplanPhases: readonly { name: string }[],
): string {
  const statusIdx = findSectionHeadingIndex(readme, 'Status');
  if (statusIdx < 0) return readme;
  const lines = readme.split('\n');

  // Locate the table block immediately after the heading (allow blank
  // lines before the header row).
  let cursor = statusIdx + 1;
  while (cursor < lines.length && lines[cursor]?.trim() === '') cursor += 1;
  if (cursor >= lines.length) return readme;
  const headerLine = lines[cursor];
  if (!headerLine || !headerLine.trim().startsWith('|')) return readme;

  // Find table boundary — consecutive lines starting with `|`.
  let tableStart = cursor;
  let tableEnd = cursor;
  while (tableEnd < lines.length && lines[tableEnd]?.trim().startsWith('|')) {
    tableEnd += 1;
  }
  // tableEnd is exclusive.

  const tableLines = lines.slice(tableStart, tableEnd);
  const newTable = rewriteStatusTable(tableLines, phases, workplanPhases);
  return [
    ...lines.slice(0, tableStart),
    ...newTable,
    ...lines.slice(tableEnd),
  ].join('\n');
}

function rewriteStatusTable(
  tableLines: readonly string[],
  phases: readonly PhaseIssueLink[],
  workplanPhases: readonly { name: string }[],
): string[] {
  const headerLine = tableLines[0];
  if (!headerLine) return [...tableLines];
  const headerCells = parseRow(headerLine);
  const isTemplatePlaceholder = isTemplateStatusTable(tableLines);

  if (isTemplatePlaceholder) {
    return renderFullStatusTable(phases, workplanPhases);
  }

  // Operator-rewritten path. Locate the Issue column; if absent, no-op
  // (don't widen an operator-shaped table).
  const issueColIdx = headerCells.findIndex((c) => c.trim().toLowerCase() === 'issue');
  if (issueColIdx < 0) return [...tableLines];

  const phaseByNumber = new Map<number, PhaseIssueLink>();
  phases.forEach((p, i) => {
    phaseByNumber.set(i + 1, p);
  });

  const output: string[] = [];
  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    if (!line) {
      output.push('');
      continue;
    }
    // Header (i=0) and alignment row (i=1) pass through untouched.
    if (i < 2) {
      output.push(line);
      continue;
    }
    const cells = parseRow(line);
    const phaseNumStr = cells[0]?.trim();
    if (!phaseNumStr) {
      output.push(line);
      continue;
    }
    const phaseNum = parseInt(phaseNumStr, 10);
    if (!Number.isFinite(phaseNum)) {
      output.push(line);
      continue;
    }
    const link = phaseByNumber.get(phaseNum);
    if (!link) {
      output.push(line);
      continue;
    }
    const updated = [...cells];
    updated[issueColIdx] = ` [#${link.number}](${link.url}) `;
    output.push(formatRow(updated));
  }
  return output;
}

function renderFullStatusTable(
  phases: readonly PhaseIssueLink[],
  workplanPhases: readonly { name: string }[],
): string[] {
  const out: string[] = [];
  out.push('| Phase | Description | Issue | Status |');
  out.push('|---|---|---|---|');
  phases.forEach((phase, i) => {
    const wp = workplanPhases[i];
    const desc = wp ? stripPhasePrefix(wp.name) : stripPhasePrefix(phase.name);
    out.push(`| ${i + 1} | ${desc} | [#${phase.number}](${phase.url}) | Not started |`);
  });
  return out;
}

/**
 * The `/dw-lifecycle:setup` template emits exactly:
 *
 *     | Phase | Description | Status |
 *     |---|---|---|
 *     | 1 | [Phase 1 name] | Not started |
 *
 * Detect that shape so we don't clobber an operator-rewritten table.
 */
function isTemplateStatusTable(tableLines: readonly string[]): boolean {
  if (tableLines.length < 3) return false;
  const header = parseRow(tableLines[0] ?? '');
  if (header.length !== 3) return false;
  if (header[0]?.trim().toLowerCase() !== 'phase') return false;
  if (header[2]?.trim().toLowerCase() !== 'status') return false;
  // The row count alone isn't load-bearing — what matters is that
  // SOME row in the table still carries the literal placeholder. The
  // template ships one such row; an operator-rewritten table won't.
  const placeholderRe = /\[Phase \d+ name\]/;
  return tableLines.some((line) => placeholderRe.test(line));
}

function parseRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return [];
  // Drop leading and trailing pipes, then split.
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|');
}

function formatRow(cells: readonly string[]): string {
  const padded = cells.map((cell) => {
    const inner = cell.trim();
    return ` ${inner} `;
  });
  return `|${padded.join('|')}|`;
}

/**
 * `extractPhases` produces `name` like `"Phase 1: Foo bar"`. The
 * Status table's Description column carries just `"Foo bar"`.
 */
function stripPhasePrefix(name: string): string {
  return name.replace(/^Phase \d+\s*[:—-]\s*/, '').trim();
}

/**
 * Fill the `- Parent Issue:` bullet under `## Key Links` with a
 * markdown link to the parent issue.
 *
 * Idempotent — if the bullet already carries `[#NNN](url)`, the
 * existing value is replaced. If the section or bullet is missing,
 * the input is returned unchanged (caller surfaces a warning).
 */
export function backfillReadmeKeyLinksParent(
  readme: string,
  parent: { number: number; url: string },
): string {
  const keyLinksIdx = findSectionHeadingIndex(readme, 'Key Links');
  if (keyLinksIdx < 0) return readme;
  const lines = readme.split('\n');

  for (let i = keyLinksIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    // Stop at the next section heading.
    if (/^##\s/.test(line)) break;
    const match = /^(\s*-\s*Parent Issue:)\s*(.*)$/.exec(line);
    if (!match) continue;
    const prefix = match[1] ?? '- Parent Issue:';
    lines[i] = `${prefix} [#${parent.number}](${parent.url})`;
    return lines.join('\n');
  }
  return readme;
}

/**
 * Locate the line index of a `## <heading>` H2. Returns -1 if absent.
 */
function findSectionHeadingIndex(content: string, heading: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === `## ${heading}`) return i;
  }
  return -1;
}
