// session-start hygiene display.
//
// Reads the latest entry from DEVELOPMENT-NOTES.md matching the active
// feature slug, locates the `### Hygiene observations` + the
// `### Next session recommendation (hygiene)` block from the previous
// session-end pass, and surfaces it verbatim. NO fresh scan happens here.
//
// Re-entry must stay cheap: this module performs zero git calls, zero gh
// calls, and zero workplan scans. Display-only.

import { existsSync, readFileSync } from 'node:fs';
import {
  HYGIENE_OBSERVATIONS_HEADING,
  NEXT_RECOMMENDATION_HEADING,
} from './session-end-hygiene.js';

export interface PriorRecommendation {
  readonly found: boolean;
  readonly block: string;
  readonly journalPath: string;
  readonly slug: string;
}

const NO_PRIOR_MESSAGE = 'No prior hygiene recommendation (first session or session-end skipped).';

export interface ReadPriorRecommendationArgs {
  readonly journalPath: string;
  readonly slug: string;
}

interface EntryRange {
  readonly startLine: number;
  readonly endLine: number;
}

function findLatestEntryRangeForSlug(
  lines: readonly string[],
  slug: string,
): EntryRange | null {
  // DEVELOPMENT-NOTES.md entries are `## YYYY-MM-DD: …` headings. Each entry
  // has a `### Feature: <slug>` line inside. The latest entry referencing
  // the slug is the most-recent `##`-heading section whose body contains
  // `### Feature: <slug>`.
  const featureLine = `### Feature: ${slug}`;
  const headingIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && /^## \d{4}-\d{2}-\d{2}/.test(line)) {
      headingIndexes.push(i);
    }
  }
  for (let i = headingIndexes.length - 1; i >= 0; i--) {
    const idx = headingIndexes[i];
    if (idx === undefined) continue;
    const next = headingIndexes[i + 1];
    const endIdx = next === undefined ? lines.length : next;
    let matchesFeature = false;
    for (let j = idx; j < endIdx; j++) {
      const lineJ = lines[j];
      if (lineJ === featureLine) {
        matchesFeature = true;
        break;
      }
    }
    if (matchesFeature) {
      return { startLine: idx, endLine: endIdx };
    }
  }
  return null;
}

function extractHygieneBlock(
  lines: readonly string[],
  range: EntryRange,
): string | null {
  let observationsIdx = -1;
  for (let i = range.startLine; i < range.endLine; i++) {
    if (lines[i] === HYGIENE_OBSERVATIONS_HEADING) {
      observationsIdx = i;
      break;
    }
  }
  if (observationsIdx === -1) return null;
  // Block runs from `### Hygiene observations` through the end of the
  // entry OR up to (but not including) the next `## ` date heading. We
  // include both `### Hygiene observations` and
  // `### Next session recommendation (hygiene)` sections; we DO NOT include
  // any subsequent `### ` siblings.
  let endIdx = range.endLine;
  let sawRecommendation = false;
  for (let i = observationsIdx + 1; i < range.endLine; i++) {
    const line = lines[i];
    if (line === NEXT_RECOMMENDATION_HEADING) {
      sawRecommendation = true;
      continue;
    }
    if (line !== undefined && line.startsWith('### ')) {
      if (sawRecommendation) {
        endIdx = i;
        break;
      }
    }
  }
  return lines.slice(observationsIdx, endIdx).join('\n').replace(/\s+$/, '');
}

export function readPriorRecommendation(
  args: ReadPriorRecommendationArgs,
): PriorRecommendation {
  const { journalPath, slug } = args;
  if (!existsSync(journalPath)) {
    return { found: false, block: NO_PRIOR_MESSAGE, journalPath, slug };
  }
  const content = readFileSync(journalPath, 'utf8');
  const lines = content.split('\n');
  const range = findLatestEntryRangeForSlug(lines, slug);
  if (range === null) {
    return { found: false, block: NO_PRIOR_MESSAGE, journalPath, slug };
  }
  const block = extractHygieneBlock(lines, range);
  if (block === null) {
    return { found: false, block: NO_PRIOR_MESSAGE, journalPath, slug };
  }
  return { found: true, block, journalPath, slug };
}

export const NO_PRIOR_RECOMMENDATION_MESSAGE = NO_PRIOR_MESSAGE;
