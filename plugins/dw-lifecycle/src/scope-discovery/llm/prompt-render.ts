/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/prompt-render.ts
 *
 * Render the judge / auditor prompt templates with the per-turn inputs.
 *
 * The templates live under `plugins/dw-lifecycle/templates/scope-
 * discovery/{judge-prompt.md, audit-prompt.md}` (NEW in Phase 11
 * Task 7). They use `{{placeholder}}` syntax for the four well-known
 * slots; the renderer substitutes one section at a time with a
 * deterministic markdown serialization of the input.
 *
 * Why a hand-rolled renderer instead of a templating library: the
 * dispatch-wrapper grammar is sensitive to free-form content (the
 * forbidden-deferral phrases). A heavy templating layer hides the
 * final rendered text behind another abstraction; a plain string
 * substitution keeps the rendered prompt auditable byte-for-byte.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from '../util/typeguards.js';
import type {
  AuditorInput,
  CatalogStateSummary,
  JudgeDispositionProposal,
  JudgeInput,
  OpenCandidate,
  RecentWorkSummary,
} from './types.js';

/**
 * Locate the templates directory relative to THIS source file. Compiled
 * output sits under `dist/scope-discovery/llm/prompt-render.js`; the
 * templates live at `templates/scope-discovery/<file>.md` two levels
 * above. We resolve from the current file's URL to be agnostic to
 * whether the runtime is workspace-dev (tsx) or installed (compiled).
 */
function templatesDir(): string {
  const here = fileURLToPath(import.meta.url);
  // tsx workspace dev: <plugin>/src/scope-discovery/llm/prompt-render.ts
  // compiled: <plugin>/dist/scope-discovery/llm/prompt-render.js
  // both have <plugin>/templates/scope-discovery as the target.
  return resolve(here, '..', '..', '..', '..', 'templates', 'scope-discovery');
}

export const JUDGE_TEMPLATE_PATH = 'judge-prompt.md';
export const AUDIT_TEMPLATE_PATH = 'audit-prompt.md';

async function loadTemplate(name: string): Promise<string> {
  const path = resolve(templatesDir(), name);
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(
      `llm/prompt-render: cannot read template ${path}: ${errorMessage(err)}`,
    );
  }
}

function renderRecentWork(rw: RecentWorkSummary): string {
  const parts: string[] = [];
  if (rw.lastCommit !== undefined) {
    parts.push(
      `- Last commit: ${rw.lastCommit.sha} — ${rw.lastCommit.subject}`,
    );
  }
  if (rw.lastDispatch !== undefined) {
    parts.push(
      `- Last sub-agent dispatch: ${rw.lastDispatch.agentType} (Searched: ${rw.lastDispatch.searched}; Included: ${rw.lastDispatch.includedCount}; Excluded: ${rw.lastDispatch.excludedCount})`,
    );
  }
  if (rw.lastCatalogEdit !== undefined) {
    parts.push(
      `- Last catalog edit: ${rw.lastCatalogEdit.registryPath} entry \`${rw.lastCatalogEdit.entryId}\` (${rw.lastCatalogEdit.previousStatus ?? '(none)'} → ${rw.lastCatalogEdit.nextStatus})`,
    );
  }
  if (rw.extraContext !== undefined) {
    for (const c of rw.extraContext) parts.push(`- ${c}`);
  }
  if (parts.length === 0) {
    return '(no recent work to report — first turn or scratch state)';
  }
  return parts.join('\n');
}

function renderOpenCandidates(cs: ReadonlyArray<OpenCandidate>): string {
  if (cs.length === 0) {
    return '(no open candidates — catalog is fully triaged)';
  }
  const parts: string[] = [];
  for (const c of cs) {
    const registry = c.registryPath !== undefined ? ` [${c.registryPath}]` : '';
    parts.push(
      `- \`${c.id}\`${registry} — status=${c.currentStatus}\n` +
        `    description: ${c.description}\n` +
        `    evidence: ${c.evidence.length === 0 ? '(none provided)' : c.evidence.join('; ')}`,
    );
  }
  return parts.join('\n');
}

function renderCatalogState(cs: CatalogStateSummary): string {
  const counts = Object.entries(cs.statusCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const lines: string[] = [
    `- Total entries: ${cs.totalEntries}`,
    `- Status counts: ${counts}`,
  ];
  if (cs.perRegistry !== undefined) {
    const per = Object.entries(cs.perRegistry)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`- Per registry: ${per}`);
  }
  return lines.join('\n');
}

function renderJudgeProposals(
  ps: ReadonlyArray<JudgeDispositionProposal>,
): string {
  if (ps.length === 0) {
    return '(judge emitted no proposals this turn)';
  }
  const parts: string[] = [];
  for (const p of ps) {
    parts.push(
      `PROPOSAL: ${p.candidateId}\n` +
        `  status: ${p.proposedStatus}\n` +
        `  confidence: ${p.confidence.toFixed(2)}\n` +
        `  reasoning: ${p.reasoning}`,
    );
  }
  return parts.join('\n\n');
}

function substitute(
  template: string,
  replacements: Record<string, string>,
): string {
  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

/**
 * Render the judge prompt with the per-turn JudgeInput populated into
 * the template's four well-known slots.
 */
export async function renderJudgePrompt(input: JudgeInput): Promise<string> {
  const template = await loadTemplate(JUDGE_TEMPLATE_PATH);
  return substitute(template, {
    featureSlug: input.featureSlug,
    recentWork: `\n${renderRecentWork(input.recentWork)}\n`,
    openCandidates: `\n${renderOpenCandidates(input.openCandidates)}\n`,
    catalogState: `\n${renderCatalogState(input.catalogState)}\n`,
  });
}

/**
 * Render the auditor prompt with the per-turn AuditorInput populated.
 * The auditor sees the judge's proposals so it has the information it
 * needs to dispute.
 */
export async function renderAuditPrompt(input: AuditorInput): Promise<string> {
  const template = await loadTemplate(AUDIT_TEMPLATE_PATH);
  return substitute(template, {
    featureSlug: input.featureSlug,
    recentWork: `\n${renderRecentWork(input.recentWork)}\n`,
    judgeProposals: `\n${renderJudgeProposals(input.judgeProposals)}\n`,
    catalogState: `\n${renderCatalogState(input.catalogState)}\n`,
  });
}
