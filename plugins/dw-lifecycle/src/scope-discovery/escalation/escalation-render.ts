/**
 * plugins/dw-lifecycle/src/scope-discovery/escalation/escalation-render.ts
 *
 * Markdown renderer for `EscalationRequest`.
 *
 * The operator opens the pending JSON artifact AND a co-located
 * `.md` view of the same data in their editor. The markdown is
 * the operator-readable surface; the JSON is the durable record
 * the queue reads back when `resolveEscalation` is called.
 *
 * # Format
 *
 *   - Heading with the escalation id + queued-at timestamp.
 *   - "Action proposed" block — the imperative the orchestrator
 *     wants approval for.
 *   - "Question" block — the explicit question.
 *   - "Reasoning" block — the orchestrator's narrative.
 *   - "Evidence" block — summary + links + excerpts.
 *   - "Options" block — bullet list, one per option, with id badge
 *     so the operator can name the option in their decision.
 *   - "Operator decision" footer — a placeholder section the
 *     operator fills in with their pick. The renderer prints
 *     guidance prose; the operator overwrites the placeholder with
 *     their decision.
 *
 * The renderer does NOT write to disk; callers persist the
 * output if they want it on disk. (The queue itself stores the
 * JSON; the markdown is a "view" of the JSON, regenerated on
 * demand.)
 *
 * # Resolved escalations
 *
 * When `request.resolution !== null` the renderer prints a
 * RESOLVED banner + the operator's verbatim decision + the
 * resolved-at timestamp. Operators inspecting the resolved-
 * escalations dir get the full history without opening the JSON.
 */

import type { EscalationRequest } from './escalation-types.js';

/**
 * Render an escalation as a single markdown string.
 *
 * Pure: no I/O, no side effects, deterministic given the input.
 */
export function renderEscalationMarkdown(request: EscalationRequest): string {
  const lines: string[] = [];
  lines.push(renderHeader(request));
  lines.push('');
  if (request.resolution !== null) {
    lines.push(renderResolvedBanner(request));
    lines.push('');
  }
  lines.push(renderSection('Action proposed', request.actionProposed));
  lines.push('');
  lines.push(renderSection('Question', request.question));
  lines.push('');
  lines.push(renderSection('Reasoning', request.reasoning));
  lines.push('');
  lines.push(renderEvidence(request));
  lines.push('');
  lines.push(renderOptions(request));
  lines.push('');
  lines.push(renderDecisionFooter(request));
  // Trailing newline keeps `diff` clean.
  return `${lines.join('\n')}\n`;
}

function renderHeader(request: EscalationRequest): string {
  return [
    `# Escalation ${request.id}`,
    '',
    `Queued at: ${request.queuedAt}`,
  ].join('\n');
}

function renderResolvedBanner(request: EscalationRequest): string {
  // The resolution branch is guarded by the caller, but keep the
  // narrowing local so the type-checker is happy.
  const resolution = request.resolution;
  if (resolution === null) return '';
  const selected =
    resolution.selectedOptionId === null
      ? '(free-form decision)'
      : `option \`${resolution.selectedOptionId}\``;
  return [
    `> RESOLVED at ${resolution.resolvedAt} — ${selected}`,
    '>',
    `> Decision taken: ${indentBlock(resolution.decisionTaken, '> ')}`,
  ].join('\n');
}

function renderSection(title: string, body: string): string {
  return [`## ${title}`, '', body].join('\n');
}

function renderEvidence(request: EscalationRequest): string {
  const lines: string[] = ['## Evidence', '', request.evidence.summary];
  if (request.evidence.links.length > 0) {
    lines.push('');
    lines.push('Links:');
    for (const link of request.evidence.links) {
      lines.push(`- ${link}`);
    }
  }
  if (request.evidence.excerpts.length > 0) {
    lines.push('');
    lines.push('Excerpts:');
    for (const excerpt of request.evidence.excerpts) {
      lines.push('');
      lines.push('```');
      lines.push(excerpt);
      lines.push('```');
    }
  }
  return lines.join('\n');
}

