/**
 * Migration-only parser: extracts per-row entries from a legacy `calendar.md`
 * so the doctor migration class can build per-entry sidecars.
 *
 * This module is independent of the legacy parser at `packages/core/src/calendar.ts`
 * (which uses a legacy Stage type with `Review` / `Paused`). The new entry-centric
 * Stage type lives in `@/schema/entry`. Legacy section names are mapped to new
 * stages via `LEGACY_STAGE_MAP` (e.g. `Paused -> Blocked`, `Review -> dropped`).
 *
 * Not used at steady-state runtime — only invoked by the doctor migration that
 * converts a legacy calendar.md into one sidecar per entry.
 */

import type { Stage } from '@/schema/entry';

export interface MigrationSourceEntry {
  currentStage: Stage;
  uuid: string;
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  source: string;
}

const LEGACY_STAGE_MAP: Record<string, Stage | null> = {
  Ideas: 'Ideas',
  Planned: 'Planned',
  Outlining: 'Outlining',
  Drafting: 'Drafting',
  Final: 'Final',
  Published: 'Published',
  Blocked: 'Blocked',
  Paused: 'Blocked',          // migration mapping: legacy Paused -> new Blocked
  Cancelled: 'Cancelled',
  Review: null,                // dropped: review is a state, not a stage in the new model
  Distribution: null,          // not a stage: shortform distribution is a separate model
};

interface Section {
  name: string;
  body: string;
}

function splitSections(md: string): Section[] {
  const sectionRe = /^## (\w+)\s*$/gm;
  const matches = [...md.matchAll(sectionRe)];
  const sections: Section[] = [];
  for (const [i, current] of matches.entries()) {
    const startOfHeader = current.index ?? 0;
    const start = startOfHeader + current[0].length;
    const next = matches[i + 1];
    const end = next ? (next.index ?? md.length) : md.length;
    sections.push({ name: current[1], body: md.slice(start, end) });
  }
  return sections;
}

export function extractEntriesForMigration(md: string): MigrationSourceEntry[] {
  const sections = splitSections(md);
  const entries: MigrationSourceEntry[] = [];

  for (const { name, body } of sections) {
    const stage = LEGACY_STAGE_MAP[name];
    if (!stage) continue;

    // Match the canonical six-column legacy row: UUID | Slug | Title | Description | Keywords | Source
    // The row regex pins on a UUID in the first column to avoid matching the header
    // and separator rows of the table (which start with `| UUID |` and `|------|`).
    const rowRe = /^\|\s*([0-9a-f-]{36})\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/gm;
    for (const m of body.matchAll(rowRe)) {
      entries.push({
        currentStage: stage,
        uuid: m[1],
        slug: m[2].trim(),
        title: m[3].trim(),
        description: m[4].trim(),
        keywords: m[5].split(',').map((s) => s.trim()).filter(Boolean),
        source: m[6].trim(),
      });
    }
  }
  return entries;
}
