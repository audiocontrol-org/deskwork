import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { sidecarsDir } from '../sidecar/paths.ts';
import { EntrySchema, type Entry, type Stage } from '../schema/entry.ts';
import { renderCalendar } from '../calendar/render.ts';

export interface RepairOptions {
  destructive: boolean;
}

export interface RepairResult {
  applied: string[];
  pendingDestructive: string[];
}

/**
 * Stage-conventional artifact path. Mirrors `artifactPathForStage` in
 * validate.ts (kept here to avoid a cross-import; both files reach for
 * the same canonical mapping). Returns null for stages with no on-disk
 * artifact.
 */
function artifactPathForStage(projectRoot: string, slug: string, stage: Stage): string | null {
  switch (stage) {
    case 'Ideas':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md');
    case 'Planned':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'plan.md');
    case 'Outlining':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'outline.md');
    case 'Drafting':
    case 'Final':
    case 'Published':
      return join(projectRoot, 'docs', slug, 'index.md');
    case 'Blocked':
    case 'Cancelled':
      return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * #182 Phase 34 ship-pass — backfill `artifactPath` on sidecars that
 * lack the field but where the slug+stage heuristic resolves to a real
 * file. The validator's `missing-artifact-path` rule surfaces the gap;
 * this writer fixes it.
 *
 * Mutates each affected sidecar and returns a list of changed entry
 * UUIDs. Idempotent: re-running on already-fixed entries is a no-op.
 */
async function backfillArtifactPaths(
  projectRoot: string,
  entries: Entry[],
  sidecarPaths: Map<string, string>,
): Promise<string[]> {
  const changed: string[] = [];
  for (const entry of entries) {
    if (entry.artifactPath !== undefined && entry.artifactPath !== '') continue;
    const heuristicAbs = artifactPathForStage(projectRoot, entry.slug, entry.currentStage);
    if (!heuristicAbs) continue;
    if (!(await fileExists(heuristicAbs))) continue;
    const sidecarPath = sidecarPaths.get(entry.uuid);
    if (!sidecarPath) continue;
    const relPath = relative(projectRoot, heuristicAbs);
    const updated: Entry = { ...entry, artifactPath: relPath };
    await writeFile(sidecarPath, JSON.stringify(updated, null, 2));
    changed.push(entry.uuid);
  }
  return changed;
}

export async function repairAll(projectRoot: string, opts: RepairOptions): Promise<RepairResult> {
  void opts;
  const result: RepairResult = { applied: [], pendingDestructive: [] };

  // Regenerate calendar.md from sidecars
  const dir = sidecarsDir(projectRoot);
  let names: string[] = [];
  try { names = await readdir(dir); } catch { return result; }

  const entries: Entry[] = [];
  const sidecarPaths = new Map<string, string>();
  for (const name of names.filter(n => n.endsWith('.json'))) {
    const sidecarPath = join(dir, name);
    const raw = await readFile(sidecarPath, 'utf8');
    try {
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        entries.push(parsed.data);
        sidecarPaths.set(parsed.data.uuid, sidecarPath);
      }
    } catch { /* skip malformed */ }
  }

  // #182 — backfill missing artifactPath BEFORE regenerating calendar
  // so the calendar render uses the freshly-stamped paths if it
  // consumes them downstream.
  const backfilled = await backfillArtifactPaths(projectRoot, entries, sidecarPaths);
  if (backfilled.length > 0) {
    // Re-load the entries so the calendar render sees the stamped
    // paths (the in-memory `entries` array is now stale for those
    // UUIDs).
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e || !backfilled.includes(e.uuid)) continue;
      const sidecarPath = sidecarPaths.get(e.uuid);
      if (!sidecarPath) continue;
      const raw = await readFile(sidecarPath, 'utf8');
      const parsed = EntrySchema.safeParse(JSON.parse(raw));
      if (parsed.success) entries[i] = parsed.data;
    }
    result.applied.push(`artifact-path-backfilled (${backfilled.length} entrie(s))`);
  }

  const md = renderCalendar(entries);
  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
  await mkdir(dirname(calendarPath), { recursive: true });
  await writeFile(calendarPath, md);
  result.applied.push('calendar-regenerated');

  return result;
}