function renderOptions(request: EscalationRequest): string {
  const lines: string[] = ['## Options', ''];
  for (const option of request.options) {
    lines.push(`- \`${option.id}\` — ${option.summary}`);
    if (option.detail !== undefined) {
      // Two-space hanging indent for the detail bullet so the markdown
      // renders as a nested item under the option.
      lines.push(`  ${option.detail}`);
    }
  }
  return lines.join('\n');
}

function renderDecisionFooter(request: EscalationRequest): string {
  if (request.resolution !== null) {
    return [
      '## Operator decision',
      '',
      '_Already resolved — see the RESOLVED banner above._',
    ].join('\n');
  }
  const optionIds = request.options.map((opt) => `\`${opt.id}\``).join(' | ');
  return [
    '## Operator decision',
    '',
    'Replace this placeholder with your decision. You can either:',
    '',
    `- Name one of the option ids (${optionIds}) on its own line, optionally with prose explaining the choice. The next \`/dw-lifecycle:implement\` invocation will read your decision and pass it back through the resolution machinery.`,
    `- Write a free-form decision below; the orchestrator will record it verbatim and reason from there.`,
    '',
    '<!-- BEGIN OPERATOR DECISION -->',
    '',
    '(write your decision here)',
    '',
    '<!-- END OPERATOR DECISION -->',
  ].join('\n');
}

/**
 * Indent a multi-line block by `prefix`, keeping the first line flush
 * with the existing prefix the caller already wrote. Used inside the
 * RESOLVED blockquote so multi-line decisions render as continuation
 * lines of the blockquote.
 */
function indentBlock(text: string, prefix: string): string {
  const lines = text.split('\n');
  if (lines.length <= 1) return text;
  return [
    lines[0] ?? '',
    ...lines.slice(1).map((line) => `${prefix}${line}`),
  ].join('\n');
}

/**
 * Extract the operator's decision from a markdown view they edited.
 *
 * The renderer emits sentinel comments `<!-- BEGIN OPERATOR DECISION -->`
 * and `<!-- END OPERATOR DECISION -->`; this function reads the content
 * between them and returns the trimmed decision. Returns `null` when
 * either sentinel is missing OR when the section is empty / left as
 * the placeholder `(write your decision here)`.
 *
 * The orchestrator uses this to read back the operator's decision from
 * the markdown view; the JSON is the durable record (via
 * `resolveEscalation`).
 */
export function extractOperatorDecision(markdown: string): string | null {
  const begin = markdown.indexOf('<!-- BEGIN OPERATOR DECISION -->');
  const end = markdown.indexOf('<!-- END OPERATOR DECISION -->');
  if (begin === -1 || end === -1 || end <= begin) {
    return null;
  }
  const body = markdown
    .slice(begin + '<!-- BEGIN OPERATOR DECISION -->'.length, end)
    .trim();
  if (body.length === 0) return null;
  // The placeholder line the renderer emits when no decision is present.
  if (body === '(write your decision here)') return null;
  return body;
}

/**
 * Best-effort match: scan a decision string for the first occurrence of
 * any option id (as a standalone token surrounded by whitespace or
 * punctuation). Returns the matched option id, or `null` when no
 * option id is mentioned. Used by the orchestrator to populate
 * `selectedOptionId` when reading back a markdown decision.
 *
 * The regex is intentionally simple — operators who want to be
 * unambiguous reference the option id verbatim; this function does NOT
 * guess at intent when the decision is prose-only.
 */
export function matchOperatorOptionId(
  decision: string,
  optionIds: ReadonlyArray<string>,
): string | null {
  for (const id of optionIds) {
    // Escape regex special chars in the id so option ids with `-`, `.`
    // etc. match literally.
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`);
    if (re.test(decision)) return id;
  }
  return null;
}
